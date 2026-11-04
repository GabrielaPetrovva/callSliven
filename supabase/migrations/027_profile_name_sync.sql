-- 027_profile_name_sync.sql
-- Името от профила се копира в auth.users (raw_user_meta_data), за да показва
-- Authentication → Users същото име като public.profiles.
--
-- Защо е отделна миграция: тригерът е създаден ръчно в callsliven-dev и по погрешка беше записан
-- върху 007_reports.sql. 007 е върнат в оригиналния вид (таблиците на сигналите), а синхронът е тук,
-- за да го има и production. Правилата за име и фамилия са в 022_profile_name_rules.sql.
--
-- Повторното пускане е безопасно: функцията се заменя, тригерът се маха и слага отново,
-- а еднократното копиране само презаписва същите стойности.
-- Преди пускане: никой тригер върху auth.users не трябва да копира имената обратно в profiles при UPDATE
-- (иначе двата тригера биха се викали един друг). В проекта няма такъв.

-- 1. Синхрон profiles -> auth.users при промяна на името
create or replace function public.sync_profile_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update auth.users
  set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
    || jsonb_build_object(
         'first_name',   new.first_name,
         'last_name',    new.last_name,
         'full_name',    trim(new.first_name || ' ' || new.last_name),
         'display_name', trim(new.first_name || ' ' || new.last_name)
       )
  where id = new.id;
  return new;
end;
$$;

revoke execute on function public.sync_profile_name() from public, anon, authenticated;

drop trigger if exists on_profile_name_change on public.profiles;
create trigger on_profile_name_change
  after update of first_name, last_name on public.profiles
  for each row
  when (old.first_name is distinct from new.first_name
     or old.last_name  is distinct from new.last_name)
  execute function public.sync_profile_name();

-- 2. Еднократно копиране на сегашните имена (за профили отпреди тригера)
update auth.users u
set raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb)
  || jsonb_build_object(
       'first_name',   p.first_name,
       'last_name',    p.last_name,
       'full_name',    trim(p.first_name || ' ' || p.last_name),
       'display_name', trim(p.first_name || ' ' || p.last_name)
     )
from public.profiles p
where p.id = u.id;
