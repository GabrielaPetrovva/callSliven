-- 026_account_self_service.sql
-- Самообслужване на профила (MVP.md, „Преди реални потребители“):
--   1) Смяна на имейл. Самата смяна е в Supabase Auth: код до стария и код до новия адрес
--      („Secure email change“). Тук само следим промяната: email_normalized в профила и запис в Audit Log.
--   2) Изтриване на профил от самия потребител с паролата му (delete_my_account).
--      Сигналите остават публични без връзка с човека: report_private.user_id става null (миграция 007,
--      „on delete set null“), профилът се трие каскадно, а журналът пази само номера на акаунта.
--
-- Защо изтриването е функция в базата, а не в браузъра: браузърът няма право да трие auth.users,
-- а паролата трябва да се провери на сървъра. Функцията работи само за собствения профил (auth.uid()).

create extension if not exists pgcrypto with schema extensions;   -- crypt() за проверка на паролата

-- ===== 1. Смяна на имейл =====

-- Supabase Auth сменя auth.users.email, след като и двата кода са потвърдени.
-- email_normalized се ползва за лимитите на новите акаунти, затова трябва да следва новия адрес.
create function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
     set email_normalized = public.normalize_email(new.email)
   where id = new.id;
  -- без адресите в журнала: само че имейлът е сменен
  perform public.write_audit('account.email_changed', 'profile', new.id::text, null, '{}'::jsonb, new.id);
  return new;
exception when others then
  -- записът в журнала никога не бива да спре смяната в Supabase Auth
  insert into public.system_events (source, level, message) values ('sync_profile_email', 'error', left(sqlerrm, 500));
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email and new.email is not null)
  execute function public.sync_profile_email();

revoke execute on function public.sync_profile_email() from public, anon, authenticated;

-- ===== 2. Изтриване на профил =====

-- Връща код вместо грешка, за да остане записът за грешна парола (грешката би върнала транзакцията назад):
--   deleted            профилът е изтрит
--   wrong_password     грешна парола (записва се в security_events)
--   too_many_attempts  5 грешни пароли за последния час
--   staff_account      служител: първо Super Admin сменя ролята му на гражданин
create function public.delete_my_account(p_password text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid       uuid := (select auth.uid());
  prof      public.profiles%rowtype;
  pw_hash   text;
  fails     integer;
  n_reports integer;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;

  -- две едновременни заявки на един човек не могат да заобиколят лимита на опитите
  perform pg_advisory_xact_lock(hashtextextended('delete_account:' || uid::text, 0));

  select * into prof from public.profiles where id = uid;
  if not found then raise exception 'profile_not_found'; end if;

  -- служителите се управляват от Super Admin (журнал, последният Super Admin и т.н.)
  if prof.role <> 'citizen' then return 'staff_account'; end if;

  select count(*) into fails
    from public.security_events e
   where e.event_type = 'account_delete_failed'
     and e.user_id = uid
     and e.created_at > now() - interval '1 hour';
  if fails >= 5 then return 'too_many_attempts'; end if;

  select u.encrypted_password into pw_hash from auth.users u where u.id = uid;
  if p_password is null or char_length(p_password) > 200
     or coalesce(pw_hash, '') = ''
     or extensions.crypt(p_password, pw_hash) <> pw_hash then
    insert into public.security_events (event_type, user_id) values ('account_delete_failed', uid);
    return 'wrong_password';
  end if;

  select count(*) into n_reports from public.report_private where user_id = uid;

  -- запис преди изтриването, докато ролята още е известна; без имейл, име и телефон
  perform public.write_audit('account.deleted', 'profile', uid::text, null,
                             jsonb_build_object('reports', n_reports));

  -- неизпратените известия няма къде да отидат
  delete from public.email_outbox where user_id = uid and status in ('queued', 'sending');

  -- Supabase не трие потребител, който е собственик на файлове в Storage.
  -- Снимките на сигналите остават (те са част от сигнала), само без собственик.
  begin
    update storage.objects set owner = null, owner_id = null
     where owner = uid or owner_id = uid::text;
  exception when undefined_column or undefined_table then
    update storage.objects set owner = null where owner = uid;
  end;

  -- каскадно: profiles, сесии, фактори; report_private.user_id става null
  delete from auth.users where id = uid;

  return 'deleted';
end;
$$;

revoke execute on function public.delete_my_account(text) from public, anon;
grant execute on function public.delete_my_account(text) to authenticated;
