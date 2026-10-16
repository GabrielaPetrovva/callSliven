-- 012_admin_functions.sql
-- Действия на администраторите (и оттегляне от подателя). Клиентът няма право да пише директно в таблиците;
-- всяко действие минава през функция, която проверява ролята (и MFA), версията на записа,
-- допустимия преход на статуса и в същата транзакция пише историята и Audit Log.
-- Грешките са кодове (напр. version_conflict, invalid_transition), които интерфейсът превежда.

-- Начало на отброяването на сроковете (за подозрителен сигнал е времето на одобрението)
alter table public.report_admin add column sla_start timestamptz;
update public.report_admin a
set sla_start = r.created_at
from public.reports r
where r.id = a.report_id and not r.needs_review;

-- Нови сигнали: отброяването тръгва от създаването, ако вече има срокове (подозрителните са без срокове до одобрение)
create function public.report_admin_set_sla_start()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.sla_start is null and new.first_response_due is not null then
    new.sla_start := now();
  end if;
  return new;
end;
$$;

create trigger report_admin_set_sla_start
  before insert on public.report_admin
  for each row execute function public.report_admin_set_sla_start();

-- Вътрешна помощна функция: проверява персонала, заключва реда и сверява версията
create function public.admin_lock_report(p_report_id uuid, p_expected_version integer)
returns public.report_admin
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.report_admin;
begin
  if not (select public.is_staff()) then
    raise exception 'not_staff' using errcode = '42501';
  end if;
  select * into a from public.report_admin where report_id = p_report_id for update;
  if not found then raise exception 'report_not_found'; end if;
  if a.version <> p_expected_version then raise exception 'version_conflict'; end if;
  return a;
end;
$$;

