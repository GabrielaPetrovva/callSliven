-- 014_storage_and_public.sql
-- 1) Снимки: частен bucket, правила за качване, таблица report_photos
-- 2) Публичен достъп: анонимните посетители вече НЕ четат таблиците директно, а само през функции
--    (списък с търсене, точки за картата, страница на сигнал), които връщат единствено публичните полета.
--
-- Път на снимките в bucket "report-photos":
--   tmp/<user_id>/<submission_id>/<файл>   - качва потребителят (временно)
--   reports/<report_id>/<номер>.<ext>      - сложена от Edge Function след проверка и премахване на EXIF
-- Файловете се трият през Storage API (Edge Function), не с SQL, затова тук има само функция, която сочи кои са остарели.

-- ===== Снимки =====

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-photos', 'report-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create table public.report_photos (
  id            bigint generated always as identity primary key,
  report_id     uuid not null references public.reports (id) on delete cascade,
  position      smallint not null check (position between 1 and 3),
  path          text not null unique,
  content_type  text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes    integer not null check (size_bytes between 1 and 5242880),
  created_at    timestamptz not null default now(),
  unique (report_id, position)
);

alter table public.report_photos enable row level security;
create policy report_photos_staff_read on public.report_photos
  for select to authenticated using ((select public.is_staff()));
revoke all on public.report_photos from anon, authenticated;
grant select on public.report_photos to authenticated;

-- Лимит на качванията (SUB-9): нов акаунт 5 на час и 9 за 24 часа; после 10 на час.
-- Брои се и вече обработеното, затова изтриването на временния файл не нулира лимита.
create function public.photo_upload_allowed()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  is_new boolean;
  per_hour integer;
  per_day integer;
begin
  if uid is null then return false; end if;
  select p.created_at > now() - interval '24 hours' into is_new from public.profiles p where p.id = uid;
  if is_new is null then return false; end if;

  select (select count(*) from storage.objects o
           where o.bucket_id = 'report-photos' and o.name like 'tmp/' || uid::text || '/%'
             and o.created_at > now() - interval '1 hour')
       + (select count(*) from public.report_photos ph
            join public.report_private rp on rp.report_id = ph.report_id
           where rp.user_id = uid and ph.created_at > now() - interval '1 hour'),
         (select count(*) from storage.objects o
           where o.bucket_id = 'report-photos' and o.name like 'tmp/' || uid::text || '/%'
             and o.created_at > now() - interval '24 hours')
       + (select count(*) from public.report_photos ph
            join public.report_private rp on rp.report_id = ph.report_id
           where rp.user_id = uid and ph.created_at > now() - interval '24 hours')
    into per_hour, per_day;

  if is_new then return per_hour < 5 and per_day < 9; end if;
  return per_hour < 10;
end;
$$;
revoke execute on function public.photo_upload_allowed() from public, anon;
grant execute on function public.photo_upload_allowed() to authenticated;

-- Правила за Storage. Размерът и типът на файла се налагат от самия bucket (5 MB, JPG/PNG/WebP).
create policy report_photos_upload_own_tmp on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'report-photos'
    and array_length(storage.foldername(name), 1) = 3
    and (storage.foldername(name))[1] = 'tmp'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and (select public.photo_upload_allowed())
  );

