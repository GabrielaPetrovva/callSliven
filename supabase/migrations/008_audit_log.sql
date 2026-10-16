-- 008_audit_log.sql
-- Audit Log: журнал на важните действия, който може само да се допълва.
-- Записва се от функциите на приложението (в същата транзакция като действието), не от клиента.

create table public.audit_log (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  actor_id    uuid,                          -- без връзка към auth.users: записът трябва да оцелее при изтриване на профил
  actor_role  public.user_role,              -- ролята в момента на действието
  action      text not null check (char_length(action) between 3 and 80),       -- напр. report.created, report.status_changed
  entity_type text not null check (char_length(entity_type) between 2 and 40),  -- напр. report, profile, institution
  entity_id   text,
  reason      text check (reason is null or char_length(reason) <= 500),       -- задължителна причина при чувствителни действия
  details     jsonb not null default '{}'::jsonb                                -- какво е променено; без лични данни
);

create index audit_log_entity_idx  on public.audit_log (entity_type, entity_id, created_at desc);
create index audit_log_actor_idx   on public.audit_log (actor_id, created_at desc);
create index audit_log_created_idx on public.audit_log (created_at);

-- Забрана за промяна и триене, дори за собственика на базата.
-- Единственото изключение е чистенето по срок (purge_audit_log) след 12 месеца.
create function public.audit_log_block_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and coalesce(current_setting('app.audit_purge', true), '') = 'on' then
    return old;
  end if;
  raise exception 'audit_log е само за добавяне (% не е позволено)', tg_op
    using errcode = '42501';
end;
$$;

create trigger audit_log_no_update_delete
  before update or delete on public.audit_log
  for each row execute function public.audit_log_block_changes();

create trigger audit_log_no_truncate
  before truncate on public.audit_log
  for each statement execute function public.audit_log_block_changes();

-- Добавя запис. Ползва се само от други функции в базата.
-- p_actor: кой извършва действието; ако е празно, взема се влезлият потребител.
create function public.write_audit(
  p_action      text,
  p_entity_type text,
  p_entity_id   text  default null,
  p_reason      text  default null,
  p_details     jsonb default '{}'::jsonb,
  p_actor       uuid  default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := coalesce(p_actor, (select auth.uid()));
begin
  insert into public.audit_log (actor_id, actor_role, action, entity_type, entity_id, reason, details)
  values (
    uid,
    (select p.role from public.profiles p where p.id = uid),
    p_action, p_entity_type, p_entity_id, p_reason,
    coalesce(p_details, '{}'::jsonb)
  );
end;
$$;

-- Чистене по срок. Не позволява по-кратко пазене от 12 месеца.
create function public.purge_audit_log(keep interval default interval '12 months')
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  n bigint;
begin
  if keep < interval '12 months' then
    raise exception 'Audit Log се пази поне 12 месеца';
  end if;
  perform set_config('app.audit_purge', 'on', true);   -- важи само в тази транзакция
  delete from public.audit_log where created_at < now() - keep;
  get diagnostics n = row_count;
  perform set_config('app.audit_purge', 'off', true);
  return n;
end;
$$;

revoke execute on function public.audit_log_block_changes() from public, anon, authenticated;
revoke execute on function public.write_audit(text, text, text, text, jsonb, uuid) from public, anon, authenticated;
revoke execute on function public.purge_audit_log(interval) from public, anon, authenticated;

-- RLS: Super Admin вижда всичко; администраторът само собствените си действия; останалите нищо
alter table public.audit_log enable row level security;

create policy audit_log_super_admin_read on public.audit_log
  for select to authenticated
  using ((select public.is_super_admin()));

create policy audit_log_own_actions_read on public.audit_log
  for select to authenticated
  using ((select public.is_staff()) and actor_id = (select auth.uid()));

revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;