-- 013_dispatch.sql
-- Изпращане на сигнали към институции.
-- Базата води записа и правилата; самото писмо се изпраща от Edge Function (ключът за имейл е само там).
--   admin_send_report    - администраторът натиска „Изпрати към институцията“ (създава изпращания в опашка)
--   dispatch_claim, dispatch_get_payload, dispatch_mark_result, dispatch_apply_webhook - само за Edge Function (service_role)
-- Докато real_send е изключен за институцията, писмото отива на демо имейл от app_settings.

create type public.dispatch_status as enum (
  'queued',     -- чака Edge Function
  'sending',    -- Edge Function го обработва
  'sent',       -- приет от имейл доставчика
  'delivered',  -- доставен (webhook)
  'failed',     -- неуспешна доставка
  'manual',     -- институцията няма имейл: администраторът я уведомява ръчно
  'forwarded'   -- ръчно препратено (администраторът го е потвърдил)
);

-- Общи настройки (един ред)
create table public.app_settings (
  id               boolean primary key default true check (id),
  demo_email       text check (demo_email is null or demo_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  sending_enabled  boolean not null default true,         -- false = „Спри всички изпращания“
  updated_at       timestamptz not null default now()
);
insert into public.app_settings (id) values (true);

create table public.report_dispatches (
  id                   bigint generated always as identity primary key,
  report_id            uuid not null references public.reports (id) on delete cascade,
  institution_id       integer not null references public.institutions (id),
  recipient_role       text not null check (recipient_role in ('to', 'cc')),
  attempt              integer not null check (attempt >= 1),
  status               public.dispatch_status not null,
  to_email             text,                               -- реалният получател (демо имейл или имейл на институцията)
  is_demo              boolean not null default true,
  resend_reason        text check (resend_reason is null or char_length(resend_reason) <= 500),
  provider_message_id  text,
  error                text check (error is null or char_length(error) <= 500),
  created_by           uuid,                               -- без връзка към auth.users, както в audit_log
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (report_id, institution_id, attempt)
);
create index report_dispatches_report_idx on public.report_dispatches (report_id, created_at);
create index report_dispatches_queue_idx on public.report_dispatches (status, updated_at)
  where status in ('queued', 'sending');
create unique index report_dispatches_message_idx on public.report_dispatches (provider_message_id)
  where provider_message_id is not null;

-- RLS: само персоналът чете; записват само функциите
alter table public.app_settings      enable row level security;
alter table public.report_dispatches enable row level security;

create policy app_settings_staff_read on public.app_settings
  for select to authenticated using ((select public.is_staff()));
create policy report_dispatches_staff_read on public.report_dispatches
  for select to authenticated using ((select public.is_staff()));

revoke all on public.app_settings, public.report_dispatches from anon, authenticated;
grant select on public.app_settings, public.report_dispatches to authenticated;

-- „Изпрати към институцията“. Първото изпращане е еднократно; повторно - само с причина.
-- Основната институция получава писмото, а копието (ако има) - също.
create function public.admin_send_report(
  p_report_id        uuid,
  p_expected_version integer,
  p_reason           text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.report_admin;
  r public.reports;
  s public.app_settings;
  inst public.institutions;
  x record;
  v integer;
  n integer;
  st public.dispatch_status;
  recipient text;
  demo boolean;
  reason text := nullif(trim(p_reason), '');
  summary jsonb := '[]'::jsonb;
begin
  a := public.admin_lock_report(p_report_id, p_expected_version);
  select * into r from public.reports where id = p_report_id for update;
  select * into s from public.app_settings;

  if r.needs_review then raise exception 'needs_review'; end if;
  if r.status not in ('new', 'sent', 'in_progress') then raise exception 'invalid_transition'; end if;
  if not s.sending_enabled then raise exception 'sending_paused'; end if;
  if a.institution_id is null then raise exception 'no_institution'; end if;

  select coalesce(max(d.attempt), 0) + 1 into n from public.report_dispatches d where d.report_id = p_report_id;
  if n > 5 then raise exception 'too_many_attempts'; end if;
  if n > 1 and (reason is null or char_length(reason) < 5) then raise exception 'reason_required'; end if;

  for x in
    select t.inst_id, t.role
    from (values (a.institution_id, 'to'), (a.cc_institution_id, 'cc')) as t(inst_id, role)
    where t.inst_id is not null and (t.role = 'to' or t.inst_id <> a.institution_id)
  loop
    select * into inst from public.institutions where id = x.inst_id;
    if not found or not inst.active then
      if x.role = 'to' then raise exception 'invalid_institution'; else continue; end if;
    end if;

    if inst.email is null then
      st := 'manual'; recipient := null; demo := false;
    elsif inst.real_send then
      st := 'queued'; recipient := inst.email; demo := false;
    else
      if s.demo_email is null then raise exception 'no_demo_email'; end if;
      st := 'queued'; recipient := s.demo_email; demo := true;
    end if;

    insert into public.report_dispatches
      (report_id, institution_id, recipient_role, attempt, status, to_email, is_demo, resend_reason, created_by)
    values
      (p_report_id, inst.id, x.role, n, st, recipient, demo, reason, (select auth.uid()));
    summary := summary || jsonb_build_object('institution_id', inst.id, 'role', x.role, 'status', st, 'demo', demo);
  end loop;

  if r.status = 'new' then
    update public.reports set status = 'sent' where id = p_report_id;
    insert into public.report_events (report_id, status) values (p_report_id, 'sent');
  end if;
  update public.report_admin
     set version = version + 1,
         first_admin_action_at = coalesce(first_admin_action_at, now())
   where report_id = p_report_id
   returning version into v;
  perform public.write_audit(case when n = 1 then 'report.sent' else 'report.resent' end,
    'report', p_report_id::text, reason, jsonb_build_object('attempt', n, 'dispatches', summary));
  return v;
end;
$$;

-- Ръчно препратено (за институции без имейл)
create function public.admin_mark_forwarded(
  p_report_id        uuid,
  p_expected_version integer,
  p_dispatch_id      bigint
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.report_admin;
  v integer;
begin
  a := public.admin_lock_report(p_report_id, p_expected_version);
  update public.report_dispatches
     set status = 'forwarded', updated_at = now()
   where id = p_dispatch_id and report_id = p_report_id and status = 'manual';
  if not found then raise exception 'invalid_dispatch'; end if;

  update public.report_admin set version = version + 1 where report_id = p_report_id returning version into v;
  perform public.write_audit('dispatch.forwarded_manually', 'report', p_report_id::text, null,
    jsonb_build_object('dispatch_id', p_dispatch_id));
  return v;
end;
$$;

-- Само Super Admin: демо имейл и „Спри всички изпращания“
create function public.super_admin_update_settings(
  p_demo_email      text,
  p_sending_enabled boolean,
  p_reason          text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  old public.app_settings;
  reason text := nullif(trim(p_reason), '');
begin
  if not (select public.is_super_admin()) then raise exception 'not_super_admin' using errcode = '42501'; end if;
  if reason is null or char_length(reason) < 5 then raise exception 'reason_required'; end if;
  select * into old from public.app_settings;

  update public.app_settings
     set demo_email = nullif(trim(p_demo_email), ''),
         sending_enabled = p_sending_enabled,
         updated_at = now();
  perform public.write_audit('settings.changed', 'app_settings', 'main', reason,
    jsonb_build_object('sending_enabled', jsonb_build_object('from', old.sending_enabled, 'to', p_sending_enabled),
                       'demo_email_changed', old.demo_email is distinct from nullif(trim(p_demo_email), '')));
end;
$$;

-- Само Super Admin: реално изпращане по институция. Изисква имейл и потвърден контакт.
create function public.super_admin_set_real_send(
  p_institution_id integer,
  p_enabled        boolean,
  p_reason         text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  inst public.institutions;
  reason text := nullif(trim(p_reason), '');
begin
  if not (select public.is_super_admin()) then raise exception 'not_super_admin' using errcode = '42501'; end if;
  if reason is null or char_length(reason) < 5 then raise exception 'reason_required'; end if;
  select * into inst from public.institutions where id = p_institution_id for update;
  if not found then raise exception 'invalid_institution'; end if;
  if p_enabled and (inst.email is null or inst.verification_status <> 'confirmed') then
    raise exception 'contact_not_verified';
  end if;

  update public.institutions set real_send = p_enabled where id = p_institution_id;
  perform public.write_audit('institution.real_send_changed', 'institution', p_institution_id::text, reason,
    jsonb_build_object('from', inst.real_send, 'to', p_enabled));
end;
$$;

-- ===== За Edge Function (service_role) =====

-- Взема партида от опашката. Заседнали в „sending“ над 10 минути се вземат отново.
create function public.dispatch_claim(p_limit integer default 10)
returns table (out_id bigint)
language sql
security definer
set search_path = ''
as $$
  with c as (
    select d.id from public.report_dispatches d
    where d.status = 'queued'
       or (d.status = 'sending' and d.updated_at < now() - interval '10 minutes')
    order by d.id
    limit greatest(1, least(coalesce(p_limit, 10), 50))
    for update skip locked
  )
  update public.report_dispatches d
     set status = 'sending', updated_at = now()
    from c
   where d.id = c.id
  returning d.id;
$$;

-- Данни за писмото. Само пречистен текст и точно място, без лични данни на подателя.
create function public.dispatch_get_payload(p_dispatch_id bigint)
returns table (
  out_number        bigint,
  out_title         text,
  out_description   text,
  out_category      text,
  out_subcategory   text,
  out_address       text,
  out_lat           double precision,
  out_lng           double precision,
  out_institution   text,
  out_to_email      text,
  out_is_demo       boolean,
  out_role          text,
  out_attempt       integer,
  out_created_at    timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.number, r.title, r.description, c.name, s.name,
         p.exact_address,
         extensions.st_y(p.exact_point), extensions.st_x(p.exact_point),
         i.name, d.to_email, d.is_demo, d.recipient_role, d.attempt, r.created_at
  from public.report_dispatches d
  join public.reports r on r.id = d.report_id
  join public.report_private p on p.report_id = r.id
  join public.subcategories s on s.id = r.subcategory_id
  join public.categories c on c.id = s.category_id
  join public.institutions i on i.id = d.institution_id
  where d.id = p_dispatch_id;
$$;

-- Резултат от опита за изпращане към доставчика
create function public.dispatch_mark_result(
  p_dispatch_id         bigint,
  p_status              text,          -- 'sent' или 'failed'
  p_provider_message_id text default null,
  p_error               text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.report_dispatches;
begin
  if p_status not in ('sent', 'failed') then raise exception 'invalid_status'; end if;
  select * into d from public.report_dispatches where id = p_dispatch_id for update;
  if not found then raise exception 'invalid_dispatch'; end if;
  if d.status not in ('queued', 'sending') then return; end if;     -- повторно извикване: нищо не се променя

  update public.report_dispatches
     set status = p_status::public.dispatch_status,
         provider_message_id = case when p_status = 'sent' then p_provider_message_id else provider_message_id end,
         error = case when p_status = 'failed' then left(p_error, 500) else null end,
         updated_at = now()
   where id = p_dispatch_id;
  if p_status = 'failed' then
    perform public.write_audit('dispatch.failed', 'report', d.report_id::text, null,
      jsonb_build_object('dispatch_id', d.id, 'attempt', d.attempt));
  end if;
end;
$$;

-- Събитие за доставка от доставчика (webhook). Връща false, ако съобщението не е познато.
create function public.dispatch_apply_webhook(
  p_provider_message_id text,
  p_event               text,          -- 'delivered' или 'failed'
  p_error               text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.report_dispatches;
begin
  if p_event not in ('delivered', 'failed') then raise exception 'invalid_event'; end if;
  select * into d from public.report_dispatches
   where provider_message_id = p_provider_message_id for update;
  if not found then return false; end if;
  if d.status = 'delivered' then return true; end if;               -- вече доставено: по-късно „неуспех“ не го връща назад

  update public.report_dispatches
     set status = p_event::public.dispatch_status,
         error = case when p_event = 'failed' then left(p_error, 500) else null end,
         updated_at = now()
   where id = d.id;
  if p_event = 'failed' and d.status <> 'failed' then
    perform public.write_audit('dispatch.failed', 'report', d.report_id::text, null,
      jsonb_build_object('dispatch_id', d.id, 'attempt', d.attempt, 'via', 'webhook'));
  end if;
  return true;
end;
$$;

-- Права
revoke execute on function public.admin_send_report(uuid, integer, text) from public, anon;
revoke execute on function public.admin_mark_forwarded(uuid, integer, bigint) from public, anon;
revoke execute on function public.super_admin_update_settings(text, boolean, text) from public, anon;
revoke execute on function public.super_admin_set_real_send(integer, boolean, text) from public, anon;
grant execute on function public.admin_send_report(uuid, integer, text) to authenticated;
grant execute on function public.admin_mark_forwarded(uuid, integer, bigint) to authenticated;
grant execute on function public.super_admin_update_settings(text, boolean, text) to authenticated;
grant execute on function public.super_admin_set_real_send(integer, boolean, text) to authenticated;

revoke execute on function public.dispatch_claim(integer) from public, anon, authenticated;
revoke execute on function public.dispatch_get_payload(bigint) from public, anon, authenticated;
revoke execute on function public.dispatch_mark_result(bigint, text, text, text) from public, anon, authenticated;
revoke execute on function public.dispatch_apply_webhook(text, text, text) from public, anon, authenticated;
grant execute on function public.dispatch_claim(integer) to service_role;
grant execute on function public.dispatch_get_payload(bigint) to service_role;
grant execute on function public.dispatch_mark_result(bigint, text, text, text) to service_role;
grant execute on function public.dispatch_apply_webhook(text, text, text) to service_role;