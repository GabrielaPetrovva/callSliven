-- 031_settlement_prefix_fix.sql
-- Поправка на settlement_from_address() от миграция 028: „Градско“ ставаше „ско“.
--
-- Правилото маха „гр.“, „град“, „с.“ и „село“ пред името, но „град“ и „село“ се махаха и когато са само начало
-- на думата. Видя се при теста на геокодера след миграция 030 (24.11.2026): адрес „Градско“ даваше населено
-- място „ско“ във филтъра. Сега „град“ и „село“ се махат само като отделна дума („град Сливен“, „село Кермен“).
-- Засегнато е само Градско: друго място в общината не започва с „Град“ или „Село“ като част от името.
--
-- Колоната reports.settlement се смята от тази функция, но стойността е записана в реда. Затова накрая
-- се преизчисляват само редовете, при които резултатът се променя. Тригерът за updated_at е изключен за
-- времето на промяната, за да не изглежда, че сигналите са променени от някого.

create or replace function public.settlement_from_address(p_address text)
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
  s := btrim(regexp_replace(s, '^([Гг]р\.|[Гг]рад\s|[Сс]\.|[Сс]ело\s)\s*', ''));
  if s = '' or char_length(s) > 60 or s ~ '[0-9]'
     or s ~ '^([Уу]л|[Бб]ул|[Пп]л|[Кк]в|[Жж]\.?\s?[Кк]|[Мм]-ст|[Мм]естност|[Пп]ът)[\s.]' then
    return null;
  end if;
  return s;
end;
$$;
revoke execute on function public.settlement_from_address(text) from public, anon, authenticated;

-- Проверка на правилото
do $$
declare
  bad text;
begin
  select string_agg(format('%s → %s (очаквано %s)', a, coalesce(public.settlement_from_address(a), 'нищо'), coalesce(e, 'нищо')), '; ')
    into bad
  from (values
    ('Градско', 'Градско'),
    ('Ул. Тунджа, Градско', 'Градско'),
    ('ул. Хаджи Димитър, Сливен', 'Сливен'),
    ('гр. Сливен', 'Сливен'),
    ('град Сливен', 'Сливен'),
    ('с. Кермен', 'Кермен'),
    ('село Кермен', 'Кермен'),
    ('Селиминово', 'Селиминово'),
    ('Ул. Васил Костов', null),
    ('кв. Речица', null),
    ('бул. Цар Освободител', null)
  ) as t(a, e)
  where public.settlement_from_address(a) is distinct from e;
  if bad is not null then raise exception 'settlement_from_address: %', bad; end if;
end $$;

-- Преизчисляване на засегнатите сигнали (без да се пипа updated_at)
alter table public.reports disable trigger reports_set_updated_at;
update public.reports
   set public_address = public_address
 where settlement is distinct from public.settlement_from_address(public_address);
alter table public.reports enable trigger reports_set_updated_at;
