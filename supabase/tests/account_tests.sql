-- account_tests.sql — проверки за смяната на имейл и изтриването на профил (миграция 026). Не е миграция.
-- Пуска се в SQL Editor на callsliven-dev след 026. Накрая всичко се връща назад, затова излиза "ERROR" с резултата.

create temp table t26 (n serial primary key, label text, ok boolean not null, detail text);
grant all on t26 to public;
grant all on sequence t26_n_seq to public;

create function pg_temp.t26_as(r text, uid uuid default null)
returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', r, 'aal', 'aal1')::text, true);
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
  if r <> 'postgres' then execute format('set local role %I', r); end if;
end $$;

-- изпълнява заявка и сравнява резултата (един ред, една колона) или грешката
create function pg_temp.t26_expect(lbl text, q text, expect text)
returns void language plpgsql as $$
declare msg text; res text; good boolean;
begin
  begin execute q into res; msg := null; exception when others then msg := sqlerrm; end;
  good := coalesce(case when expect = 'ok' then msg is null
                        when expect = 'deny' then msg ilike '%permission denied%'
                        when msg is null then res = expect
                        else msg ilike '%' || expect || '%' end, false);
  insert into t26 (label, ok, detail) values (lbl, good, case when good then null
    else 'очаквано: ' || expect || ', получено: ' || coalesce(msg, res, 'null') end);
end $$;

create function pg_temp.t26_count(lbl text, q text, expected bigint)
returns void language plpgsql as $$
declare n bigint; msg text;
begin
  begin execute q into n; exception when others then msg := sqlerrm; end;
  insert into t26 (label, ok, detail) values (lbl, msg is null and n = expected,
    case when msg is not null then 'грешка: ' || msg when n <> expected then 'очаквани ' || expected || ', получени ' || n end);
end $$;

do $$
declare
  ua uuid := 'a1260000-0000-4000-8000-000000000001';   -- гражданин, който изтрива профила си
  ub uuid := 'b2260000-0000-4000-8000-000000000002';   -- гражданин, който сменя имейла
  uc uuid := 'c3260000-0000-4000-8000-000000000003';   -- гражданин с много грешни пароли
  ud uuid := 'd4260000-0000-4000-8000-000000000004';   -- администратор
  rep uuid := 'e5260000-0000-4000-8000-000000000005';
  pw text := 'зелен-балкон-сливен-7';
  total integer; good integer; bad text;
