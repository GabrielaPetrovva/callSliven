-- 028_public_filters.sql
-- Филтри по статус и населено място в публичния списък и на картата (reports.html).
--
-- Населеното място не се пита отделно: то вече е последната част от публичния адрес, който submit-report
-- записва от геокодера, напр. „ул. Хаджи Димитър, Сливен“ → „Сливен“, „Кермен“ → „Кермен“.
-- Колоната reports.settlement се смята от public_address автоматично (generated column), затова:
--   - старите сигнали я получават веднага при тази миграция;
--   - новите я получават при създаване, без промяна в Edge Function;
--   - сигнал без адрес (геокодерът не е отговорил) остава без населено място и не излиза при този филтър.
-- Публичният адрес вече е публичен, така че колоната не разкрива нищо ново.

-- ===== 1. Населено място от адреса =====

-- Последната част след запетая, без „гр.“ / „с.“. Ако прилича на улица или квартал (или съдържа цифри),
-- значи геокодерът не е върнал населено място: тогава е null, за да не влиза улица в списъка с места.
create function public.settlement_from_address(p_address text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  s text;
begin
  if p_address is null then return null; end if;
  s := btrim(regexp_replace(p_address, '^.*,', ''));
  s := btrim(regexp_replace(s, '^([Гг]р\.|[Гг]рад|[Сс]\.|[Сс]ело)\s*', ''));
  if s = '' or char_length(s) > 60 or s ~ '[0-9]'
     or s ~ '^([Уу]л|[Бб]ул|[Пп]л|[Кк]в|[Жж]\.?\s?[Кк]|[Мм]-ст|[Мм]естност|[Пп]ът)[\s.]' then
    return null;
  end if;
  return s;
end;
$$;
revoke execute on function public.settlement_from_address(text) from public, anon, authenticated;

alter table public.reports
  add column settlement text generated always as (public.settlement_from_address(public_address)) stored;
create index reports_settlement_idx on public.reports (settlement) where settlement is not null;

-- Вътрешният публичен изглед получава колоната (добавена накрая, другите колони са същите като в 014)
create or replace view public.v_public_reports as
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
       r.duplicate_of,
       r.settlement
from public.reports r
join public.subcategories s on s.id = r.subcategory_id
join public.categories c on c.id = s.category_id
where r.status in ('new', 'sent', 'in_progress', 'resolved', 'closed')
  and not r.needs_review;
revoke all on public.v_public_reports from public, anon, authenticated;

-- ===== 2. Списък и карта с новите филтри =====
-- Подписът се сменя (два нови параметъра накрая), затова старите функции се махат.
-- Сайтът ги вика с имена на параметрите, така че старите извиквания (index, auth) работят без промяна.
drop function public.search_public_reports(text, integer, date, date, text, integer, integer);
drop function public.public_map_points(integer, date, date, text, double precision, double precision, double precision, double precision);

create function public.search_public_reports(
  p_query       text                  default null,
  p_category_id integer               default null,
  p_from        date                  default null,
  p_to          date                  default null,
  p_sort        text                  default 'newest',     -- newest | oldest | updated
  p_limit       integer               default 20,
  p_offset      integer               default 0,
  p_statuses    public.report_status[] default null,        -- null или празно = всички публични
  p_settlement  text                  default null          -- точно име от public_settlements()
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
  place text := nullif(left(trim(coalesce(p_settlement, '')), 60), '');
  sts public.report_status[] := case when cardinality(p_statuses) > 0 then p_statuses end;
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
    and (sts is null or v.status = any (sts))
    and (place is null or v.settlement = place)
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

create function public.public_map_points(
  p_category_id integer                default null,
  p_from        date                   default null,
  p_to          date                   default null,
  p_query       text                   default null,
  p_min_lng     double precision       default null,
  p_min_lat     double precision       default null,
  p_max_lng     double precision       default null,
  p_max_lat     double precision       default null,
  p_statuses    public.report_status[] default null,
  p_settlement  text                   default null
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
  place text := nullif(left(trim(coalesce(p_settlement, '')), 60), '');
  sts public.report_status[] := case when cardinality(p_statuses) > 0 then p_statuses end;
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
    and (sts is null or v.status = any (sts))
    and (place is null or v.settlement = place)
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

-- ===== 3. Населените места за падащото меню =====
-- Само места с поне един публичен сигнал; Сливен първо, после по азбучен ред.
create function public.public_settlements()
returns table (out_settlement text, out_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select v.settlement, count(*)
  from public.v_public_reports v
  where v.duplicate_of is null and v.settlement is not null
  group by v.settlement
  order by (v.settlement = 'Сливен') desc, v.settlement;
$$;

revoke execute on function public.search_public_reports(text, integer, date, date, text, integer, integer, public.report_status[], text) from public;
revoke execute on function public.public_map_points(integer, date, date, text, double precision, double precision, double precision, double precision, public.report_status[], text) from public;
revoke execute on function public.public_settlements() from public;
grant execute on function public.search_public_reports(text, integer, date, date, text, integer, integer, public.report_status[], text) to anon, authenticated;
grant execute on function public.public_map_points(integer, date, date, text, double precision, double precision, double precision, double precision, public.report_status[], text) to anon, authenticated;
grant execute on function public.public_settlements() to anon, authenticated;
