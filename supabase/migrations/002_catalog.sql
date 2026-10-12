-- 002_catalog.sql
-- Каталог: категории, подкатегории, институции, празници, граница на общината

-- Приоритет: ползва се и от подкатегориите (стойност по подразбиране)
create type public.report_priority as enum ('critical', 'high', 'medium', 'low');

create table public.categories (
  id          integer generated always as identity primary key,
  name        text not null unique,
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.institutions (
  id          integer generated always as identity primary key,
  name        text not null unique,
  email       text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  note        text,                                  -- напр. "приема сигнали само по телефон"
  real_send   boolean not null default false,        -- false = писмата отиват на демо имейл
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.subcategories (
  id                  integer generated always as identity primary key,
  category_id         integer not null references public.categories (id),
  name                text not null,
  default_priority    public.report_priority not null,
  institution_id      integer references public.institutions (id),     -- null = "Неопределена институция"
  cc_institution_id   integer references public.institutions (id),     -- копие (напр. Управление при кризи)
  requires_photo      boolean not null default false,
  hide_exact_address  boolean not null default false,
  sort_order          integer not null default 0,
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  unique (category_id, name)
);
create index subcategories_category_id_idx on public.subcategories (category_id);

create table public.holidays (
  day   date primary key,
  name  text not null
);

create table public.boundaries (
  id          integer generated always as identity primary key,
  name        text not null,
  source      text not null,                         -- напр. "OSM relation ..."
  version     integer not null default 1,
  fetched_at  timestamptz not null default now(),
  is_active   boolean not null default false,
  geom        extensions.geometry(MultiPolygon, 4326) not null
);
create index boundaries_geom_idx on public.boundaries using gist (geom);
create unique index boundaries_one_active_idx on public.boundaries (is_active) where is_active;

-- Сигурност: RLS на всички таблици; без политика = никой отвън няма достъп
alter table public.categories    enable row level security;
alter table public.subcategories enable row level security;
alter table public.institutions  enable row level security;
alter table public.holidays      enable row level security;
alter table public.boundaries    enable row level security;

-- Формата за подаване трябва да чете категориите и подкатегориите
create policy categories_public_read on public.categories
  for select to anon, authenticated using (active);
create policy subcategories_public_read on public.subcategories
  for select to anon, authenticated using (active);

-- Отнемаме правата по подразбиране и даваме само нужните колони
revoke all on public.categories, public.subcategories, public.institutions,
              public.holidays, public.boundaries from anon, authenticated;
grant select (id, name, sort_order, active) on public.categories to anon, authenticated;
grant select (id, category_id, name, default_priority, requires_photo,
              hide_exact_address, sort_order, active)
  on public.subcategories to anon, authenticated;