begin
  insert into auth.users (id, email, encrypted_password, raw_user_meta_data, email_confirmed_at) values
    (ua, 'tst26-a@example.invalid', extensions.crypt(pw, extensions.gen_salt('bf')), '{"first_name":"Тест","last_name":"Първов"}', now()),
    (ub, 'tst26-b@example.invalid', extensions.crypt(pw, extensions.gen_salt('bf')), '{"first_name":"Тест","last_name":"Второв"}', now()),
    (uc, 'tst26-c@example.invalid', extensions.crypt(pw, extensions.gen_salt('bf')), '{"first_name":"Тест","last_name":"Третов"}', now()),
    (ud, 'tst26-d@example.invalid', extensions.crypt(pw, extensions.gen_salt('bf')), '{"first_name":"Тест","last_name":"Админов"}', now());
  update public.profiles set role = 'admin' where id = ud;

  -- сигнал на A, известие в опашката и временна снимка
  insert into public.reports (id, subcategory_id, title, description, public_point)
    values (rep, (select min(id) from public.subcategories), 'Тестов сигнал 026', 'Описание на тестовия сигнал за миграция 026',
            extensions.st_setsrid(extensions.st_makepoint(26.32, 42.68), 4326));
  insert into public.report_private (report_id, user_id, idempotency_key, original_title, original_description, exact_point)
    values (rep, ua, gen_random_uuid(), 'Тестов сигнал 026', 'Описание на тестовия сигнал за миграция 026',
            extensions.st_setsrid(extensions.st_makepoint(26.32, 42.68), 4326));
  insert into public.email_outbox (kind, user_id, report_id) values ('report_rejected', ua, rep);
  insert into storage.objects (bucket_id, name, owner, owner_id)
    values ('report-photos', 'tmp/' || ua || '/t26/test.jpg', ua, ua::text);

  -- права
  perform pg_temp.t26_as('anon');
  perform pg_temp.t26_expect('посетител не вика delete_my_account', format($q$select public.delete_my_account(%L)$q$, pw), 'deny');
  perform pg_temp.t26_as('authenticated', ua);
  perform pg_temp.t26_expect('гражданин не трие директно от auth.users', format($q$delete from auth.users where id = %L$q$, ua), 'deny');

  -- грешна парола
  perform pg_temp.t26_expect('грешна парола', $q$select public.delete_my_account('грешна-парола-123')$q$, 'wrong_password');
  perform pg_temp.t26_expect('празна парола', $q$select public.delete_my_account(null)$q$, 'wrong_password');
  perform pg_temp.t26_as('postgres');
  perform pg_temp.t26_count('грешните пароли са записани', format($q$select count(*) from public.security_events where event_type = 'account_delete_failed' and user_id = %L$q$, ua), 2);
  perform pg_temp.t26_count('профилът на A още е тук', format($q$select count(*) from public.profiles where id = %L$q$, ua), 1);

  -- служител
  perform pg_temp.t26_as('authenticated', ud);
  perform pg_temp.t26_expect('служител не се изтрива оттук', format($q$select public.delete_my_account(%L)$q$, pw), 'staff_account');
  perform pg_temp.t26_as('postgres');
  perform pg_temp.t26_count('служителят е запазен', format($q$select count(*) from auth.users where id = %L$q$, ud), 1);

  -- 5 грешни пароли за час спират и верната
  perform pg_temp.t26_as('authenticated', uc);
  for i in 1..5 loop
    perform pg_temp.t26_expect('C: грешна парола №' || i, format($q$select public.delete_my_account(%L)$q$, 'грешна-' || i), 'wrong_password');
  end loop;
  perform pg_temp.t26_expect('след 5 грешни пароли: изчакай', format($q$select public.delete_my_account(%L)$q$, pw), 'too_many_attempts');
  perform pg_temp.t26_as('postgres');
  perform pg_temp.t26_count('C не е изтрит', format($q$select count(*) from auth.users where id = %L$q$, uc), 1);

  -- изтриване с вярна парола
  perform pg_temp.t26_as('authenticated', ua);
  perform pg_temp.t26_expect('A изтрива профила си', format($q$select public.delete_my_account(%L)$q$, pw), 'deleted');
  perform pg_temp.t26_as('postgres');
  perform pg_temp.t26_count('A го няма в auth.users', format($q$select count(*) from auth.users where id = %L$q$, ua), 0);
  perform pg_temp.t26_count('профилът на A е изтрит', format($q$select count(*) from public.profiles where id = %L$q$, ua), 0);
  perform pg_temp.t26_count('сигналът остава', format($q$select count(*) from public.reports where id = %L$q$, rep), 1);
  perform pg_temp.t26_count('сигналът е без връзка с A', format($q$select count(*) from public.report_private where report_id = %L and user_id is null$q$, rep), 1);
  perform pg_temp.t26_count('неизпратеното известие е махнато', format($q$select count(*) from public.email_outbox where user_id = %L$q$, ua), 0);
  perform pg_temp.t26_count('снимката е без собственик', format($q$select count(*) from storage.objects where name = %L and owner is null$q$, 'tmp/' || ua || '/t26/test.jpg'), 1);
  perform pg_temp.t26_count('изтриването е в журнала', format($q$select count(*) from public.audit_log where action = 'account.deleted' and entity_id = %L and actor_role = 'citizen' and details ->> 'reports' = '1'$q$, ua::text), 1);
  perform pg_temp.t26_count('другите профили не са пипнати', format($q$select count(*) from auth.users where id in (%L, %L, %L)$q$, ub, uc, ud), 3);

  -- смяна на имейл (Supabase Auth сменя auth.users.email след двата кода)
  update auth.users set email = 'Tst26-New+tag@Example.invalid' where id = ub;
  perform pg_temp.t26_count('email_normalized следва новия имейл', format($q$select count(*) from public.profiles where id = %L and email_normalized = 'tst26-new@example.invalid'$q$, ub), 1);
  perform pg_temp.t26_count('смяната е в журнала', format($q$select count(*) from public.audit_log where action = 'account.email_changed' and entity_id = %L and actor_id = %L$q$, ub::text, ub), 1);
  perform pg_temp.t26_count('в журнала няма адреси', format($q$select count(*) from public.audit_log where entity_id = %L and details::text ilike '%%@%%'$q$, ub::text), 0);

  select count(*), count(*) filter (where ok) into total, good from t26;
  select string_agg(format('  ✗ %s — %s', label, detail), E'\n' order by n) into bad from t26 where not ok;
  raise exception '%', format(E'ТЕСТОВЕ ЗА ПРОФИЛА: %s от %s са наред.\n%s\n(Това „ERROR“ е нарочно: всички тестови данни са върнати назад.)',
                              good, total, case when bad is null then 'Няма проблеми.' else E'ПРОБЛЕМИ:\n' || bad end);
end $$;