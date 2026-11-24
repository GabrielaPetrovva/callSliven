-- 030_settlements.sql
-- Населените места в община Сливен, за да има село в адреса там, където геокодерът не го дава.
--
-- Тестът на геокодера (tools/geocoder-test.html, 24.11.2026) показа, че в 5 от 15 села (Градско, Ковачите,
-- Самуилово, Глушник, Новачево) Geoapify връща само най-близкия път („TT1, SL, България“) или улица без село.
-- Тогава сигналът оставаше без населено място: публичният адрес беше „Ул. Тунджа“ или празен, точният адрес до
-- институцията беше код на път, а сигналът не излизаше във филтъра по населено място (миграция 028).
--
-- Geoapify понякога дава и „Сливен“ за точка извън града (в теста: разклона за Сотиря), защото връща общината.
-- Затова submit-report пита nearest_settlement() за всеки сигнал. Ако точката е в някое място от този списък,
-- името е оттам; иначе остава това от геокодера. „В мястото“ значи до 1,5 км от центъра на село или махала,
-- до 2 км от Кермен и до 5 км от центъра на Сливен. Границите на селата (землищата) ги няма в OpenStreetMap
-- (от 45 села има само 2), затова се ползва разстоянието до центъра. Праговете са малки нарочно: точка в нива
-- между две села остава без село, вместо да получи грешно. Точното място винаги е в координатите на сигнала.
-- Колоната reports.settlement (028) се смята от публичния адрес, така че новите сигнали влизат във филтъра.
--
-- Източник: OpenStreetMap (ODbL), © OpenStreetMap contributors. Точките place=city|town|village|hamlet в
-- границата на община Сливен (релация 1947828, същата като в 010), изтеглени през Overpass на 24.11.2026.

create table public.settlements (
  id    smallint generated always as identity primary key,
  name  text not null unique check (char_length(name) between 2 and 60),
  kind  text not null check (kind in ('city', 'town', 'village', 'hamlet')),
  point extensions.geometry(point, 4326) not null
);
comment on table public.settlements is
  'Населени места в община Сливен от OpenStreetMap (ODbL). Чете се само през nearest_settlement().';

-- Никой не чете таблицата директно: само функцията по-долу (security definer).
alter table public.settlements enable row level security;
revoke all on public.settlements from public, anon, authenticated;

create index settlements_point_idx on public.settlements using gist (point);

insert into public.settlements (name, kind, point)
select v.name, v.kind, extensions.st_setsrid(extensions.st_makepoint(v.lng, v.lat), 4326)
from (values
  ('Сливен', 'city', 42.6817633, 26.3153528),
  ('Драгоданово', 'village', 42.6318751, 26.5633750),
  ('Панаретовци', 'village', 42.5640599, 26.3006000),
  ('Ковачите', 'village', 42.5750389, 26.2241389),
  ('Горно Александрово', 'village', 42.6551435, 26.6283912),
  ('Старо село', 'village', 42.5816943, 26.1490238),
  ('Чинтулово', 'village', 42.6484700, 26.2348200),
  ('Новачево', 'village', 42.7525400, 26.1588999),
  ('Биково', 'village', 42.4755927, 26.1898508),
  ('Градско', 'village', 42.7663600, 26.1235799),
  ('Въглен', 'village', 42.7518486, 26.2264941),
  ('Раково', 'village', 42.7994100, 26.3041700),
  ('Бяла', 'village', 42.7310400, 26.1897600),
  ('Гергевец', 'village', 42.5904901, 26.3440299),
  ('Самуилово', 'village', 42.5888700, 26.3202999),
  ('Блатец', 'village', 42.6281497, 26.5371802),
  ('Стара река', 'village', 42.8810800, 26.1840000),
  ('Струпец', 'village', 42.6174499, 26.1135799),
  ('Младово', 'village', 42.5288183, 26.2088114),
  ('Злати войвода', 'village', 42.5865000, 26.1913000),
  ('Мъсърлии', 'hamlet', 42.8879276, 26.1530553),
  ('Изгрев', 'village', 42.8865300, 26.1085600),
  ('Божевци', 'village', 42.8658709, 26.1332571),
  ('Тополчане', 'village', 42.6512453, 26.4267498),
  ('Средорек', 'village', 42.8727100, 26.1516500),
  ('Желю войвода', 'village', 42.5950901, 26.4815399),
  ('Зайчари', 'village', 42.9230000, 26.1947800),
  ('Ръченица', 'hamlet', 42.9350200, 26.1786800),
  ('Ичера', 'village', 42.7673100, 26.4514100),
  ('Чокоба', 'village', 42.5175400, 26.3562699),
  ('Бинкос', 'village', 42.6483223, 26.0975947),
  ('Гавраилово', 'village', 42.6437226, 26.1795785),
  ('Голямо Чочовени', 'village', 42.6704900, 26.1421199),
  ('Крушаре', 'village', 42.5621707, 26.3772638),
  ('Мечкарево', 'village', 42.5958199, 26.2795799),
  ('Николаево', 'village', 42.5419366, 26.2696142),
  ('Сотиря', 'village', 42.6922900, 26.4041200),
  ('Глушник', 'village', 42.6592703, 26.5043934),
  ('Калояново', 'village', 42.6596701, 26.4625299),
  ('Бозаджии', 'village', 42.4787927, 26.3281808),
  ('Трапоклово', 'village', 42.6476396, 26.5941310),
  ('Глуфишево', 'village', 42.5443199, 26.3226200),
  ('Малко Чочовени', 'village', 42.6515964, 26.2043595),
  ('Селиминово', 'village', 42.6452499, 26.1533999),
  ('Скобелево', 'village', 42.4888959, 26.3096229),
  ('Камен', 'village', 42.6024700, 26.4172099),
  ('Кермен', 'town', 42.5056243, 26.2560569)
) as v(name, kind, lat, lng);

-- Защита: очакваме 47 места и всички в границата на общината
do $$
declare
  outside text;
begin
  if (select count(*) from public.settlements) <> 47 then
    raise exception 'Очаквани 47 населени места, намерени %', (select count(*) from public.settlements);
  end if;
  select string_agg(s.name, ', ') into outside
  from public.settlements s
  where not exists (
    select 1 from public.boundaries b where b.is_active and extensions.st_intersects(b.geom, s.point)
  );
  if outside is not null then
    raise exception 'Извън границата на общината: %', outside;
  end if;
end $$;

-- Населеното място, в което е точката: най-близкото до 1,5 км от село или махала, до 2 км от Кермен, до 5 км от Сливен.
-- null, ако точката не е в никое (например в нива между две села).
create function public.nearest_settlement(p_lat double precision, p_lng double precision)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.name
  from public.settlements s,
       lateral (select extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography as g) p
  where p_lat between -90 and 90 and p_lng between -180 and 180
    and extensions.st_dwithin(s.point::extensions.geography, p.g, case s.kind when 'city' then 5000 when 'town' then 2000 else 1500 end)
  order by extensions.st_distance(s.point::extensions.geography, p.g), s.id
  limit 1;
$$;

-- Вика я само submit-report (service_role). Сайтът не я ползва.
revoke execute on function public.nearest_settlement(double precision, double precision) from public, anon, authenticated;
grant execute on function public.nearest_settlement(double precision, double precision) to service_role;
