-- CallSliven — migration 007: profile name rules + sync to auth.users
-- 1) The database enforces the same name rule as profile.js, so the form cannot be bypassed via the API.
-- 2) When first_name / last_name change in public.profiles, the name is copied to auth.users
--    (raw_user_meta_data), so Authentication → Users shows the same name.
-- Before running: check that no trigger on auth.users copies names back into profiles on UPDATE.

-- 1. Name rules: letters, space, apostrophe, dash; 2–60 chars; no mixing Cyrillic and Latin.
--    '' is allowed because the column default is '' (registration may leave it empty);
--    the profile form itself does not allow an empty name.
--    NOT VALID: existing rows are not checked, only new inserts and updates.
alter table public.profiles
  drop constraint if exists profiles_first_name_check,
  drop constraint if exists profiles_last_name_check;

alter table public.profiles
  add constraint profiles_first_name_check check (
    first_name = '' or (
      char_length(first_name) between 2 and 60
      and first_name ~ '^[[:alpha:]][[:alpha:] ''’-]*$'
      and not (first_name ~ '[Ѐ-ӿ]' and first_name ~ '[A-Za-z]')
    )
  ) not valid,
  add constraint profiles_last_name_check check (
    last_name = '' or (
      char_length(last_name) between 2 and 60
      and last_name ~ '^[[:alpha:]][[:alpha:] ''’-]*$'
      and not (last_name ~ '[Ѐ-ӿ]' and last_name ~ '[A-Za-z]')
    )
  ) not valid;

-- 2. Sync profiles -> auth.users
create or replace function public.sync_profile_name()
returns trigger
language plpgsql
security definer
set search_path = public, auth
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

-- 3. One-time sync of existing users (copies the current profiles name to auth.users).
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