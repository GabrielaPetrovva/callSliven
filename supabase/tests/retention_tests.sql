-- retention_tests.sql — проверки за миграция 029: рег. номер в писмото, хеш на IP (30 дни),
-- обезличаване на сигнали без профил (1 година след приключване) и снимките им. Не е миграция.
-- Пуска се в SQL Editor на callsliven-dev след 029. Накрая всичко се връща назад, затова излиза "ERROR" с резултата.

create temp table t29 (n serial primary key, label text, ok boolean not null, detail text);
grant all on t29 to public;
grant all on sequence t29_n_seq to public;

create function pg_temp.t29_as(r text, uid uuid default null)
returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', r, 'aal', 'aal1')::text, true);
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
  if r <> 'postgres' then execute format('set local role %I', r); end if;
end $$;

-- изпълнява заявка и сравнява резултата (един ред, една колона) или грешката
create function pg_temp.t29_expect(lbl text, q text, expect text)
returns void language plpgsql as $$
declare msg text; res text; good boolean;
begin
  begin execute q into res; msg := null; exception when others then msg := sqlerrm; end;
  good := coalesce(case when expect = 'ok' then msg is null
                        when expect = 'deny' then msg ilike '%permission denied%'
                        when expect = 'null' then msg is null and res is null
                        when msg is null then res = expect
                        else msg ilike '%' || expect || '%' end, false);
  insert into t29 (label, ok, detail) values (lbl, good, case when good then null
    else 'очаквано: ' || expect || ', получено: ' || coalesce(msg, res, 'null') end);
end $$;

create function pg_temp.t29_count(lbl text, q text, expected bigint)
returns void language plpgsql as $$
declare n bigint; msg text;
begin
  begin execute q into n; exception when others then msg := sqlerrm; end;
  insert into t29 (label, ok, detail) values (lbl, msg is null and n = expected,
    case when msg is not null then 'грешка: ' || msg when n <> expected then 'очаквани ' || expected || ', получени ' || n end);
end $$;

do $$
declare
  uo uuid := 'a1290000-0000-4000-8000-000000000001';   -- гражданин, който още има профил
  r_park  uuid := 'b2290000-0000-4000-8000-000000000001';   -- паркиране, без профил, затворен преди 13 месеца
  r_young uuid := 'b2290000-0000-4000-8000-000000000002';   -- без профил, затворен преди 6 месеца
  r_open  uuid := 'b2290000-0000-4000-8000-000000000003';   -- без профил, още в обработка (стар)
  r_owned uuid := 'b2290000-0000-4000-8000-000000000004';   -- с профил, затворен преди 2 години
  r_new   uuid := 'b2290000-0000-4000-8000-000000000005';   -- паркиране, нов, с профил (за писмото)
  s_park integer := (select id from public.subcategories where name = 'Неправилно паркиране, синя зона');
  s_hole integer := (select id from public.subcategories where name = 'Опасна дупка на улица');
  i_mob  integer := (select id from public.institutions where name = 'ОП „Градска мобилност“ (Община Сливен)');
  i_mvr  integer := (select id from public.institutions where name = 'ОДМВР – Сливен');
  i_tech integer := (select id from public.institutions where name = 'Община Сливен – Отдел „Техническа инфраструктура“');
  pt  extensions.geometry := extensions.st_setsrid(extensions.st_makepoint(26.3229, 42.6824), 4326);
  ppt extensions.geometry := extensions.st_setsrid(extensions.st_makepoint(26.323, 42.682), 4326);
  d1 bigint; d2 bigint; d3 bigint; d4 bigint;
  total integer; good integer; bad text;