-- Изтриването в Postgres изисква и право за четене, затова потребителят вижда (само) собствените си временни файлове
create policy report_photos_read_own_tmp on storage.objects
  for select to authenticated
  using (
    bucket_id = 'report-photos'
    and (storage.foldername(name))[1] = 'tmp'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

create policy report_photos_delete_own_tmp on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'report-photos'
    and (storage.foldername(name))[1] = 'tmp'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

-- Само персоналът (с MFA) вижда окончателните снимки (чрез подписани линкове)
create policy report_photos_staff_read_final on storage.objects
  for select to authenticated
  using (
    bucket_id = 'report-photos'
    and (storage.foldername(name))[1] = 'reports'
    and (select public.is_staff())
  );

-- За Edge Function: записва вече проверена и преместена снимка
create function public.report_add_photo(
  p_report_id    uuid,
  p_path         text,
  p_content_type text,
  p_size_bytes   integer
)
returns smallint
language plpgsql
security definer
set search_path = ''
as $$
declare
  pos smallint;
begin
  perform 1 from public.reports where id = p_report_id for update;
  if not found then raise exception 'report_not_found'; end if;
  if p_path is null or left(p_path, char_length('reports/' || p_report_id::text || '/')) <> 'reports/' || p_report_id::text || '/' then
    raise exception 'invalid_path';
  end if;

  select count(*) + 1 into pos from public.report_photos where report_id = p_report_id;
  if pos > 3 then raise exception 'too_many_photos'; end if;

  insert into public.report_photos (report_id, position, path, content_type, size_bytes)
  values (p_report_id, pos, p_path, p_content_type, p_size_bytes);
  return pos;
end;
$$;

-- За Edge Function: временни файлове, по-стари от зададеното време (за изтриване през Storage API)
create function public.storage_tmp_stale(p_older_than interval default interval '24 hours')
returns table (out_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'report-photos'
    and o.name like 'tmp/%'
    and o.created_at < now() - greatest(p_older_than, interval '1 hour')
  order by o.created_at
  limit 500;
$$;

revoke execute on function public.report_add_photo(uuid, text, text, integer) from public, anon, authenticated;
revoke execute on function public.storage_tmp_stale(interval) from public, anon, authenticated;
grant execute on function public.report_add_photo(uuid, text, text, integer) to service_role;
grant execute on function public.storage_tmp_stale(interval) to service_role;

-- ===== Публичен достъп =====

-- Вътрешен изглед: само публичните сигнали и само публичните полета. Никой клиент няма достъп до него директно.
create view public.v_public_reports as
select r.id,
       r.number,
       r.title,
       r.description,
       r.status,
       r.created_at,
       greatest(r.created_at, coalesce((select max(e.created_at) from public.report_events e where e.report_id = r.id), r.created_at)) as last_update,
       s.category_id,
       c.name as category_name,
       s.name as subcategory_name,
       r.public_address,
       extensions.st_y(r.public_point) as lat,
       extensions.st_x(r.public_point) as lng,
       r.duplicate_of
from public.reports r
join public.subcategories s on s.id = r.subcategory_id
join public.categories c on c.id = s.category_id
where r.status in ('new', 'sent', 'in_progress', 'resolved', 'closed')
  and not r.needs_review;
revoke all on public.v_public_reports from public, anon, authenticated;

-- Анонимните посетители вече не четат таблиците директно
revoke select on public.reports, public.report_events from anon;

-- Списък с търсене: по триграми (допуска близки думи), филтри и страниране (до 50 на страница)
create function public.search_public_reports(
  p_query       text    default null,
  p_category_id integer default null,
  p_from        date    default null,
  p_to          date    default null,
  p_sort        text    default 'newest',     -- newest | oldest | updated
  p_limit       integer default 20,
  p_offset      integer default 0
)
returns table (
  out_number       bigint,
  out_title        text,
  out_excerpt      text,
  out_status       public.report_status,
  out_category     text,
  out_subcategory  text,
  out_address      text,
  out_lat          double precision,
  out_lng          double precision,
  out_created_at   timestamptz,
  out_last_update  timestamptz,
  out_more_count   bigint,
  out_total        bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  q text := nullif(left(trim(coalesce(p_query, '')), 100), '');
  pat text;
  lim integer := greatest(1, least(coalesce(p_limit, 20), 50));
  off integer := greatest(0, coalesce(p_offset, 0));
begin
  if q is not null and char_length(q) < 2 then q := null; end if;
  if q is not null then
    pat := '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query
  select v.number, v.title, left(v.description, 200), v.status, v.category_name, v.subcategory_name,
         v.public_address, v.lat, v.lng, v.created_at, v.last_update,
         (select count(*) from public.v_public_reports d where d.duplicate_of = v.id),
         count(*) over ()
  from public.v_public_reports v
  where v.duplicate_of is null
    and (p_category_id is null or v.category_id = p_category_id)
    and (p_from is null or v.created_at >= (p_from::timestamp at time zone 'Europe/Sofia'))
    and (p_to is null or v.created_at < ((p_to + 1)::timestamp at time zone 'Europe/Sofia'))
    and (q is null
         or (v.title || ' ' || v.description) ilike pat
         or extensions.word_similarity(q, v.title || ' ' || v.description) >= 0.5)
  order by
    case when p_sort = 'oldest'  then v.created_at end asc nulls last,
    case when p_sort = 'updated' then v.last_update end desc nulls last,
    v.created_at desc, v.number desc
  limit lim offset off;
end;
$$;

-- Точки за картата: най-новите до 500, по филтри и по видимата област
create function public.public_map_points(
  p_category_id integer          default null,
  p_from        date             default null,
  p_to          date             default null,
  p_query       text             default null,
  p_min_lng     double precision default null,
  p_min_lat     double precision default null,
  p_max_lng     double precision default null,
  p_max_lat     double precision default null
)
returns table (
  out_number     bigint,
  out_title      text,
  out_status     public.report_status,
  out_category   text,
  out_lat        double precision,
  out_lng        double precision,
  out_created_at timestamptz,
  out_total      bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  q text := nullif(left(trim(coalesce(p_query, '')), 100), '');
  pat text;
begin
  if q is not null and char_length(q) < 2 then q := null; end if;
  if q is not null then
    pat := '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query
  select v.number, v.title, v.status, v.category_name, v.lat, v.lng, v.created_at, count(*) over ()
  from public.v_public_reports v
  where v.duplicate_of is null
    and (p_category_id is null or v.category_id = p_category_id)
    and (p_from is null or v.created_at >= (p_from::timestamp at time zone 'Europe/Sofia'))
    and (p_to is null or v.created_at < ((p_to + 1)::timestamp at time zone 'Europe/Sofia'))
    and (p_min_lng is null or p_max_lng is null or p_min_lat is null or p_max_lat is null
         or (v.lng between p_min_lng and p_max_lng and v.lat between p_min_lat and p_max_lat))
    and (q is null
         or (v.title || ' ' || v.description) ilike pat
         or extensions.word_similarity(q, v.title || ' ' || v.description) >= 0.5)
  order by v.created_at desc, v.number desc
  limit 500;
end;
$$;

-- Страница на сигнал. Дубликатът води към основния сигнал. Непубличен или несъществуващ = няма ред.
create function public.get_public_report(p_number bigint)
returns table (
  out_number            bigint,
  out_requested_number  bigint,
  out_title             text,
  out_description       text,
  out_status            public.report_status,
  out_category          text,
  out_subcategory       text,
  out_address           text,
  out_lat               double precision,
  out_lng               double precision,
  out_created_at        timestamptz,
  out_last_update       timestamptz,
  out_more_count        bigint,
  out_events            jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.v_public_reports%rowtype;
begin
  select * into v from public.v_public_reports where number = p_number;
  if not found then return; end if;
  if v.duplicate_of is not null then
    select * into v from public.v_public_reports where id = v.duplicate_of;
    if not found then return; end if;
  end if;

  return query
  select v.number, p_number, v.title, v.description, v.status, v.category_name, v.subcategory_name,
         v.public_address, v.lat, v.lng, v.created_at, v.last_update,
         (select count(*) from public.v_public_reports d where d.duplicate_of = v.id),
         (select coalesce(jsonb_agg(jsonb_build_object('status', e.status, 'note', e.note, 'at', e.created_at)
                                    order by e.created_at, e.id), '[]'::jsonb)
            from public.report_events e
           where e.report_id = v.id
             and e.status in ('new', 'sent', 'in_progress', 'resolved', 'closed'));
end;
$$;

revoke execute on function public.search_public_reports(text, integer, date, date, text, integer, integer) from public;
revoke execute on function public.public_map_points(integer, date, date, text, double precision, double precision, double precision, double precision) from public;
revoke execute on function public.get_public_report(bigint) from public;
grant execute on function public.search_public_reports(text, integer, date, date, text, integer, integer) to anon, authenticated;
grant execute on function public.public_map_points(integer, date, date, text, double precision, double precision, double precision, double precision) to anon, authenticated;
grant execute on function public.get_public_report(bigint) to anon, authenticated;