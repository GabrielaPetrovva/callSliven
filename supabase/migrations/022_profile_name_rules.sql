-- 022_profile_name_rules.sql
-- Правилата за име и фамилия вече бяха в базата callsliven-dev (добавени ръчно, извън миграциите).
-- Тази миграция ги записва в Git, за да ги има и production проектът и Git да отговаря на базата.
--
-- Име и фамилия са или празни (профил, създаден без тях), или:
--   - от 2 до 60 знака;
--   - започват с буква и съдържат само букви, интервал, апостроф (' или ’) и тире;
--   - не смесват кирилица и латиница в една дума (напр. „Ивaн“ с латинско „a“ — подмяна на име).
-- Тригерът handle_new_user (006) пише името от регистрацията директно, затова при нарушение
-- регистрацията се отказва цялата; сайтът проверява същите правила преди изпращане.
--
-- NOT VALID: правилото важи за всеки нов или променен профил, но съществуващите редове не се проверяват,
-- точно както е в callsliven-dev. Проверка за стари редове, които не го спазват:
--   select id, first_name, last_name from public.profiles
--   where not (first_name = '' or (char_length(first_name) between 2 and 60
--               and first_name ~ '^[[:alpha:]][[:alpha:] ''’-]*$'
--               and not (first_name ~ '[Ѐ-ӿ]' and first_name ~ '[A-Za-z]')))
--      or not (last_name = '' or (char_length(last_name) between 2 and 60
--               and last_name ~ '^[[:alpha:]][[:alpha:] ''’-]*$'
--               and not (last_name ~ '[Ѐ-ӿ]' and last_name ~ '[A-Za-z]')));
-- Ако няма такива, може да се пусне:
--   alter table public.profiles validate constraint profiles_first_name_check;
--   alter table public.profiles validate constraint profiles_last_name_check;
--
-- Повторното пускане е безопасно: старото правило се маха и се слага същото.

alter table public.profiles drop constraint if exists profiles_first_name_check;
alter table public.profiles drop constraint if exists profiles_last_name_check;

alter table public.profiles add constraint profiles_first_name_check check (
  first_name = ''
  or (
    char_length(first_name) between 2 and 60
    and first_name ~ '^[[:alpha:]][[:alpha:] ''’-]*$'
    and not (first_name ~ '[Ѐ-ӿ]' and first_name ~ '[A-Za-z]')
  )
) not valid;

alter table public.profiles add constraint profiles_last_name_check check (
  last_name = ''
  or (
    char_length(last_name) between 2 and 60
    and last_name ~ '^[[:alpha:]][[:alpha:] ''’-]*$'
    and not (last_name ~ '[Ѐ-ӿ]' and last_name ~ '[A-Za-z]')
  )
) not valid;