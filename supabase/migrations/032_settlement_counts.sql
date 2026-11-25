-- 032_settlement_counts.sql
-- Броят до всяко населено място в менюто на reports.html следва другите филтри.
--
-- До сега public_settlements() (миграция 028) броеше всички публични сигнали. При избрана категория,
-- статус, период или търсене менюто пак показваше например „Кермен 12“, а списъкът беше празен.
-- Сега функцията приема същите филтри като search_public_reports / public_map_points, без самото място
-- (иначе всички други места биха показали 0 и менюто не би помагало за избор).
--
-- Списъкът с места остава същият: всяко място с поне един публичен сигнал, Сливен първо, после по азбучен ред.
-- Място без сигнали по текущите филтри се връща с брой 0, вместо да изчезне, за да не „скача“ менюто
-- и избраното място да не се губи при смяна на категорията.

drop function public.public_settlements();

create function public.public_settlements(
  p_query       text                   default null,
  p_category_id integer                default null,
  p_from        date                   default null,
  p_to          date                   default null,
  p_statuses    public.report_status[] default null
)
returns table (out_settlement text, out_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  q text := nullif(left(trim(coalesce(p_query, '')), 100), '');
  pat text;
  sts public.report_status[] := case when cardinality(p_statuses) > 0 then p_statuses end;
begin
  if q is not null and char_length(q) < 2 then q := null; end if;
  if q is not null then
    pat := '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query
  select v.settlement,
         count(*) filter (where
               (p_category_id is null or v.category_id = p_category_id)
           and (sts is null or v.status = any (sts))
           and (p_from is null or v.created_at >= (p_from::timestamp at time zone 'Europe/Sofia'))
           and (p_to is null or v.created_at < ((p_to + 1)::timestamp at time zone 'Europe/Sofia'))
           and (q is null
                or (v.title || ' ' || v.description) ilike pat
                or extensions.word_similarity(q, v.title || ' ' || v.description) >= 0.5))
  from public.v_public_reports v
  where v.duplicate_of is null and v.settlement is not null
  group by v.settlement
  order by (v.settlement = 'Сливен') desc, v.settlement;
end;
$$;

revoke execute on function public.public_settlements(text, integer, date, date, public.report_status[]) from public;
grant execute on function public.public_settlements(text, integer, date, date, public.report_status[]) to anon, authenticated;

-- Проверка: без филтри броят е същият като преди (всички публични сигнали с място, без дубликатите)
do $$
declare
  got bigint; want bigint;
begin
  select coalesce(sum(out_count), 0) into got from public.public_settlements();
  select count(*) into want from public.v_public_reports v where v.duplicate_of is null and v.settlement is not null;
  if got <> want then
    raise exception 'public_settlements(): сборът е %, очакван %', got, want;
  end if;
end $$;
