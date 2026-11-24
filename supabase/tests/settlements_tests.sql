-- settlements_tests.sql — проверки за населените места (миграция 030). Не е миграция.
-- Пуска се в SQL Editor на callsliven-dev след 030. Накрая всичко се връща назад, затова излиза "ERROR" с резултата.
-- Точките за селата са от теста на геокодера (24.11.2026), където Geoapify не върна населено място.

create temp table t30 (n serial primary key, label text, ok boolean not null, detail text);
grant all on t30 to public;
grant all on sequence t30_n_seq to public;

create function pg_temp.t30_as(r text)
returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('role', r)::text, true);
  if r <> 'postgres' then execute format('set local role %I', r); end if;
end $$;

create function pg_temp.t30_expect(lbl text, q text, expect text)
returns void language plpgsql as $$
declare msg text; good boolean;
begin
  begin execute q; msg := null; exception when others then msg := sqlerrm; end;
  good := coalesce(case when expect = 'ok' then msg is null
                        when expect = 'deny' then msg ilike '%permission denied%'
                        else msg ilike '%' || expect || '%' end, false);
  insert into t30 (label, ok, detail) values (lbl, good, case when good then null else 'очаквано: ' || expect || ', получено: ' || coalesce(msg, 'без грешка') end);
end $$;

-- сравнява резултата от nearest_settlement с очакваното име (null = няма място наблизо)
create function pg_temp.t30_place(lbl text, lat double precision, lng double precision, expected text)
returns void language plpgsql as $$
declare got text; msg text;
begin
  begin got := public.nearest_settlement(lat, lng); exception when others then msg := sqlerrm; end;
  insert into t30 (label, ok, detail) values (lbl, msg is null and got is not distinct from expected,
    case when msg is not null then 'грешка: ' || msg
         when got is distinct from expected then 'очаквано: ' || coalesce(expected, 'нищо') || ', получено: ' || coalesce(got, 'нищо') end);
end $$;

do $$
declare
  total integer; good integer; bad text; cnt integer;
begin
  perform pg_temp.t30_as('postgres');
  select count(*) into cnt from public.settlements;
  insert into t30 (label, ok, detail) values ('47 населени места', cnt = 47, case when cnt <> 47 then 'получени ' || cnt end);

  perform pg_temp.t30_as('anon');
  perform pg_temp.t30_expect('посетител не вика nearest_settlement', $q$select public.nearest_settlement(42.68, 26.32)$q$, 'deny');
  perform pg_temp.t30_expect('посетител не чете таблицата', $q$select count(*) from public.settlements$q$, 'deny');

  perform pg_temp.t30_as('authenticated');
  perform pg_temp.t30_expect('гражданин не вика nearest_settlement', $q$select public.nearest_settlement(42.68, 26.32)$q$, 'deny');
  perform pg_temp.t30_expect('гражданин не чете таблицата', $q$select count(*) from public.settlements$q$, 'deny');
  perform pg_temp.t30_expect('гражданин не пише в таблицата', $q$insert into public.settlements (name, kind, point) values ('Х', 'village', extensions.st_setsrid(extensions.st_makepoint(26.3, 42.6), 4326))$q$, 'deny');

  -- submit-report вика функцията като service_role
  perform pg_temp.t30_as('service_role');
  perform pg_temp.t30_place('Градско (геокодерът даде само TT1)', 42.76636, 26.12358, 'Градско');
  perform pg_temp.t30_place('Ковачите, 500 м от центъра', 42.57950, 26.22414, 'Ковачите');
  perform pg_temp.t30_place('Самуилово', 42.58887, 26.32030, 'Самуилово');
  perform pg_temp.t30_place('Глушник', 42.65927, 26.50439, 'Глушник');
  perform pg_temp.t30_place('Новачево', 42.75254, 26.15890, 'Новачево');
  perform pg_temp.t30_place('Сливен, 3,4 км от центъра (градът е до 5 км)', 42.70000, 26.28000, 'Сливен');
  perform pg_temp.t30_place('Кермен, 1,8 км от центъра (до 2 км)', 42.50562, 26.27800, 'Кермен');
  perform pg_temp.t30_place('разклона за Сотиря (Geoapify каза „Сливен“): нищо, не е в селото', 42.69449, 26.37411, null);
  perform pg_temp.t30_place('нива на 2 км от Ковачите: нищо', 42.59300, 26.22414, null);
  perform pg_temp.t30_place('в планината, на 9 км от всяко село: нищо', 42.84000, 26.40000, null);
  perform pg_temp.t30_place('невалидни координати: нищо', 95, 26.3, null);

  perform pg_temp.t30_as('postgres');
  select count(*), count(*) filter (where ok) into total, good from t30;
  select string_agg(format('  ✗ %s — %s', label, detail), E'\n' order by n) into bad from t30 where not ok;
  raise exception '%', format(E'ТЕСТОВЕ ЗА НАСЕЛЕНИТЕ МЕСТА: %s от %s са наред.\n%s\n(Това „ERROR“ е нарочно: всички тестови данни са върнати назад.)',
                              good, total, case when bad is null then 'Няма проблеми.' else E'ПРОБЛЕМИ:\n' || bad end);
end $$;
