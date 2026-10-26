-- access_tests.sql — проверка кой какво може да прави (не е миграция, не променя нищо)
--
-- Пуска се в SQL Editor на callsliven-dev (и после на callsliven-prod преди представянето).
-- Създава тестови потребители и сигнали, проверява ги от името на всяка роля
-- (посетител, потребител, администратор без/със MFA, Super Admin, service_role)
-- и накрая връща ВСИЧКО назад. Резултатът излиза като "ERROR" със съобщение:
-- това е нарочно, за да не остане нищо в базата.

create temp table t16 (
  n      serial primary key,
  grp    text,
  label  text,
  ok     boolean not null,
  detail text
);
grant all on t16 to public;
grant all on sequence t16_n_seq to public;

-- Превключва ролята като Supabase при заявка от интернет.
create function pg_temp.t16_as(r text, uid uuid default null, aal text default 'aal1')
returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', r, 'aal', aal)::text, true);
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
  if r <> 'postgres' then
    execute format('set local role %I', r);
  end if;
end $$;

-- Изпълнява заявка и сравнява резултата с очакването:
--   'ok'   — минава без грешка
--   'deny' — отказан достъп (permission denied / row-level security)
--   'err'  — всякаква грешка
--   друго  — грешката съдържа този текст (напр. 'not_staff')
create function pg_temp.t16_expect(g text, lbl text, q text, expect text)
returns void language plpgsql as $$
declare
  msg text;
  good boolean;
begin
  begin
    execute q;
    msg := null;
  exception when others then
    msg := sqlerrm;
  end;
  good := coalesce(case
    when expect = 'ok'   then msg is null
    when expect = 'deny' then msg ilike '%permission denied%' or msg ilike '%row-level security%'
    when expect = 'err'  then msg is not null
    else msg ilike '%' || expect || '%'
  end, false);
  insert into t16 (grp, label, ok, detail)
  values (g, lbl, good, case when good then null
                             else 'очаквано: ' || expect || ', получено: ' || coalesce(msg, 'без грешка') end);
end $$;

-- Проверява брой редове, които ролята вижда.
create function pg_temp.t16_count(g text, lbl text, q text, expected bigint)
returns void language plpgsql as $$
declare
  n bigint;
  msg text;
begin
  begin
    execute q into n;
  exception when others then
    msg := sqlerrm;
  end;
  insert into t16 (grp, label, ok, detail)
  values (g, lbl, msg is null and n = expected,
          case when msg is not null then 'грешка: ' || msg
               when n <> expected then 'очаквани ' || expected || ', получени ' || n end);
end $$;

do $$
declare
  ua  uuid := 'a1000000-0000-4000-8000-000000000001';   -- гражданин А
  ub  uuid := 'b2000000-0000-4000-8000-000000000002';   -- гражданин Б
  ad  uuid := 'ad000000-0000-4000-8000-000000000003';   -- администратор
  sa  uuid := '5a000000-0000-4000-8000-000000000004';   -- Super Admin
  sub integer;
  r1 uuid; r2 uuid; r3 uuid; r4 uuid;
  n1 bigint; n2 bigint; n3 bigint; n4 bigint;
  v  integer;
  inst integer;
  total integer; good integer; lines text; bad text;
