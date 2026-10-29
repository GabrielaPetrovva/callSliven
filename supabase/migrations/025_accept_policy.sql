-- 025_accept_policy.sql
-- Повторно съгласие при нова версия на политиката за поверителност (AUTH-2; privacy.html, т. 10).
-- При регистрация версията и часът се записват от тригера handle_new_user (006).
-- Когато POLICY_VERSION в js/config.js се вдигне, влезлият потребител вижда прозорец и приема новата версия.
-- Потребителят не може сам да пише в consent_version / consent_at (права по колони в 006), затова записът
-- минава през тази функция: само за собствения профил, със сегашния час от сървъра и запис в Audit Log
-- (историята на съгласията остава в журнала 12 месеца, а в профила е последната версия).

create function public.accept_policy(p_version text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  v   text := nullif(trim(p_version), '');
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if v is null or v !~ '^[0-9A-Za-z._-]{1,20}$' then raise exception 'invalid_version'; end if;

  update public.profiles
     set consent_version = v, consent_at = now()
   where id = uid;
  if not found then raise exception 'profile_not_found'; end if;

  perform public.write_audit('consent.accepted', 'profile', uid::text, null, jsonb_build_object('version', v));
end;
$$;

revoke execute on function public.accept_policy(text) from public, anon;
grant execute on function public.accept_policy(text) to authenticated;
