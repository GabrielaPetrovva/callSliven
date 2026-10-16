-- 015_logs_jobs_outbox.sql
-- 1) Журнали за сигурност и система (30 дни, без лични данни)
-- 2) Планирани задачи през pg_cron, всяка със запис в system_events при грешка
-- 3) Опашка за имейли към потребители (отхвърлен сигнал, сигурностни известия)
-- 4) Броячи за таблото на администратора
-- Имейлите за регистрация и забравена парола изпраща Supabase Auth през собствения SMTP; тук не са.

-- ===== Журнали =====

create table public.security_events (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  event_type  text not null check (event_type ~ '^[a-z_.]{3,60}$'),   -- напр. turnstile_failed, rate_limited
  user_id     uuid,                                                   -- без връзка към auth.users
  ip_hash     text check (ip_hash is null or char_length(ip_hash) <= 128),
  details     jsonb not null default '{}'::jsonb check (pg_column_size(details) <= 2000)
);
create index security_events_created_idx on public.security_events (created_at);
create index security_events_type_idx on public.security_events (event_type, created_at desc);

create table public.system_events (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  source      text not null check (char_length(source) between 2 and 60),   -- име на задача или Edge Function
  level       text not null check (level in ('info', 'warning', 'error')),
  message     text not null check (char_length(message) <= 500),
  details     jsonb not null default '{}'::jsonb check (pg_column_size(details) <= 2000)
);
create index system_events_created_idx on public.system_events (created_at);
create index system_events_level_idx on public.system_events (level, created_at desc);

alter table public.security_events enable row level security;
alter table public.system_events   enable row level security;
create policy security_events_super_admin_read on public.security_events
  for select to authenticated using ((select public.is_super_admin()));
create policy system_events_super_admin_read on public.system_events
  for select to authenticated using ((select public.is_super_admin()));
revoke all on public.security_events, public.system_events from anon, authenticated;
grant select on public.security_events, public.system_events to authenticated;