begin
  -- ===== Подготовка (като postgres) =====
  select s.id into sub from public.subcategories s
   where s.active and not s.requires_photo order by s.id limit 1;
  if sub is null then raise exception 'Няма активна подкатегория без задължителна снимка (миграция 003/004?)'; end if;
  select s.institution_id into inst from public.subcategories s where s.id = sub;

  insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
    (ua, 'tst16-a@example.invalid',  '{"first_name":"Тест","last_name":"Първи"}', now()),
    (ub, 'tst16-b@example.invalid',  '{"first_name":"Тест","last_name":"Втори"}', now()),
    (ad, 'tst16-ad@example.invalid', '{"first_name":"Тест","last_name":"Админ"}', now()),
    (sa, 'tst16-sa@example.invalid', '{"first_name":"Тест","last_name":"Супер"}', now());
  update public.profiles set created_at = now() - interval '10 days' where id in (ua, ub, ad, sa);
  update public.profiles set role = 'admin'       where id = ad;
  update public.profiles set role = 'super_admin' where id = sa;
  update public.app_settings set demo_email = 'demo16@example.invalid', sending_enabled = true;

  -- сигнали през service_role, както ще ги създава Edge Function
  perform pg_temp.t16_as('service_role');
  select out_report_id, out_number into r1, n1 from public.create_report(ua, gen_random_uuid(), sub,
    'Тестов сигнал едно', 'Описание на първия тестов сигнал, достатъчно дълго', 'Тестов сигнал едно',
    'Описание на първия тестов сигнал, достатъчно дълго', 42.6824, 26.3229);
  select out_report_id, out_number into r2, n2 from public.create_report(ub, gen_random_uuid(), sub,
    'Тестов сигнал две', 'Описание на втория тестов сигнал, достатъчно дълго', 'Тестов сигнал две',
    'Описание на втория тестов сигнал, достатъчно дълго', 42.6924, 26.3329);
  select out_report_id, out_number into r3, n3 from public.create_report(ua, gen_random_uuid(), sub,
    'Тестов сигнал три', 'Описание на третия тестов сигнал, достатъчно дълго', 'Тестов сигнал три',
    'Описание на третия тестов сигнал, достатъчно дълго', 42.6724, 26.3129);
  select out_report_id, out_number into r4, n4 from public.create_report(ua, gen_random_uuid(), sub,
    'Тестов сигнал четири', 'Описание на четвъртия тестов сигнал, достатъчно дълго', 'Тестов сигнал четири',
    'Описание на четвъртия тестов сигнал, достатъчно дълго', 42.6624, 26.3029);

  perform pg_temp.t16_expect('service_role', 'service_role чете журнала за изпращане', 'select count(*) from public.report_dispatches', 'ok');
  perform pg_temp.t16_expect('service_role', 'service_role взема опашка за писма', 'select * from public.dispatch_claim(1)', 'ok');
  perform pg_temp.t16_expect('service_role', 'service_role пише системен журнал', $q$select public.log_system_event('test16','info','тест')$q$, 'ok');

  -- ===== Посетител (anon) =====
  perform pg_temp.t16_as('anon');
  perform pg_temp.t16_expect('посетител', 'не чете таблица reports', 'select count(*) from public.reports', 'deny');
  perform pg_temp.t16_expect('посетител', 'не чете report_private', 'select count(*) from public.report_private', 'deny');
  perform pg_temp.t16_expect('посетител', 'не чете report_admin', 'select count(*) from public.report_admin', 'deny');
  perform pg_temp.t16_expect('посетител', 'не чете report_events', 'select count(*) from public.report_events', 'deny');
  perform pg_temp.t16_expect('посетител', 'не чете profiles', 'select count(*) from public.profiles', 'deny');
  perform pg_temp.t16_expect('посетител', 'не чете audit_log', 'select count(*) from public.audit_log', 'deny');
  perform pg_temp.t16_expect('посетител', 'не чете report_dispatches', 'select count(*) from public.report_dispatches', 'deny');
  perform pg_temp.t16_expect('посетител', 'не чете app_settings', 'select count(*) from public.app_settings', 'deny');
  perform pg_temp.t16_expect('посетител', 'не чете report_photos', 'select count(*) from public.report_photos', 'deny');
  perform pg_temp.t16_expect('посетител', 'не чете email_outbox', 'select count(*) from public.email_outbox', 'deny');
  perform pg_temp.t16_expect('посетител', 'не чете security_events', 'select count(*) from public.security_events', 'deny');
  perform pg_temp.t16_expect('посетител', 'не чете system_events', 'select count(*) from public.system_events', 'deny');
  perform pg_temp.t16_expect('посетител', 'не чете границата (boundaries)', 'select count(*) from public.boundaries', 'deny');
  perform pg_temp.t16_expect('посетител', 'не чете v_public_reports директно', 'select count(*) from public.v_public_reports', 'deny');
  perform pg_temp.t16_expect('посетител', 'не създава сигнал', format($q$select * from public.create_report(%L, gen_random_uuid(), %s, 'Заглавие тест', 'Описание тест достатъчно дълго', 'Заглавие тест', 'Описание тест достатъчно дълго', 42.68, 26.32)$q$, ua, sub), 'deny');
  perform pg_temp.t16_expect('посетител', 'не сменя статус', format($q$select public.admin_change_status(%L, 1, 'closed', 'тест')$q$, r1), 'deny');
  perform pg_temp.t16_expect('посетител', 'не оттегля чужд сигнал', format($q$select public.withdraw_report(%L)$q$, r1), 'deny');
  perform pg_temp.t16_expect('посетител', 'не вика super_admin_get_contact', format($q$select * from public.super_admin_get_contact(%L, 'проверка на достъпа')$q$, ua), 'deny');
  perform pg_temp.t16_expect('посетител', 'не вика is_staff()', 'select public.is_staff()', 'deny');
  perform pg_temp.t16_expect('посетител', 'публичното търсене работи', 'select * from public.search_public_reports()', 'ok');
  perform pg_temp.t16_expect('посетител', 'публичната карта работи', 'select * from public.public_map_points()', 'ok');
  perform pg_temp.t16_count('посетител', 'вижда публичния сигнал по номер', format('select count(*) from public.get_public_report(%s)', n1), 1);
  perform pg_temp.t16_count('посетител', 'търсенето намира тестовите сигнали', format($q$select count(*) from public.search_public_reports('Тестов сигнал', p_limit => 50) where out_number in (%s, %s, %s, %s)$q$, n1, n2, n3, n4), 4);
  -- ===== Гражданин А =====
  perform pg_temp.t16_as('authenticated', ua);
  perform pg_temp.t16_count('гражданин А', 'вижда само своите report_private (чужди = 0)', format('select count(*) from public.report_private where user_id <> %L', ua), 0);
  perform pg_temp.t16_count('гражданин А', 'вижда своите report_private (3)', format('select count(*) from public.report_private where user_id = %L', ua), 3);
  perform pg_temp.t16_count('гражданин А', 'не вижда report_admin', 'select count(*) from public.report_admin', 0);
  perform pg_temp.t16_count('гражданин А', 'не вижда report_dispatches', 'select count(*) from public.report_dispatches', 0);
  perform pg_temp.t16_count('гражданин А', 'не вижда audit_log', 'select count(*) from public.audit_log', 0);
  perform pg_temp.t16_count('гражданин А', 'вижда само своя профил', 'select count(*) from public.profiles', 1);
  perform pg_temp.t16_count('гражданин А', 'не вижда app_settings', 'select count(*) from public.app_settings', 0);
  perform pg_temp.t16_count('гражданин А', 'не вижда system_events', 'select count(*) from public.system_events', 0);
  perform pg_temp.t16_count('гражданин А', 'не вижда security_events', 'select count(*) from public.security_events', 0);
  perform pg_temp.t16_expect('гражданин А', 'не чете email_outbox', 'select count(*) from public.email_outbox', 'deny');
  perform pg_temp.t16_expect('гражданин А', 'не си дава роля', format($q$update public.profiles set role = 'super_admin' where id = %L$q$, ua), 'deny');
  perform pg_temp.t16_expect('гражданин А', 'не сваля ограничение от акаунта', format($q$update public.profiles set restricted_until = null where id = %L$q$, ua), 'deny');
  perform pg_temp.t16_expect('гражданин А', 'не сменя email_normalized', format($q$update public.profiles set email_normalized = 'x' where id = %L$q$, ua), 'deny');
  perform pg_temp.t16_expect('гражданин А', 'сменя собственото си име', format($q$update public.profiles set first_name = 'Нов' where id = %L$q$, ua), 'ok');
  perform pg_temp.t16_expect('гражданин А', 'не пише в reports', format($q$update public.reports set title = 'хак хак хак' where id = %L$q$, r1), 'deny');
  perform pg_temp.t16_expect('гражданин А', 'не трие от reports', format($q$delete from public.reports where id = %L$q$, r1), 'deny');
  perform pg_temp.t16_expect('гражданин А', 'не пише в report_private', format($q$update public.report_private set reject_reason = 'insufficient_info' where report_id = %L$q$, r1), 'deny');
  perform pg_temp.t16_expect('гражданин А', 'не пише в report_admin', format($q$update public.report_admin set priority = 'low' where report_id = %L$q$, r1), 'deny');
  perform pg_temp.t16_expect('гражданин А', 'не пише в report_events', format($q$insert into public.report_events (report_id, status) values (%L, 'closed')$q$, r1), 'deny');
  perform pg_temp.t16_expect('гражданин А', 'не пише в audit_log', $q$insert into public.audit_log (action, entity_type) values ('x', 'y')$q$, 'deny');
  perform pg_temp.t16_expect('гражданин А', 'не създава сигнал (само service_role)', format($q$select * from public.create_report(%L, gen_random_uuid(), %s, 'Заглавие тест', 'Описание тест достатъчно дълго', 'Заглавие тест', 'Описание тест достатъчно дълго', 42.68, 26.32)$q$, ua, sub), 'deny');
  perform pg_temp.t16_expect('гражданин А', 'не сменя статус', format($q$select public.admin_change_status(%L, 1, 'closed', 'тест тест')$q$, r1), 'not_staff');
  perform pg_temp.t16_expect('гражданин А', 'не отхвърля сигнал', format($q$select public.admin_reject_report(%L, 1, 'insufficient_info')$q$, r1), 'not_staff');
  perform pg_temp.t16_expect('гражданин А', 'не изпраща до институция', format($q$select public.admin_send_report(%L, 1)$q$, r1), 'not_staff');
  perform pg_temp.t16_expect('гражданин А', 'не ограничава потребители', format($q$select public.admin_restrict_user(%L, 1, 'тест тест')$q$, ub), 'not_staff');
  perform pg_temp.t16_expect('гражданин А', 'не вижда име на подател', format($q$select * from public.staff_get_submitter_name(%L)$q$, r2), 'not_staff');
  perform pg_temp.t16_expect('гражданин А', 'не вижда броячите на админа', 'select * from public.admin_attention_counts()', 'not_staff');
  perform pg_temp.t16_expect('гражданин А', 'не взима контакт', format($q$select * from public.super_admin_get_contact(%L, 'проверка на достъпа')$q$, ub), 'not_super_admin');
  perform pg_temp.t16_expect('гражданин А', 'не сменя роли', format($q$select public.super_admin_set_role(%L, 'super_admin', true, 'проверка на достъпа')$q$, ua), 'not_super_admin');
  perform pg_temp.t16_expect('гражданин А', 'не пипа настройките', $q$select public.super_admin_update_settings('x@example.invalid', true, 'проверка на достъпа')$q$, 'not_super_admin');
  perform pg_temp.t16_expect('гражданин А', 'не вика dispatch_claim', 'select * from public.dispatch_claim(1)', 'deny');
  perform pg_temp.t16_expect('гражданин А', 'не вика outbox_claim', 'select * from public.outbox_claim(1)', 'deny');
  perform pg_temp.t16_expect('гражданин А', 'не пише в журнала за сигурност', $q$select public.log_security_event('x_y')$q$, 'deny');
  perform pg_temp.t16_expect('гражданин А', 'не вика write_audit', $q$select public.write_audit('x', 'y')$q$, 'deny');
  perform pg_temp.t16_expect('гражданин А', 'не вика purge_audit_log', 'select public.purge_audit_log()', 'deny');
  perform pg_temp.t16_expect('гражданин А', 'не вика run_scheduled_job', $q$select public.run_scheduled_job('purge_events')$q$, 'deny');
  perform pg_temp.t16_expect('гражданин А', 'не вика report_add_photo', format($q$select public.report_add_photo(%L, 'reports/x', 'image/jpeg', 100)$q$, r1), 'deny');
  perform pg_temp.t16_expect('гражданин А', 'не вижда чужди файлове в Storage', 'select count(*) from storage.objects', 'ok');
  perform pg_temp.t16_count('гражданин А', 'в Storage няма достъпни обекти', $q$select count(*) from storage.objects where bucket_id = 'report-photos'$q$, 0);
  perform pg_temp.t16_expect('гражданин А', 'търсенето за дубликати работи', format('select * from public.find_nearby_reports(42.6824, 26.3229, %s)', sub), 'ok');
  perform pg_temp.t16_expect('гражданин А', 'не оттегля чужд сигнал', format($q$select public.withdraw_report(%L)$q$, r2), 'err');
  perform pg_temp.t16_expect('гражданин А', 'оттегля собствен сигнал', format($q$select public.withdraw_report(%L)$q$, r3), 'ok');

  -- ===== Гражданин Б =====
  perform pg_temp.t16_as('authenticated', ub);
  perform pg_temp.t16_count('гражданин Б', 'вижда само своя report_private (1)', 'select count(*) from public.report_private', 1);
  perform pg_temp.t16_count('гражданин Б', 'не вижда чуждия report_private', format('select count(*) from public.report_private where user_id = %L', ua), 0);
  perform pg_temp.t16_count('гражданин Б', 'вижда публичните сигнали през reports (без чужди чернови)', format('select count(*) from public.reports where id = %L', r3), 0);
  perform pg_temp.t16_count('гражданин Б', 'оттегленият сигнал не е публичен', format('select count(*) from public.get_public_report(%s)', n3), 0);

  -- ===== Администратор без MFA (aal1) =====
  perform pg_temp.t16_as('authenticated', ad, 'aal1');
  perform pg_temp.t16_expect('админ без MFA', 'не сменя статус', format($q$select public.admin_change_status(%L, 1, 'closed', 'тест тест')$q$, r2), 'not_staff');
  perform pg_temp.t16_count('админ без MFA', 'не вижда report_admin', 'select count(*) from public.report_admin', 0);
  perform pg_temp.t16_count('админ без MFA', 'не вижда чужди report_private', 'select count(*) from public.report_private', 0);
  perform pg_temp.t16_expect('админ без MFA', 'не вижда броячите', 'select * from public.admin_attention_counts()', 'not_staff');

  -- ===== Администратор със MFA (aal2) =====
  perform pg_temp.t16_as('authenticated', ad, 'aal2');
  perform pg_temp.t16_count('администратор', 'вижда report_admin (поне 3)', 'select (count(*) >= 3)::int from public.report_admin', 1);
  perform pg_temp.t16_count('администратор', 'вижда report_private на всички', format('select count(*) from public.report_private where report_id in (%L, %L)', r1, r2), 2);
  perform pg_temp.t16_expect('администратор', 'вижда името на подателя', format($q$select * from public.staff_get_submitter_name(%L)$q$, r2), 'ok');
  perform pg_temp.t16_expect('администратор', 'вижда броячите', 'select * from public.admin_attention_counts()', 'ok');
  perform pg_temp.t16_count('администратор', 'не вижда системния журнал', 'select count(*) from public.system_events', 0);
  perform pg_temp.t16_count('администратор', 'не вижда чужди записи в одитния журнал', format('select count(*) from public.audit_log where actor_id <> %L', ad), 0);
  perform pg_temp.t16_expect('администратор', 'не пише директно в report_admin', format($q$update public.report_admin set priority = 'low' where report_id = %L$q$, r1), 'deny');
  perform pg_temp.t16_expect('администратор', 'не пише директно в reports', format($q$update public.reports set status = 'closed' where id = %L$q$, r1), 'deny');
  perform pg_temp.t16_expect('администратор', 'не взима контакт', format($q$select * from public.super_admin_get_contact(%L, 'проверка на достъпа')$q$, ua), 'not_super_admin');
  perform pg_temp.t16_expect('администратор', 'не сменя роли', format($q$select public.super_admin_set_role(%L, 'admin', true, 'проверка на достъпа')$q$, ub), 'not_super_admin');
  perform pg_temp.t16_expect('администратор', 'не пипа настройките', $q$select public.super_admin_update_settings('x@example.invalid', true, 'проверка на достъпа')$q$, 'not_super_admin');
  perform pg_temp.t16_expect('администратор', 'не включва реално изпращане', format($q$select public.super_admin_set_real_send(%s, true, 'проверка на достъпа')$q$, inst), 'not_super_admin');
  perform pg_temp.t16_expect('администратор', 'не ограничава Super Admin', format($q$select public.admin_restrict_user(%L, 1, 'проверка на достъпа')$q$, sa), 'invalid_target');

  perform pg_temp.t16_as('postgres');
  select version into v from public.report_admin where report_id = r2;
  perform pg_temp.t16_as('authenticated', ad, 'aal2');
  perform pg_temp.t16_expect('администратор', 'затваряне без причина е отказано', format($q$select public.admin_change_status(%L, %s, 'closed')$q$, r2, v), 'note_required');
  perform pg_temp.t16_expect('администратор', 'затваряне с причина минава', format($q$select public.admin_change_status(%L, %s, 'closed', 'Закрит при тест на достъпа')$q$, r2, v), 'ok');
  perform pg_temp.t16_expect('администратор', 'стара версия е отказана', format($q$select public.admin_change_status(%L, %s, 'closed', 'Закрит при тест на достъпа')$q$, r2, v), 'version_conflict');

  perform pg_temp.t16_as('postgres');
  select version into v from public.report_admin where report_id = r4;
  perform pg_temp.t16_as('authenticated', ad, 'aal2');
  perform pg_temp.t16_expect('администратор', 'отхвърля сигнал', format($q$select public.admin_reject_report(%L, %s, 'insufficient_info', 'Липсва адрес')$q$, r4, v), 'ok');

  perform pg_temp.t16_as('postgres');
  select version into v from public.report_admin where report_id = r1;
  perform pg_temp.t16_as('authenticated', ad, 'aal2');
  perform pg_temp.t16_expect('администратор', 'изпраща към институция (демо)', format($q$select public.admin_send_report(%L, %s)$q$, r1, v), 'ok');
  perform pg_temp.t16_expect('администратор', 'ограничава гражданин', format($q$select public.admin_restrict_user(%L, 1, 'Тест на ограничение')$q$, ub), 'ok');

  -- ===== Super Admin без MFA =====
  perform pg_temp.t16_as('authenticated', sa, 'aal1');
  perform pg_temp.t16_expect('Super Admin без MFA', 'не взима контакт', format($q$select * from public.super_admin_get_contact(%L, 'проверка на достъпа')$q$, ua), 'not_super_admin');
  perform pg_temp.t16_count('Super Admin без MFA', 'не вижда одитния журнал', 'select count(*) from public.audit_log', 0);
  perform pg_temp.t16_count('Super Admin без MFA', 'не вижда системния журнал', 'select count(*) from public.system_events', 0);

  -- ===== Super Admin със MFA (aal2) =====
  perform pg_temp.t16_as('authenticated', sa, 'aal2');
  perform pg_temp.t16_expect('Super Admin', 'взима контакт с причина', format($q$select * from public.super_admin_get_contact(%L, 'Проверка на достъпа при тест')$q$, ua), 'ok');
  perform pg_temp.t16_expect('Super Admin', 'контакт без причина е отказан', format($q$select * from public.super_admin_get_contact(%L, 'къс')$q$, ua), 'reason_required');
  perform pg_temp.t16_expect('Super Admin', 'сменя роля', format($q$select public.super_admin_set_role(%L, 'admin', true, 'Проверка на смяна на роля')$q$, ub), 'ok');
  perform pg_temp.t16_count('Super Admin', 'вижда всички записи в одитния журнал (>= 5)', 'select (count(*) >= 5)::int from public.audit_log', 1);
  perform pg_temp.t16_expect('Super Admin', 'вижда системния журнал', 'select count(*) from public.system_events', 'ok');
  perform pg_temp.t16_expect('Super Admin', 'не създава сигнал (само service_role)', format($q$select * from public.create_report(%L, gen_random_uuid(), %s, 'Заглавие тест', 'Описание тест достатъчно дълго', 'Заглавие тест', 'Описание тест достатъчно дълго', 42.68, 26.32)$q$, ua, sub), 'deny');

  -- ===== Проверки като postgres =====
  perform pg_temp.t16_as('postgres');
  perform pg_temp.t16_count('резултат', 'отхвърленият сигнал е в опашката за писма', format($q$select count(*) from public.email_outbox where kind = 'report_rejected' and report_id = %L$q$, r4), 1);
  perform pg_temp.t16_count('резултат', 'писмото към институция е на демо имейла', format($q$select count(*) from public.report_dispatches where report_id = %L and to_email is not null and (is_demo is not true or to_email <> 'demo16@example.invalid')$q$, r1), 0);
  perform pg_temp.t16_count('резултат', 'достъпът до контакт е в одитния журнал', format($q$select count(*) from public.audit_log where action = 'contact.accessed' and entity_id = %L$q$, ua::text), 1);
  perform pg_temp.t16_count('резултат', 'смяната на статус е в публичната хронология', format($q$select count(*) from public.report_events where report_id = %L$q$, r2), 2);
  perform pg_temp.t16_expect('резултат', 'одитният журнал не се променя (UPDATE)', $q$update public.audit_log set reason = 'x'$q$, 'err');
  perform pg_temp.t16_expect('резултат', 'одитният журнал не се трие (DELETE)', $q$delete from public.audit_log$q$, 'err');

  -- Общи проверки на схемата
  perform pg_temp.t16_count('схема', 'всички таблици в public са с включен RLS',
    $q$select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity$q$, 0);
  perform pg_temp.t16_count('схема', 'всички SECURITY DEFINER функции са със заключен search_path',
    $q$select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prosecdef
          and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')$q$, 0);
  perform pg_temp.t16_count('схема', 'посетителят вика само публичните функции (3 + normalize_email + rls_auto_enable на Supabase)',
    $q$select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prorettype <> 'trigger'::regtype
          and has_function_privilege('anon', p.oid, 'execute')
          and p.proname not in ('search_public_reports', 'public_map_points', 'get_public_report', 'normalize_email', 'rls_auto_enable')$q$, 0);
  perform pg_temp.t16_count('схема', 'функциите само за service_role не са отворени за потребители',
    $q$select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in ('create_report', 'dispatch_claim', 'dispatch_get_payload', 'dispatch_mark_result',
                            'dispatch_apply_webhook', 'report_add_photo', 'storage_tmp_stale', 'outbox_claim',
                            'outbox_get_payload', 'outbox_mark_result', 'log_security_event', 'log_system_event',
                            'health_check', 'write_audit', 'purge_audit_log', 'run_scheduled_job')
          and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))$q$, 0);

  -- ===== Резултат и връщане назад =====
  select count(*), count(*) filter (where ok) into total, good from t16;
  select string_agg(format('  ✗ [%s] %s — %s', grp, label, detail), E'\n' order by n) into bad from t16 where not ok;
  lines := format(E'ТЕСТОВЕ ЗА ДОСТЪП: %s от %s са наред.\n%s\n(Това „ERROR“ е нарочно: всички тестови данни са върнати назад.)',
                  good, total,
                  case when bad is null then 'Няма проблеми.' else E'ПРОБЛЕМИ:\n' || bad end);
  raise exception '%', lines;
end $$;