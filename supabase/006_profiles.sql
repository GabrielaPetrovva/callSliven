-- 006_profiles.sql
-- Потребителски профили, роли и помощни функции за достъпа.
-- Имейлът и паролата остават в auth.users (Supabase Auth). Тук е само каквото ни трябва допълнително.

-- Роли в приложението
create type public.user_role as enum ('citizen', 'admin', 'super_admin');

create table public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  first_name        text not null default '' check (char_length(first_name) <= 60),
  last_name         text not null default '' check (char_length(last_name) <= 60),
  phone             text check (phone is null or phone ~ '^\+?[0-9][0-9 ()-]{5,19}$'),
  role              public.user_role not null default 'citizen',
  active            boolean not null default true,       -- false = деактивиран акаунт
  restricted_until  timestamptz,                         -- ограничение след преглед на подозрителен сигнал (до 7 дни)
  consent_version   text,                                -- версия на приетата политика за поверителност
  consent_at        timestamptz,                         -- кога е дадено съгласието
  email_normalized  text,                                -- имейл с малки букви и без +таг, само за лимитите
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index profiles_email_normalized_idx on public.profiles (email_normalized);

-- Нормализиране на имейл: "Ivan+test@Mail.com" -> "ivan@mail.com"
create function public.normalize_email(e text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(split_part(split_part(trim(e), '@', 1), '+', 1)) || '@' || lower(split_part(trim(e), '@', 2));
$$;

-- Автоматично създава профил при нова регистрация.
-- Ролята винаги е "citizen": данните от регистрацията идват от потребителя и не са доверени.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  ph   text  := nullif(trim(meta ->> 'phone'), '');
  ver  text  := nullif(left(trim(meta ->> 'consent_version'), 20), '');
begin
  insert into public.profiles
    (id, first_name, last_name, phone, consent_version, consent_at, email_normalized)
  values (
    new.id,
    left(coalesce(trim(meta ->> 'first_name'), ''), 60),
    left(coalesce(trim(meta ->> 'last_name'), ''), 60),
    case when ph ~ '^\+?[0-9][0-9 ()-]{5,19}$' then ph end,   -- невалиден телефон се пропуска
    ver,
    case when ver is not null then now() end,
    public.normalize_email(new.email)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Обновява updated_at при всяка промяна
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Помощни функции за RLS политиките в следващите миграции.
-- security definer: четат profiles без да минават през RLS (иначе политиката би се самоповиквала).
-- Администраторският достъп изисква и MFA (aal2).
create function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
           select 1 from public.profiles p
           where p.id = (select auth.uid())
             and p.active
             and p.role in ('admin', 'super_admin')
         )
     and coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2';
$$;

create function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
           select 1 from public.profiles p
           where p.id = (select auth.uid())
             and p.active
             and p.role = 'super_admin'
         )
     and coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2';
$$;

-- Функциите не са за анонимни посетители и не са за публично викане
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.set_updated_at()  from public, anon, authenticated;
revoke execute on function public.is_staff()        from public, anon;
revoke execute on function public.is_super_admin()  from public, anon;
grant  execute on function public.is_staff()        to authenticated;
grant  execute on function public.is_super_admin()  to authenticated;

-- RLS: всеки вижда и променя само собствения си ред
alter table public.profiles enable row level security;

create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Права по колони: ролята, активността и ограничението не могат да се променят от потребителя.
-- email_normalized не се чете от клиента. Няма INSERT и DELETE: профилът се създава от тригера.
revoke all on public.profiles from anon, authenticated;
grant select (id, first_name, last_name, phone, role, active, restricted_until,
              consent_version, consent_at, created_at, updated_at)
  on public.profiles to authenticated;
grant update (first_name, last_name, phone) on public.profiles to authenticated;