-- Запис от Edge Function. Не се подават имейли, телефони или текст на сигнали.
create function public.log_security_event(
  p_type    text,
  p_user_id uuid  default null,
  p_ip_hash text  default null,
  p_details jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.security_events (event_type, user_id, ip_hash, details)
  values (p_type, p_user_id, p_ip_hash, coalesce(p_details, '{}'::jsonb));
$$;

create function public.log_system_event(
  p_source  text,
  p_level   text,
  p_message text,
  p_details jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.system_events (source, level, message, details)
  values (p_source, p_level, left(p_message, 500), coalesce(p_details, '{}'::jsonb));
$$;

-- Проверка за живост (за пинга към Edge Function; пази безплатния проект от паузиране)
create function public.health_check()
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select now() from public.app_settings limit 1;
$$;

revoke execute on function public.log_security_event(text, uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.log_system_event(text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.health_check() from public, anon, authenticated;
grant execute on function public.log_security_event(text, uuid, text, jsonb) to service_role;
grant execute on function public.log_system_event(text, text, text, jsonb) to service_role;
grant execute on function public.health_check() to service_role;

-- ===== Опашка за имейли =====

create table public.email_outbox (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  kind        text not null check (kind in ('report_rejected', 'security_notice')),
  user_id     uuid not null,                       -- получателят; адресът се чете от auth.users при изпращане
  report_id   uuid references public.reports (id) on delete cascade,
  data        jsonb not null default '{}'::jsonb check (pg_column_size(data) <= 2000),
  status      text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed')),
  attempts    integer not null default 0,
  last_error  text check (last_error is null or char_length(last_error) <= 500)
);
create index email_outbox_queue_idx on public.email_outbox (status, updated_at) where status in ('queued', 'sending');
alter table public.email_outbox enable row level security;
revoke all on public.email_outbox from anon, authenticated;       -- никой клиент; само функциите по-долу

-- Отхвърлен сигнал: известие до подателя
create function public.outbox_on_reject()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.email_outbox (kind, user_id, report_id)
  values ('report_rejected', new.user_id, new.report_id);
  return new;
end;
$$;
create trigger report_private_reject_notify
  after update of reject_reason on public.report_private
  for each row
  when (old.reject_reason is null and new.reject_reason is not null and new.user_id is not null)
  execute function public.outbox_on_reject();

-- Сигурностни известия: промяна на роля (до засегнатия) и достъп до контакти (до другите Super Admin)
create function public.outbox_on_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.action = 'user.role_changed' and new.entity_id ~ '^[0-9a-f-]{36}$' then
    insert into public.email_outbox (kind, user_id, data)
    select 'security_notice', p.id, jsonb_build_object('action', new.action, 'audit_id', new.id)
    from public.profiles p where p.id = new.entity_id::uuid;
  elsif new.action = 'contact.accessed' then
    insert into public.email_outbox (kind, user_id, data)
    select 'security_notice', p.id, jsonb_build_object('action', new.action, 'audit_id', new.id)
    from public.profiles p
    where p.role = 'super_admin' and p.active and p.id is distinct from new.actor_id;
  end if;
  return new;
exception when others then
  -- известието никога не бива да блокира записа в журнала
  insert into public.system_events (source, level, message) values ('outbox_on_audit', 'error', left(sqlerrm, 500));
  return new;
end;
$$;
create trigger audit_log_notify
  after insert on public.audit_log
  for each row execute function public.outbox_on_audit();

-- За Edge Function: партида от опашката. До 3 опита; заседнали в „sending“ над 10 минути се вземат отново.
create function public.outbox_claim(p_limit integer default 10)
returns table (out_id bigint)
language sql
security definer
set search_path = ''
as $$
  with c as (
    select o.id from public.email_outbox o
    where o.attempts < 3
      and (o.status = 'queued' or (o.status = 'sending' and o.updated_at < now() - interval '10 minutes'))
    order by o.id
    limit greatest(1, least(coalesce(p_limit, 10), 50))
    for update skip locked
  )
  update public.email_outbox o
     set status = 'sending', attempts = o.attempts + 1, updated_at = now()
    from c
   where o.id = c.id
  returning o.id;
$$;

-- Данни за писмото. Адресът се чете от auth.users и излиза само към service_role.
create function public.outbox_get_payload(p_id bigint)
returns table (
  out_kind           text,
  out_to_email       text,
  out_first_name     text,
  out_report_number  bigint,
  out_reject_reason  public.reject_reason,
  out_reject_note    text,
  out_data           jsonb,
  out_created_at     timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.kind, u.email::text, pr.first_name, r.number, rp.reject_reason, rp.reject_note, o.data, o.created_at
  from public.email_outbox o
  join auth.users u on u.id = o.user_id
  left join public.profiles pr on pr.id = o.user_id
  left join public.reports r on r.id = o.report_id
  left join public.report_private rp on rp.report_id = o.report_id
  where o.id = p_id;
$$;

create function public.outbox_mark_result(p_id bigint, p_ok boolean, p_error text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.email_outbox;
begin
  select * into o from public.email_outbox where id = p_id for update;
  if not found or o.status not in ('queued', 'sending') then return; end if;
  update public.email_outbox
     set status = case when p_ok then 'sent'
                       when o.attempts >= 3 then 'failed'
                       else 'queued' end,
         last_error = case when p_ok then null else left(p_error, 500) end,
         updated_at = now()
   where id = p_id;
  if not p_ok and o.attempts >= 3 then
    insert into public.system_events (source, level, message, details)
    values ('email_outbox', 'error', 'Имейлът не може да бъде изпратен след 3 опита',
            jsonb_build_object('outbox_id', p_id, 'kind', o.kind));
  end if;
end;
$$;

revoke execute on function public.outbox_on_reject() from public, anon, authenticated;
revoke execute on function public.outbox_on_audit() from public, anon, authenticated;
revoke execute on function public.outbox_claim(integer) from public, anon, authenticated;
revoke execute on function public.outbox_get_payload(bigint) from public, anon, authenticated;
revoke execute on function public.outbox_mark_result(bigint, boolean, text) from public, anon, authenticated;
grant execute on function public.outbox_claim(integer) to service_role;
grant execute on function public.outbox_get_payload(bigint) to service_role;
grant execute on function public.outbox_mark_result(bigint, boolean, text) to service_role;

-- ===== Планирани задачи =====

-- Изпълнява именувана задача. Успехът се записва само ако е променила редове; грешката винаги.
create function public.run_scheduled_job(p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  n bigint := 0;
  m bigint;
begin
  if p_name = 'delete_unconfirmed_accounts' then
    -- профилът се изтрива каскадно; сигналите на такива акаунти не съществуват (не са могли да подават)
    delete from auth.users u
     where u.email_confirmed_at is null
       and u.created_at < now() - interval '24 hours'
       and not exists (select 1 from public.profiles p where p.id = u.id and p.role <> 'citizen');
    get diagnostics n = row_count;
  elsif p_name = 'purge_events' then
    delete from public.security_events where created_at < now() - interval '30 days';
    get diagnostics n = row_count;
    delete from public.system_events where created_at < now() - interval '30 days';
    get diagnostics m = row_count;
    n := n + m;
  elsif p_name = 'purge_audit_log' then
    n := public.purge_audit_log();
  elsif p_name = 'purge_outbox' then
    delete from public.email_outbox where status in ('sent', 'failed') and updated_at < now() - interval '30 days';
    get diagnostics n = row_count;
  else
    raise exception 'unknown_job';
  end if;

  if n > 0 then
    insert into public.system_events (source, level, message, details)
    values (p_name, 'info', 'Задачата е изпълнена', jsonb_build_object('rows', n));
  end if;
exception when others then
  insert into public.system_events (source, level, message)
  values (left(p_name, 60), 'error', left(sqlerrm, 500));
end;
$$;
revoke execute on function public.run_scheduled_job(text) from public, anon, authenticated;

-- Разписание (UTC). Задачите се създават само ако pg_cron е включен; повторно пускане ги обновява.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('callsliven_delete_unconfirmed', '17 * * * *',   $c$select public.run_scheduled_job('delete_unconfirmed_accounts')$c$);
    perform cron.schedule('callsliven_purge_events',       '40 3 * * *',   $c$select public.run_scheduled_job('purge_events')$c$);
    perform cron.schedule('callsliven_purge_outbox',       '20 4 * * *',   $c$select public.run_scheduled_job('purge_outbox')$c$);
    perform cron.schedule('callsliven_purge_audit_log',    '10 4 1 * *',   $c$select public.run_scheduled_job('purge_audit_log')$c$);
  end if;
end $$;

-- ===== Таблото на администратора =====
-- Броячи; списъците се четат с филтри от таблиците. Просрочието се смята при четене и не е записано.
create function public.admin_attention_counts()
returns table (
  out_suspicious_pending      bigint,
  out_critical_open           bigint,
  out_first_response_overdue  bigint,
  out_resolve_overdue         bigint,
  out_failed_dispatches       bigint,
  out_manual_pending          bigint,
  out_queued_dispatches       bigint,
  out_system_errors_24h       bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select public.is_staff()) then raise exception 'not_staff' using errcode = '42501'; end if;
  return query
  select
    (select count(*) from public.reports r where r.needs_review and r.status = 'new'),
    (select count(*) from public.report_admin a join public.reports r on r.id = a.report_id
      where a.priority = 'critical' and not r.needs_review and r.status in ('new', 'sent', 'in_progress')),
    (select count(*) from public.report_admin a join public.reports r on r.id = a.report_id
      where r.status = 'new' and not r.needs_review and a.first_response_due < now()),
    (select count(*) from public.report_admin a join public.reports r on r.id = a.report_id
      where r.status in ('new', 'sent', 'in_progress') and not r.needs_review and a.resolve_due < now()),
    (select count(distinct d.report_id) from public.report_dispatches d
      where d.status = 'failed'
        and d.attempt = (select max(x.attempt) from public.report_dispatches x where x.report_id = d.report_id)),
    (select count(*) from public.report_dispatches d where d.status = 'manual'),
    (select count(*) from public.report_dispatches d where d.status in ('queued', 'sending')),
    (select count(*) from public.system_events e where e.level = 'error' and e.created_at > now() - interval '24 hours');
end;
$$;
revoke execute on function public.admin_attention_counts() from public, anon;
grant execute on function public.admin_attention_counts() to authenticated;