begin
  insert into auth.users (id, email, encrypted_password, raw_user_meta_data, email_confirmed_at)
    values (uo, 'tst29-o@example.invalid', '', '{"first_name":"Тест","last_name":"Собственов"}', now());

  -- ===== Флагове =====
  perform pg_temp.t29_count('2 подкатегории пращат номера', $q$select count(*) from public.subcategories where plates_in_letter$q$, 2);
  perform pg_temp.t29_count('2 институции получават номера', $q$select count(*) from public.institutions where receives_plates$q$, 2);
  perform pg_temp.t29_count('ОП „Градска мобилност“ и ОДМВР са тези институции',
    format($q$select count(*) from public.institutions where receives_plates and id in (%s, %s)$q$, i_mob, i_mvr), 2);

  -- ===== Сигнали =====
  insert into public.reports (id, subcategory_id, title, description, status, public_point, public_address, created_at) values
    (r_park,  s_park, 'Кола [рег. номер] на тротоара', 'Колата [рег. номер] стои на тротоара, звънете на [номер]', 'closed', ppt, 'ул. Тестова, Сливен', now() - interval '14 months'),
    (r_young, s_hole, 'Дупка тест млад', 'Описание на дупка за тест на обезличаването', 'resolved', ppt, null, now() - interval '8 months'),
    (r_open,  s_hole, 'Дупка тест отворен', 'Описание на дупка за тест на обезличаването', 'in_progress', ppt, null, now() - interval '3 years'),
    (r_owned, s_hole, 'Дупка тест собственик', 'Описание на дупка за тест на обезличаването', 'closed', ppt, null, now() - interval '3 years'),
    (r_new,   s_park, 'Кола [рег. номер] пред входа', 'Колата [рег. номер] пречи, пишете на [имейл]', 'sent', ppt, null, now() - interval '2 days');

  insert into public.report_private (report_id, user_id, idempotency_key, original_title, original_description, exact_point, exact_address, reject_note) values
    (r_park,  null, gen_random_uuid(), 'Кола СА 1234 АВ на тротоара', 'Колата СА 1234 АВ стои на тротоара, звънете на 0888123456', pt, 'ул. Тестова 5, Сливен', 'вътрешна бележка'),
    (r_young, null, gen_random_uuid(), 'Дупка тест млад', 'Оригинално описание на дупката с подробности', pt, 'ул. Тестова 6, Сливен', null),
    (r_open,  null, gen_random_uuid(), 'Дупка тест отворен', 'Оригинално описание на дупката с подробности', pt, 'ул. Тестова 7, Сливен', null),
    (r_owned, uo,   gen_random_uuid(), 'Дупка тест собственик', 'Оригинално описание на дупката с подробности', pt, 'ул. Тестова 8, Сливен', null),
    (r_new,   uo,   gen_random_uuid(), 'Кола СА 1234 АВ пред входа', 'Колата СА 1234 АВ пречи, пишете на ivan@abv.bg', pt, 'ул. Тестова 9, Сливен', null);

  insert into public.report_admin (report_id, priority, institution_id, ip_hash) values
    (r_park,  'low',    i_mob,  'hash-park'),
    (r_young, 'medium', i_tech, 'hash-young'),
    (r_open,  'medium', i_tech, 'hash-open'),
    (r_owned, 'medium', i_tech, 'hash-owned'),
    (r_new,   'low',    i_mob,  'hash-new');

  insert into public.report_events (report_id, status, created_at) values
    (r_park,  'closed',      now() - interval '13 months'),
    (r_young, 'resolved',    now() - interval '6 months'),
    (r_open,  'in_progress', now() - interval '3 years'),
    (r_owned, 'closed',      now() - interval '2 years');

  insert into public.report_photos (report_id, position, path, content_type, size_bytes) values
    (r_park,  1, 'reports/' || r_park  || '/t29-1.jpg', 'image/jpeg', 1000),
    (r_owned, 1, 'reports/' || r_owned || '/t29-1.jpg', 'image/jpeg', 1000);

  -- ===== 1) Писмото =====
  insert into public.report_dispatches (report_id, institution_id, recipient_role, attempt, status, is_demo)
    values (r_new, i_mob, 'to', 1, 'manual', true) returning id into d1;
  insert into public.report_dispatches (report_id, institution_id, recipient_role, attempt, status, is_demo)
    values (r_new, i_tech, 'cc', 1, 'manual', true) returning id into d2;
  insert into public.report_dispatches (report_id, institution_id, recipient_role, attempt, status, is_demo)
    values (r_owned, i_mvr, 'to', 1, 'manual', true) returning id into d3;
  insert into public.report_dispatches (report_id, institution_id, recipient_role, attempt, status, is_demo)
    values (r_park, i_mob, 'to', 1, 'manual', true) returning id into d4;

  perform pg_temp.t29_expect('паркиране → Градска мобилност: оригиналното заглавие',
    format($q$select out_original_title from public.dispatch_get_payload(%s)$q$, d1), 'Кола СА 1234 АВ пред входа');
  perform pg_temp.t29_expect('паркиране → Градска мобилност: оригиналното описание',
    format($q$select out_original_description from public.dispatch_get_payload(%s)$q$, d1), 'Колата СА 1234 АВ пречи, пишете на ivan@abv.bg');
  perform pg_temp.t29_expect('публичният текст остава пречистен',
    format($q$select out_title from public.dispatch_get_payload(%s)$q$, d1), 'Кола [рег. номер] пред входа');
  perform pg_temp.t29_expect('паркиране → друга институция (копие): без оригинал',
    format($q$select out_original_title from public.dispatch_get_payload(%s)$q$, d2), 'null');
  perform pg_temp.t29_expect('друга подкатегория → ОДМВР: без оригинал',
    format($q$select out_original_title from public.dispatch_get_payload(%s)$q$, d3), 'null');

  -- ===== 2) Хеш на IP =====
  perform public.run_scheduled_job('purge_ip_hashes');
  perform pg_temp.t29_count('хешът на стар сигнал е изтрит',
    format($q$select count(*) from public.report_admin where report_id = %L and ip_hash is null$q$, r_owned), 1);
  perform pg_temp.t29_count('хешът на сигнал от преди 2 дни остава',
    format($q$select count(*) from public.report_admin where report_id = %L and ip_hash = 'hash-new'$q$, r_new), 1);

  -- ===== 3) Обезличаване =====
  perform public.run_scheduled_job('anonymize_orphan_reports');
  perform pg_temp.t29_count('без профил, затворен преди 13 месеца: обезличен',
    format($q$select count(*) from public.report_private where report_id = %L and anonymized_at is not null$q$, r_park), 1);
  perform pg_temp.t29_count('оригиналът е заменен с публичния текст',
    format($q$select count(*) from public.report_private p join public.reports r on r.id = p.report_id
              where p.report_id = %L and p.original_title = r.title and p.original_description = r.description
                and p.original_description not like '%%0888%%' and p.original_title not like '%%1234%%'$q$, r_park), 1);
  perform pg_temp.t29_count('точната точка е заменена с публичната, адресът е публичният',
    format($q$select count(*) from public.report_private p join public.reports r on r.id = p.report_id
              where p.report_id = %L and extensions.st_equals(p.exact_point, r.public_point)
                and p.exact_address is not distinct from r.public_address$q$, r_park), 1);
  perform pg_temp.t29_count('бележката при отхвърляне е изтрита',
    format($q$select count(*) from public.report_private where report_id = %L and reject_note is null$q$, r_park), 1);
  perform pg_temp.t29_count('сигналът остава публичен',
    format($q$select count(*) from public.reports where id = %L and status = 'closed'$q$, r_park), 1);
  perform pg_temp.t29_count('затворен преди 6 месеца: не е пипнат',
    format($q$select count(*) from public.report_private where report_id = %L and anonymized_at is null and exact_address = 'ул. Тестова 6, Сливен'$q$, r_young), 1);
  perform pg_temp.t29_count('още в обработка: не е пипнат',
    format($q$select count(*) from public.report_private where report_id = %L and anonymized_at is null$q$, r_open), 1);
  perform pg_temp.t29_count('с профил: не е пипнат',
    format($q$select count(*) from public.report_private where report_id = %L and anonymized_at is null$q$, r_owned), 1);
  perform pg_temp.t29_count('задачата е записана в журнала без грешки',
    $q$select count(*) from public.system_events where source in ('anonymize_orphan_reports', 'purge_ip_hashes') and level = 'error' and created_at >= now()$q$, 0);
  perform pg_temp.t29_expect('обезличен сигнал не дава оригинал на писмото',
    format($q$select out_original_title from public.dispatch_get_payload(%s)$q$, d4), 'null');

  -- повторно пускане не пипа вече обезличените
  update public.report_private set original_title = 'маркер 029' where report_id = r_park;
  perform public.run_scheduled_job('anonymize_orphan_reports');
  perform pg_temp.t29_count('повторното пускане не обезличава отново',
    format($q$select count(*) from public.report_private where report_id = %L and original_title = 'маркер 029'$q$, r_park), 1);

  -- новите сигнали пак минават през строгите граници
  perform pg_temp.t29_expect('нов сигнал с кратко заглавие се отказва',
    format($q$insert into public.report_private (report_id, user_id, idempotency_key, original_title, original_description, exact_point)
              values (%L, %L, gen_random_uuid(), 'аб', 'достатъчно дълго описание тук', %L)$q$, r_young, uo, pt),
    'original_title_check');

  -- ===== 3) Снимки =====
  perform pg_temp.t29_count('за изтриване е само снимката на обезличения',
    format($q$select count(*) from public.retention_photos_due() where out_path like 'reports/%s/%%'$q$, r_park), 1);
  perform pg_temp.t29_count('снимката на сигнал с профил не е за изтриване',
    format($q$select count(*) from public.retention_photos_due() where out_path like 'reports/%s/%%'$q$, r_owned), 0);
  perform pg_temp.t29_expect('чужд път не се трие',
    format($q$select public.retention_photos_removed(array[%L])$q$, 'reports/' || r_owned || '/t29-1.jpg'), '0');
  perform pg_temp.t29_expect('снимката на обезличения се маха от таблицата',
    format($q$select public.retention_photos_removed(array[%L])$q$, 'reports/' || r_park || '/t29-1.jpg'), '1');
  perform pg_temp.t29_count('снимката на сигнала с профил остава',
    format($q$select count(*) from public.report_photos where report_id = %L$q$, r_owned), 1);

  -- ===== Права =====
  perform pg_temp.t29_as('authenticated', uo);
  perform pg_temp.t29_expect('гражданин не вика retention_photos_due', $q$select count(*) from public.retention_photos_due()$q$, 'deny');
  perform pg_temp.t29_expect('гражданин не вика retention_photos_removed', $q$select public.retention_photos_removed('{}')$q$, 'deny');
  perform pg_temp.t29_expect('гражданин не вика run_scheduled_job', $q$select public.run_scheduled_job('purge_ip_hashes')$q$, 'deny');
  perform pg_temp.t29_expect('гражданин не вика dispatch_get_payload', format($q$select count(*) from public.dispatch_get_payload(%s)$q$, d1), 'deny');
  perform pg_temp.t29_as('anon');
  perform pg_temp.t29_expect('посетител не вика retention_photos_due', $q$select count(*) from public.retention_photos_due()$q$, 'deny');
  perform pg_temp.t29_expect('посетител не вика dispatch_get_payload', format($q$select count(*) from public.dispatch_get_payload(%s)$q$, d1), 'deny');
  perform pg_temp.t29_as('postgres');

  select count(*), count(*) filter (where ok) into total, good from t29;
  select string_agg(format('  ✗ %s — %s', label, detail), E'\n' order by n) into bad from t29 where not ok;
  raise exception '%', format(E'ТЕСТОВЕ ЗА СЪХРАНЕНИЕТО: %s от %s са наред.\n%s\n(Това „ERROR“ е нарочно: всички тестови данни са върнати назад.)',
                              good, total, case when bad is null then 'Няма проблеми.' else E'ПРОБЛЕМИ:\n' || bad end);
end $$;
