-- consent_tests.sql — проверки за повторното съгласие (миграция 025). Не е миграция.
-- Пуска се в SQL Editor на callsliven-dev след 025. Накрая всичко се връща назад, затова излиза "ERROR" с резултата.

create temp table t25 (n serial primary key, label text, ok boolean not null, detail text);
grant all on t25 to public;
grant all on sequence t25_n_seq to public;

create function pg_temp.t25_as(r text, uid uuid default null)
returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', r, 'aal', 'aal1')::text, true);
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
  if r <> 'postgres' then execute format('set local role %I', r); end if;
end $$;

create function pg_temp.t25_expect(lbl text, q text, expect text)
returns void language plpgsql as $$
declare msg text; good boolean;
begin
  begin execute q; msg := null; exception when others then msg := sqlerrm; end;
  good := coalesce(case when expect = 'ok' then msg is null
                        when expect = 'deny' then msg ilike '%permission denied%'
                        else msg ilike '%' || expect || '%' end, false);
  insert into t25 (label, ok, detail) values (lbl, good, case when good then null else 'очаквано: ' || expect || ', получено: ' || coalesce(msg, 'без грешка') end);
end $$;

create function pg_temp.t25_count(lbl text, q text, expected bigint)
returns void language plpgsql as $$
declare n bigint; msg text;
begin
  begin execute q into n; exception when others then msg := sqlerrm; end;
  insert into t25 (label, ok, detail) values (lbl, msg is null and n = expected,
    case when msg is not null then 'грешка: ' || msg when n <> expected then 'очаквани ' || expected || ', получени ' || n end);
end $$;

do $$
declare
  ua uuid := 'a1250000-0000-4000-8000-000000000001';
  ub uuid := 'b2250000-0000-4000-8000-000000000002';
  total integer; good integer; bad text;
begin
  insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
    (ua, 'tst25-a@example.invalid', '{"first_name":"Тест","last_name":"Първов","consent_version":"v1"}', now()),
    (ub, 'tst25-b@example.invalid', '{"first_name":"Тест","last_name":"Второв","consent_version":"v1"}', now());

  perform pg_temp.t25_as('anon');
  perform pg_temp.t25_expect('посетител не вика accept_policy', $q$select public.accept_policy('v2')$q$, 'deny');

  perform pg_temp.t25_as('authenticated', ua);
  perform pg_temp.t25_expect('гражданин не пише сам в consent_version',
    format($q$update public.profiles set consent_version = 'v9' where id = %L$q$, ua), 'deny');
  perform pg_temp.t25_expect('невалидна версия е отказана', $q$select public.accept_policy('v2; drop table x')$q$, 'invalid_version');
  perform pg_temp.t25_expect('празна версия е отказана', $q$select public.accept_policy('  ')$q$, 'invalid_version');
  perform pg_temp.t25_expect('гражданин приема v2', $q$select public.accept_policy(' v2 ')$q$, 'ok');

  perform pg_temp.t25_as('postgres');
  perform pg_temp.t25_count('профилът е с v2 и с час', format($q$select count(*) from public.profiles where id = %L and consent_version = 'v2' and consent_at > now() - interval '1 minute'$q$, ua), 1);
  perform pg_temp.t25_count('другият профил не е пипнат', format($q$select count(*) from public.profiles where id = %L and consent_version = 'v1'$q$, ub), 1);
  perform pg_temp.t25_count('съгласието е в журнала', format($q$select count(*) from public.audit_log where action = 'consent.accepted' and entity_id = %L and details ->> 'version' = 'v2'$q$, ua::text), 1);

  select count(*), count(*) filter (where ok) into total, good from t25;
  select string_agg(format('  ✗ %s — %s', label, detail), E'\n' order by n) into bad from t25 where not ok;
  raise exception '%', format(E'ТЕСТОВЕ ЗА СЪГЛАСИЕТО: %s от %s са наред.\n%s\n(Това „ERROR“ е нарочно: всички тестови данни са върнати назад.)',
                              good, total, case when bad is null then 'Няма проблеми.' else E'ПРОБЛЕМИ:\n' || bad end);
end $$;
