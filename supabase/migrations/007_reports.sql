-- 007_reports.sql
-- Сигнали. Данните са разделени по аудитория, за да не изтекат чрез грешна политика:
--   reports         - публична част (вижда се от всички, когато сигналът е публичен)
--   report_private  - собственик и администратори (оригинален текст, точно място, причина за отхвърляне)
--   report_admin    - само администратори (приоритет, институция, причини за подозрение, срокове)
--   report_events   - публична хронология на статусите
-- Клиентът НЕ пише в тези таблици. Записите се правят от функции в следващата миграция,
-- които в една транзакция пазят и историята, и Audit Log.

create type public.report_status as enum (
  'new', 'sent', 'in_progress', 'resolved', 'closed',   -- публични статуси
  'rejected', 'withdrawn'                               -- непублични
);

create type public.reject_reason as enum (
  'insufficient_info',  -- недостатъчна информация
  'out_of_scope',       -- извън компетенциите
  'inappropriate',      -- неприемливо съдържание
  'spam'
);

-- 1) Публична част
create table public.reports (
  id              uuid primary key default gen_random_uuid(),
  number          bigint generated always as identity unique,        -- публичен номер
  subcategory_id  integer not null references public.subcategories (id),
  title           text not null check (char_length(title) between 1 and 100),          -- пречистен текст
  description     text not null check (char_length(description) between 1 and 2000),  -- пречистен текст
  status          public.report_status not null default 'new',
  needs_review    boolean not null default false,                    -- подозрителен: скрит до преглед
  duplicate_of    uuid references public.reports (id) on delete set null,
  public_point    extensions.geometry(Point, 4326) not null,         -- закръглено място (≈15 м)
  public_address  text check (public_address is null or char_length(public_address) <= 200),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (duplicate_of is null or duplicate_of <> id)
);

create index reports_public_list_idx on public.reports (created_at desc)
  where status in ('new', 'sent', 'in_progress', 'resolved', 'closed') and not needs_review;
create index reports_status_idx       on public.reports (status, updated_at desc);
create index reports_subcategory_idx  on public.reports (subcategory_id);
create index reports_duplicate_of_idx on public.reports (duplicate_of) where duplicate_of is not null;
create index reports_point_idx        on public.reports using gist (public_point);
create index reports_search_idx       on public.reports using gin ((title || ' ' || description) extensions.gin_trgm_ops);

create trigger reports_set_updated_at
  before update on public.reports
  for each row execute function public.set_updated_at();

-- 2) Собственик и администратори
create table public.report_private (
  report_id            uuid primary key references public.reports (id) on delete cascade,
  user_id              uuid references auth.users (id) on delete set null,  -- null след изтриване на профила
  idempotency_key      uuid not null,                                       -- защита от двойно подаване
  original_title       text not null check (char_length(original_title) between 5 and 100),
  original_description text not null check (char_length(original_description) between 20 and 2000),
  exact_point          extensions.geometry(Point, 4326) not null,
  exact_address        text check (exact_address is null or char_length(exact_address) <= 300),
  reject_reason        public.reject_reason,
  reject_note          text check (reject_note is null or char_length(reject_note) <= 500),
  created_at           timestamptz not null default now(),
  unique (user_id, idempotency_key)
);
create index report_private_user_idx on public.report_private (user_id);

-- 3) Само администратори
create table public.report_admin (
  report_id              uuid primary key references public.reports (id) on delete cascade,
  priority               public.report_priority not null,
  institution_id         integer references public.institutions (id),
  cc_institution_id      integer references public.institutions (id),
  suspicious_reasons     text[] not null default '{}',      -- напр. {honeypot,too_fast,url}
  ip_hash                text,                              -- хеш на IP, не самият адрес
  first_admin_action_at  timestamptz,                       -- след него подателят не може да оттегли
  first_response_due     timestamptz,
  resolve_due            timestamptz,
  version                integer not null default 1         -- оптимистично заключване
);
create index report_admin_institution_idx on public.report_admin (institution_id);
create index report_admin_resolve_due_idx on public.report_admin (resolve_due);

-- 4) Публична хронология
create table public.report_events (
  id          bigint generated always as identity primary key,
  report_id   uuid not null references public.reports (id) on delete cascade,
  status      public.report_status not null,
  note        text check (note is null or char_length(note) <= 300),   -- кратка публична причина
  created_at  timestamptz not null default now()
);
create index report_events_report_idx on public.report_events (report_id, created_at);

-- RLS
alter table public.reports        enable row level security;
alter table public.report_private enable row level security;
alter table public.report_admin   enable row level security;
alter table public.report_events  enable row level security;

-- reports: публичните се виждат от всички; собственикът вижда и своите непублични; персоналът вижда всички
create policy reports_public_read on public.reports
  for select to anon, authenticated
  using (status in ('new', 'sent', 'in_progress', 'resolved', 'closed') and not needs_review);

create policy reports_owner_read on public.reports
  for select to authenticated
  using (exists (
    select 1 from public.report_private p
    where p.report_id = reports.id and p.user_id = (select auth.uid())
  ));

create policy reports_staff_read on public.reports
  for select to authenticated
  using ((select public.is_staff()));

-- report_private: собственикът вижда своя ред, персоналът всички
create policy report_private_owner_read on public.report_private
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy report_private_staff_read on public.report_private
  for select to authenticated
  using ((select public.is_staff()));

-- report_admin: само персоналът
create policy report_admin_staff_read on public.report_admin
  for select to authenticated
  using ((select public.is_staff()));

-- report_events: вижда се само хронологията на сигнали, които извикващият вижда
create policy report_events_read on public.report_events
  for select to anon, authenticated
  using (exists (select 1 from public.reports r where r.id = report_events.report_id));

-- Права: само четене. INSERT, UPDATE и DELETE ги правят функциите от следващата миграция.
revoke all on public.reports, public.report_private, public.report_admin, public.report_events
  from anon, authenticated;
grant select on public.reports, public.report_events to anon, authenticated;
grant select on public.report_private, public.report_admin to authenticated;