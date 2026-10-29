-- 023_super_admin_lists.sql
-- Две функции само за четене за страницата на Super Admin (super-admin.html).
-- Действията вече съществуват (012, 013): super_admin_set_role, super_admin_get_contact,
-- super_admin_update_settings, super_admin_set_real_send. Тук липсваше само как Super Admin
-- да НАМЕРИ акаунт и да прочете журнала с имена, защото RLS дава на всеки само собствения му профил.
--
-- И двете функции изискват Super Admin с MFA (is_super_admin) и НЕ връщат имейл и телефон:
-- те остават само през super_admin_get_contact, със записана причина (SA-3).

-- ===== 1) Търсене на акаунти =====
-- Едно поле за търсене разпознава три вида заявки:
--   * само цифри   -> подателят на сигнала с този номер („кой е подал №…“)
--   * съдържа „@“  -> точно съвпадение на имейла. Така Super Admin намира ръчно създадения
--                     служебен акаунт (ADM-2), без да вижда списък с имейли. Връща се само профилът.
--   * друго        -> част от име или фамилия (поне 2 знака)
-- Без търсене и без роля връща служителите (admin и super_admin).
create function public.super_admin_find_users(
  p_query text             default null,
  p_role  public.user_role default null,
  p_limit integer          default 50
)
returns table (
  out_id               uuid,
  out_first_name       text,
  out_last_name        text,
  out_role             public.user_role,
  out_active           boolean,
  out_restricted_until timestamptz,
  out_created_at       timestamptz,
  out_last_sign_in_at  timestamptz,
  out_email_confirmed  boolean,
  out_has_mfa          boolean,       -- има потвърден TOTP (нужен е за админ панела)
  out_report_count     bigint,
  out_match            text           -- 'report', 'email', 'name' или null (без търсене)
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  q    text    := nullif(trim(p_query), '');
  lim  integer := greatest(1, least(coalesce(p_limit, 50), 100));
  kind text;
  num  bigint;
  pat  text;
begin
  if not (select public.is_super_admin()) then raise exception 'not_super_admin' using errcode = '42501'; end if;
  if q is not null and char_length(q) > 120 then raise exception 'invalid_query'; end if;

  if q is null then
    kind := null;
  elsif q ~ '^[0-9]{1,12}$' then
    kind := 'report'; num := q::bigint;
  elsif position('@' in q) > 0 then
    kind := 'email';
  else
    if char_length(q) < 2 then raise exception 'invalid_query'; end if;
    kind := 'name';
    -- % и _ от потребителя се търсят буквално
    pat := '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query
    select p.id, p.first_name, p.last_name, p.role, p.active, p.restricted_until, p.created_at,
           u.last_sign_in_at,
           u.email_confirmed_at is not null,
           exists (select 1 from auth.mfa_factors f
                   where f.user_id = p.id and f.factor_type = 'totp' and f.status = 'verified'),
           (select count(*) from public.report_private rp where rp.user_id = p.id),
           kind
    from public.profiles p
    join auth.users u on u.id = p.id
    where (p_role is null or p.role = p_role)
      and case kind
            when 'report' then p.id = (select rp.user_id from public.report_private rp
                                        join public.reports r on r.id = rp.report_id
                                        where r.number = num)
            when 'email'  then lower(u.email) = lower(q) or p.email_normalized = public.normalize_email(q)
            when 'name'   then (p.first_name || ' ' || p.last_name) ilike pat
                              or (p.last_name || ' ' || p.first_name) ilike pat
            else p_role is not null or p.role in ('admin', 'super_admin')
          end
    order by p.role desc, p.active desc, p.last_name, p.first_name, p.created_at desc
    limit lim;
end;
$$;

-- ===== 2) Журнал (Audit Log) с имена =====
-- Super Admin чете audit_log и директно (RLS, 008), но там има само идентификатори.
-- Функцията добавя името на извършителя, номера на сигнала и името на засегнатия акаунт или институция.
-- p_group: 'reports' (сигнали и изпращания), 'users' (роли, ограничения), 'contacts' (достъп до контакти),
--          'settings' (настройки и реално изпращане) или null за всички.
-- Странициране: p_before_id = най-малкият id от предишната страница.
create function public.super_admin_audit(
  p_group     text    default null,
  p_before_id bigint  default null,
  p_limit     integer default 50
)
returns table (
  out_id            bigint,
  out_created_at    timestamptz,
  out_actor_name    text,
  out_actor_role    public.user_role,
  out_action        text,
  out_entity_type   text,
  out_report_number bigint,
  out_entity_name   text,          -- име на акаунта или институцията
  out_reason        text,
  out_details       jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  lim integer := greatest(1, least(coalesce(p_limit, 50), 100));
begin
  if not (select public.is_super_admin()) then raise exception 'not_super_admin' using errcode = '42501'; end if;
  if p_group is not null and p_group not in ('reports', 'users', 'contacts', 'settings') then
    raise exception 'invalid_group';
  end if;

  return query
    select a.id, a.created_at,
           nullif(trim(coalesce(ap.first_name, '') || ' ' || coalesce(ap.last_name, '')), ''),
           a.actor_role, a.action, a.entity_type,
           r.number,
           case a.entity_type
             when 'profile'     then nullif(trim(coalesce(tp.first_name, '') || ' ' || coalesce(tp.last_name, '')), '')
             when 'institution' then i.name
           end,
           a.reason, a.details
    from public.audit_log a
    left join public.profiles ap on ap.id = a.actor_id
    left join public.reports r
           on a.entity_type = 'report'
          and r.id = case when a.entity_id ~* '^[0-9a-f-]{36}$' then a.entity_id::uuid end
    left join public.profiles tp
           on a.entity_type = 'profile'
          and tp.id = case when a.entity_id ~* '^[0-9a-f-]{36}$' then a.entity_id::uuid end
    left join public.institutions i
           on a.entity_type = 'institution'
          and i.id = case when a.entity_id ~ '^[0-9]{1,9}$' then a.entity_id::integer end
    where (p_before_id is null or a.id < p_before_id)
      and case p_group
            when 'reports'  then a.action like 'report.%' or a.action like 'dispatch.%'
            when 'users'    then a.action like 'user.%'
            when 'contacts' then a.action like 'contact.%'
            when 'settings' then a.action like 'settings.%' or a.action like 'institution.%'
            else true
          end
    order by a.id desc
    limit lim;
end;
$$;

-- Права: само за влезли потребители; проверката за Super Admin е вътре във функциите
revoke execute on function public.super_admin_find_users(text, public.user_role, integer) from public, anon;
revoke execute on function public.super_admin_audit(text, bigint, integer) from public, anon;
grant execute on function public.super_admin_find_users(text, public.user_role, integer) to authenticated;
grant execute on function public.super_admin_audit(text, bigint, integer) to authenticated;