-- Смяна на статус: изпратен -> в обработка / решен / затворен и т.н. ("изпратен" се задава при изпращането)
create function public.admin_change_status(
  p_report_id        uuid,
  p_expected_version integer,
  p_new_status       public.report_status,
  p_public_note      text default null      -- кратка публична причина; задължителна при "затворен"
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.report_admin;
  r public.reports;
  v integer;
  note text := nullif(trim(p_public_note), '');
begin
  a := public.admin_lock_report(p_report_id, p_expected_version);
  select * into r from public.reports where id = p_report_id for update;

  if r.needs_review then raise exception 'needs_review'; end if;
  if not (
       (r.status = 'new'         and p_new_status = 'closed')
    or (r.status = 'sent'        and p_new_status in ('in_progress', 'resolved', 'closed'))
    or (r.status = 'in_progress' and p_new_status in ('resolved', 'closed'))
  ) then
    raise exception 'invalid_transition';
  end if;
  if p_new_status = 'closed' and (note is null or char_length(note) < 5) then
    raise exception 'note_required';
  end if;

  update public.reports set status = p_new_status where id = p_report_id;
  update public.report_admin
     set version = version + 1,
         first_admin_action_at = coalesce(first_admin_action_at, now())
   where report_id = p_report_id
   returning version into v;
  insert into public.report_events (report_id, status, note) values (p_report_id, p_new_status, note);
  perform public.write_audit('report.status_changed', 'report', p_report_id::text, null,
    jsonb_build_object('from', r.status, 'to', p_new_status));
  return v;
end;
$$;

-- Отхвърляне с причина от фиксиран списък (само за нови сигнали)
create function public.admin_reject_report(
  p_report_id        uuid,
  p_expected_version integer,
  p_reason           public.reject_reason,
  p_note             text default null       -- вътрешна бележка, вижда се от подателя
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.report_admin;
  r public.reports;
  v integer;
begin
  a := public.admin_lock_report(p_report_id, p_expected_version);
  select * into r from public.reports where id = p_report_id for update;
  if r.status <> 'new' then raise exception 'invalid_transition'; end if;

  update public.reports set status = 'rejected' where id = p_report_id;
  update public.report_private
     set reject_reason = p_reason, reject_note = nullif(trim(p_note), '')
   where report_id = p_report_id;
  update public.report_admin
     set version = version + 1,
         first_admin_action_at = coalesce(first_admin_action_at, now())
   where report_id = p_report_id
   returning version into v;
  insert into public.report_events (report_id, status) values (p_report_id, 'rejected');
  perform public.write_audit('report.rejected', 'report', p_report_id::text, null,
    jsonb_build_object('reason', p_reason, 'was_suspicious', r.needs_review));
  return v;
end;
$$;

-- Одобряване на подозрителен сигнал: става публичен, сроковете тръгват от сега
create function public.admin_approve_suspicious(p_report_id uuid, p_expected_version integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.report_admin;
  r public.reports;
  d record;
  v integer;
begin
  a := public.admin_lock_report(p_report_id, p_expected_version);
  select * into r from public.reports where id = p_report_id for update;
  if not r.needs_review or r.status <> 'new' then raise exception 'not_in_review'; end if;

  select * into d from public.sla_due(now(), a.priority);
  update public.reports set needs_review = false where id = p_report_id;
  update public.report_admin
     set version = version + 1,
         first_admin_action_at = coalesce(first_admin_action_at, now()),
         sla_start = now(),
         first_response_due = d.first_response_due,
         resolve_due = d.resolve_due
   where report_id = p_report_id
   returning version into v;
  perform public.write_audit('report.approved', 'report', p_report_id::text, null,
    jsonb_build_object('suspicious_reasons', a.suspicious_reasons));
  return v;
end;
$$;

-- Смяна на подкатегория, институция и/или приоритет. Причината е задължителна.
-- Празна стойност = без промяна. Срокове се преизчисляват от началото на отброяването.
create function public.admin_set_classification(
  p_report_id        uuid,
  p_expected_version integer,
  p_reason           text,
  p_subcategory_id   integer                 default null,
  p_institution_id   integer                 default null,
  p_priority         public.report_priority  default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.report_admin;
  r public.reports;
  sub public.subcategories;
  exact_pt extensions.geometry;
  d record;
  v integer;
  new_prio public.report_priority;
  reason text := nullif(trim(p_reason), '');
begin
  a := public.admin_lock_report(p_report_id, p_expected_version);
  select * into r from public.reports where id = p_report_id for update;

  if reason is null or char_length(reason) < 5 then raise exception 'reason_required'; end if;
  if p_subcategory_id is null and p_institution_id is null and p_priority is null then
    raise exception 'nothing_to_change';
  end if;
  if r.status not in ('new', 'sent', 'in_progress') then raise exception 'invalid_transition'; end if;

  if p_subcategory_id is not null then
    select s.* into sub
    from public.subcategories s join public.categories c on c.id = s.category_id
    where s.id = p_subcategory_id and s.active and c.active;
    if not found then raise exception 'invalid_subcategory'; end if;
    select exact_point into exact_pt from public.report_private where report_id = p_report_id;
    -- публичното място зависи от подкатегорията (скрит адрес = по-едра мрежа)
    update public.reports
       set subcategory_id = sub.id,
           public_point = extensions.st_snaptogrid(exact_pt, case when sub.hide_exact_address then 0.001 else 0.000135 end)
     where id = p_report_id;
  end if;

  if p_institution_id is not null
     and not exists (select 1 from public.institutions where id = p_institution_id and active) then
    raise exception 'invalid_institution';
  end if;

  new_prio := coalesce(p_priority, a.priority);
  if p_priority is not null and not r.needs_review then
    select * into d from public.sla_due(coalesce(a.sla_start, r.created_at), new_prio);
  end if;

  update public.report_admin
     set priority = new_prio,
         institution_id = coalesce(p_institution_id, institution_id),
         first_response_due = case when d is not null then d.first_response_due else first_response_due end,
         resolve_due        = case when d is not null then d.resolve_due        else resolve_due end,
         version = version + 1,
         first_admin_action_at = coalesce(first_admin_action_at, now())
   where report_id = p_report_id
   returning version into v;

  perform public.write_audit('report.classification_changed', 'report', p_report_id::text, reason,
    jsonb_build_object(
      'subcategory', jsonb_build_object('from', r.subcategory_id, 'to', coalesce(p_subcategory_id, r.subcategory_id)),
      'institution', jsonb_build_object('from', a.institution_id, 'to', coalesce(p_institution_id, a.institution_id)),
      'priority',    jsonb_build_object('from', a.priority, 'to', new_prio)));
  return v;
end;
$$;

-- Свързване като дубликат на основен сигнал (по публичния му номер). Сигналите не се обединяват автоматично.
create function public.admin_link_duplicate(
  p_report_id        uuid,
  p_expected_version integer,
  p_main_number      bigint
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.report_admin;
  r public.reports;
  m public.reports;
  v integer;
begin
  a := public.admin_lock_report(p_report_id, p_expected_version);
  select * into r from public.reports where id = p_report_id for update;
  select * into m from public.reports where number = p_main_number;

  if not found or m.id = r.id then raise exception 'invalid_main_report'; end if;
  if m.duplicate_of is not null
     or m.needs_review
     or m.status not in ('new', 'sent', 'in_progress', 'resolved', 'closed') then
    raise exception 'invalid_main_report';
  end if;
  if r.duplicate_of is not null
     or exists (select 1 from public.reports x where x.duplicate_of = r.id) then
    raise exception 'already_linked';
  end if;
  if r.status not in ('new', 'sent', 'in_progress') then raise exception 'invalid_transition'; end if;

  update public.reports set duplicate_of = m.id where id = p_report_id;
  update public.report_admin
     set version = version + 1,
         first_admin_action_at = coalesce(first_admin_action_at, now())
   where report_id = p_report_id
   returning version into v;
  insert into public.report_events (report_id, status, note)
    values (p_report_id, r.status, 'Свързан със сигнал №' || m.number);
  perform public.write_audit('report.linked_duplicate', 'report', p_report_id::text, null,
    jsonb_build_object('main_number', m.number));
  return v;
end;
$$;

-- Ограничаване на акаунт до 7 дни (0 = сваляне на ограничението). Само за граждани.
create function public.admin_restrict_user(p_user_id uuid, p_days integer, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  reason text := nullif(trim(p_reason), '');
begin
  if not (select public.is_staff()) then raise exception 'not_staff' using errcode = '42501'; end if;
  if p_days is null or p_days not between 0 and 7 then raise exception 'invalid_days'; end if;
  if reason is null or char_length(reason) < 5 then raise exception 'reason_required'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id and role = 'citizen') then
    raise exception 'invalid_target';
  end if;

  update public.profiles
     set restricted_until = case when p_days = 0 then null else now() + make_interval(days => p_days) end
   where id = p_user_id;
  perform public.write_audit('user.restricted', 'profile', p_user_id::text, reason,
    jsonb_build_object('days', p_days));
end;
$$;

-- Име и фамилия на подателя. Телефон и имейл не се връщат (те са само през super_admin_get_contact).
create function public.staff_get_submitter_name(p_report_id uuid)
returns table (out_first_name text, out_last_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select public.is_staff()) then raise exception 'not_staff' using errcode = '42501'; end if;
  return query
    select pr.first_name, pr.last_name
    from public.report_private rp
    join public.profiles pr on pr.id = rp.user_id
    where rp.report_id = p_report_id;
end;
$$;

-- Имейл и телефон: само Super Admin, със записана причина. Записът в Audit Log става преди отговора.
create function public.super_admin_get_contact(p_user_id uuid, p_reason text)
returns table (out_email text, out_phone text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  reason text := nullif(trim(p_reason), '');
begin
  if not (select public.is_super_admin()) then raise exception 'not_super_admin' using errcode = '42501'; end if;
  if reason is null or char_length(reason) < 10 then raise exception 'reason_required'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then raise exception 'user_not_found'; end if;

  perform public.write_audit('contact.accessed', 'profile', p_user_id::text, reason);
  return query
    select u.email::text, p.phone
    from auth.users u join public.profiles p on p.id = u.id
    where u.id = p_user_id;
end;
$$;

-- Роли и деактивиране на акаунти (само Super Admin). Последният активен Super Admin не може да бъде премахнат.
create function public.super_admin_set_role(
  p_user_id uuid,
  p_role    public.user_role,
  p_active  boolean,
  p_reason  text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  old public.profiles;
  reason text := nullif(trim(p_reason), '');
begin
  if not (select public.is_super_admin()) then raise exception 'not_super_admin' using errcode = '42501'; end if;
  if reason is null or char_length(reason) < 5 then raise exception 'reason_required'; end if;
  select * into old from public.profiles where id = p_user_id for update;
  if not found then raise exception 'user_not_found'; end if;

  update public.profiles set role = p_role, active = p_active where id = p_user_id;
  if not exists (select 1 from public.profiles where role = 'super_admin' and active) then
    raise exception 'last_super_admin';       -- отменя и промяната по-горе
  end if;
  perform public.write_audit('user.role_changed', 'profile', p_user_id::text, reason,
    jsonb_build_object('role', jsonb_build_object('from', old.role, 'to', p_role),
                       'active', jsonb_build_object('from', old.active, 'to', p_active)));
end;
$$;

-- Оттегляне от подателя, докато няма първо действие от администратор
create function public.withdraw_report(p_report_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  a public.report_admin;
  r public.reports;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not exists (select 1 from public.report_private p where p.report_id = p_report_id and p.user_id = uid) then
    raise exception 'report_not_found';
  end if;

  select * into a from public.report_admin where report_id = p_report_id for update;
  select * into r from public.reports where id = p_report_id for update;
  if r.status <> 'new' or a.first_admin_action_at is not null then
    raise exception 'cannot_withdraw';
  end if;

  update public.reports set status = 'withdrawn' where id = p_report_id;
  update public.report_admin set version = version + 1 where report_id = p_report_id;  -- администратор с отворен екран получава конфликт
  insert into public.report_events (report_id, status) values (p_report_id, 'withdrawn');
  perform public.write_audit('report.withdrawn', 'report', p_report_id::text);
end;
$$;

-- Права: помощната функция е вътрешна; останалите са за влезли потребители (проверката за роля е вътре във функциите)
revoke execute on function public.admin_lock_report(uuid, integer) from public, anon, authenticated;
revoke execute on function public.report_admin_set_sla_start() from public, anon, authenticated;

revoke execute on function public.admin_change_status(uuid, integer, public.report_status, text) from public, anon;
revoke execute on function public.admin_reject_report(uuid, integer, public.reject_reason, text) from public, anon;
revoke execute on function public.admin_approve_suspicious(uuid, integer) from public, anon;
revoke execute on function public.admin_set_classification(uuid, integer, text, integer, integer, public.report_priority) from public, anon;
revoke execute on function public.admin_link_duplicate(uuid, integer, bigint) from public, anon;
revoke execute on function public.admin_restrict_user(uuid, integer, text) from public, anon;
revoke execute on function public.staff_get_submitter_name(uuid) from public, anon;
revoke execute on function public.super_admin_get_contact(uuid, text) from public, anon;
revoke execute on function public.super_admin_set_role(uuid, public.user_role, boolean, text) from public, anon;
revoke execute on function public.withdraw_report(uuid) from public, anon;

grant execute on function public.admin_change_status(uuid, integer, public.report_status, text) to authenticated;
grant execute on function public.admin_reject_report(uuid, integer, public.reject_reason, text) to authenticated;
grant execute on function public.admin_approve_suspicious(uuid, integer) to authenticated;
grant execute on function public.admin_set_classification(uuid, integer, text, integer, integer, public.report_priority) to authenticated;
grant execute on function public.admin_link_duplicate(uuid, integer, bigint) to authenticated;
grant execute on function public.admin_restrict_user(uuid, integer, text) to authenticated;
grant execute on function public.staff_get_submitter_name(uuid) to authenticated;
grant execute on function public.super_admin_get_contact(uuid, text) to authenticated;
grant execute on function public.super_admin_set_role(uuid, public.user_role, boolean, text) to authenticated;
grant execute on function public.withdraw_report(uuid) to authenticated;