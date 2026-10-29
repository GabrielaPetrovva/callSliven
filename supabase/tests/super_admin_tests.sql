-- super_admin_tests.sql — проверки за страницата на Super Admin (миграции 023 и 024). Не е миграция.
--
-- Пуска се в SQL Editor на callsliven-dev след 023 и 024, по същия начин като access_tests.sql:
-- създава тестови потребители, сигнал и изпращане, проверява ги от името на всяка роля и накрая връща ВСИЧКО назад.
-- Резултатът излиза като "ERROR" със съобщение: това е нарочно, за да не остане нищо в базата.

create temp table t23 (
  n      serial primary key,
  grp    text,
  label  text,
  ok     boolean not null,
  detail text
);
grant all on t23 to public;
grant all on sequence t23_n_seq to public;

-- Превключва ролята като Supabase при заявка от интернет.
create function pg_temp.t23_as(r text, uid uuid default null, aal text default 'aal1')
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

-- 'ok' = без грешка, 'deny' = отказан достъп, друго = грешката съдържа този текст
create function pg_temp.t23_expect(g text, lbl text, q text, expect text)
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
    else msg ilike '%' || expect || '%'
  end, false);
  insert into t23 (grp, label, ok, detail)
  values (g, lbl, good, case when good then null
                             else 'очаквано: ' || expect || ', получено: ' || coalesce(msg, 'без грешка') end);
end $$;

-- Сравнява число от заявка с очакваното.
create function pg_temp.t23_count(g text, lbl text, q text, expected bigint)
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
  insert into t23 (grp, label, ok, detail)
  values (g, lbl, msg is null and n = expected,
          case when msg is not null then 'грешка: ' || msg
               when n <> expected then 'очаквани ' || expected || ', получени ' || n end);
end $$;

do $$
declare
  ua  uuid := 'a1230000-0000-4000-8000-000000000001';   -- гражданин А (подател)
  ub  uuid := 'b2230000-0000-4000-8000-000000000002';   -- гражданин Б
  ad  uuid := 'ad230000-0000-4000-8000-000000000003';   -- администратор
  sa  uuid := '5a230000-0000-4000-8000-000000000004';   -- Super Admin
  sub integer;
  inst integer;
  r1 uuid; n1 bigint;
  total integer; good integer; bad text;
begin
  -- ===== Подготовка (като postgres) =====
  select s.id, s.institution_id into sub, inst from public.subcategories s
   where s.active and not s.requires_photo and s.institution_id is not null order by s.id limit 1;
  if sub is null then raise exception 'Няма активна подкатегория без задължителна снимка и с институция'; end if;

  insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
    (ua, 'tst23-a@example.invalid',  '{"first_name":"Тест","last_name":"Първов"}', now()),
    (ub, 'tst23-b@example.invalid',  '{"first_name":"Тест","last_name":"Второв"}', now()),
    (ad, 'tst23-ad@example.invalid', '{"first_name":"Тест","last_name":"Админов"}', now()),
    (sa, 'tst23-sa@example.invalid', '{"first_name":"Тест","last_name":"Суперов"}', now());
  update public.profiles set created_at = now() - interval '10 days' where id in (ua, ub, ad, sa);
  update public.profiles set role = 'admin'       where id = ad;
  update public.profiles set role = 'super_admin' where id = sa;
  update public.app_settings set demo_email = 'demo23@example.invalid', sending_enabled = true;

  perform pg_temp.t23_as('service_role');
  select out_report_id, out_number into r1, n1 from public.create_report(ua, gen_random_uuid(), sub,
    'Тестов сигнал за Super Admin', 'Описание на тестовия сигнал, достатъчно дълго', 'Тестов сигнал за Super Admin',
    'Описание на тестовия сигнал, достатъчно дълго', 42.6824, 26.3229);

  -- писмо в опашката (както след „Изпрати към институцията“)
  perform pg_temp.t23_as('postgres');
  insert into public.report_dispatches (report_id, institution_id, recipient_role, attempt, status, to_email, is_demo)
  values (r1, inst, 'to', 1, 'queued', 'demo23@example.invalid', true);

  -- ===== Кой може да вика новите функции =====
  perform pg_temp.t23_as('anon');
  perform pg_temp.t23_expect('посетител', 'не търси акаунти', 'select * from public.super_admin_find_users()', 'deny');
  perform pg_temp.t23_expect('посетител', 'не чете журнала', 'select * from public.super_admin_audit()', 'deny');

  perform pg_temp.t23_as('authenticated', ua);
  perform pg_temp.t23_expect('гражданин', 'не търси акаунти', 'select * from public.super_admin_find_users()', 'not_super_admin');
  perform pg_temp.t23_expect('гражданин', 'не чете журнала', 'select * from public.super_admin_audit()', 'not_super_admin');

  perform pg_temp.t23_as('authenticated', ad, 'aal2');
  perform pg_temp.t23_expect('администратор', 'не търси акаунти', 'select * from public.super_admin_find_users()', 'not_super_admin');
  perform pg_temp.t23_expect('администратор', 'не чете журнала с имена', 'select * from public.super_admin_audit()', 'not_super_admin');

  perform pg_temp.t23_as('authenticated', sa, 'aal1');
  perform pg_temp.t23_expect('Super Admin без MFA', 'не търси акаунти', 'select * from public.super_admin_find_users()', 'not_super_admin');
  perform pg_temp.t23_expect('Super Admin без MFA', 'не чете журнала', 'select * from public.super_admin_audit()', 'not_super_admin');

  -- ===== Търсене на акаунти (Super Admin със MFA) =====
  perform pg_temp.t23_as('authenticated', sa, 'aal2');
  perform pg_temp.t23_count('търсене', 'без търсене: само служители (няма граждани)',
    $q$select count(*) from public.super_admin_find_users() where out_role = 'citizen'$q$, 0);
  perform pg_temp.t23_count('търсене', 'без търсене: тестовите служители са в списъка',
    format('select count(*) from public.super_admin_find_users() where out_id in (%L, %L)', ad, sa), 2);
  perform pg_temp.t23_count('търсене', 'по номер на сигнал: намира подателя',
    format($q$select count(*) from public.super_admin_find_users(%L) where out_id = %L and out_match = 'report'$q$, n1::text, ua), 1);
  perform pg_temp.t23_count('търсене', 'по точен имейл (главни букви): намира акаунта',
    format($q$select count(*) from public.super_admin_find_users('TST23-B@example.invalid') where out_id = %L and out_match = 'email'$q$, ub), 1);
  perform pg_temp.t23_count('търсене', 'по имейл с +таг: намира акаунта',
    format($q$select count(*) from public.super_admin_find_users('tst23-b+x@example.invalid') where out_id = %L$q$, ub), 1);
  perform pg_temp.t23_count('търсене', 'част от имейл: не намира нищо',
    $q$select count(*) from public.super_admin_find_users('tst23-b@example')$q$, 0);
  perform pg_temp.t23_count('търсене', 'по фамилия: намира акаунта',
    format($q$select count(*) from public.super_admin_find_users('второв') where out_id = %L and out_match = 'name'$q$, ub), 1);
  perform pg_temp.t23_count('търсене', 'филтър по роля: само администратори',
    $q$select count(*) from public.super_admin_find_users(null, 'admin') where out_role <> 'admin'$q$, 0);
  perform pg_temp.t23_count('търсене', 'показва, че служител няма втори фактор',
    format('select count(*) from public.super_admin_find_users() where out_id = %L and not out_has_mfa', ad), 1);
  perform pg_temp.t23_count('търсене', 'брои сигналите на подателя',
    format($q$select out_report_count from public.super_admin_find_users(%L)$q$, n1::text), 1);
  perform pg_temp.t23_expect('търсене', 'една буква е отказана', $q$select * from public.super_admin_find_users('x')$q$, 'invalid_query');
  perform pg_temp.t23_expect('търсене', '% и _ се търсят буквално (без грешка)', $q$select * from public.super_admin_find_users('5_%')$q$, 'ok');

  -- ===== Журнал с имена =====
  perform pg_temp.t23_expect('журнал', 'Super Admin сменя роля с причина',
    format($q$select public.super_admin_set_role(%L, 'admin', true, 'Проверка на журнала')$q$, ub), 'ok');
  perform pg_temp.t23_count('журнал', 'записът е с името на засегнатия и причината',
    $q$select count(*) from public.super_admin_audit('users', null, 5)
        where out_action = 'user.role_changed' and out_entity_name = 'Тест Второв'
          and out_actor_name = 'Тест Суперов' and out_reason = 'Проверка на журнала'$q$, 1);
  perform pg_temp.t23_count('журнал', 'сигналът е с публичния си номер',
    format($q$select count(*) from public.super_admin_audit('reports', null, 50) where out_report_number = %s$q$, n1), 1);
  perform pg_temp.t23_count('журнал', 'филтър „контакти“ връща само достъп до контакти',
    $q$select count(*) from public.super_admin_audit('contacts', null, 100) where out_action not like 'contact.%'$q$, 0);
  perform pg_temp.t23_count('журнал', 'страниране: по-стари записи от дадения id',
    $q$select count(*) from public.super_admin_audit(null, (select max(id) from public.audit_log), 100)
        where out_id >= (select max(id) from public.audit_log)$q$, 0);
  perform pg_temp.t23_expect('журнал', 'непознат вид е отказан', $q$select * from public.super_admin_audit('xyz')$q$, 'invalid_group');

  -- ===== 024: „Спри всички изпращания“ задържа и опашката =====
  perform pg_temp.t23_expect('спиране', 'Super Admin спира изпращанията',
    $q$select public.super_admin_update_settings('demo23@example.invalid', false, 'Тест на спирането')$q$, 'ok');
  perform pg_temp.t23_as('service_role');
  perform pg_temp.t23_count('спиране', 'спряно: send-emails не взема нищо от опашката', 'select count(*) from public.dispatch_claim(50)', 0);
  perform pg_temp.t23_as('postgres');
  perform pg_temp.t23_count('спиране', 'спряно: писмото остава „В опашката“',
    format($q$select count(*) from public.report_dispatches where report_id = %L and status = 'queued'$q$, r1), 1);
  perform pg_temp.t23_as('authenticated', sa, 'aal2');
  perform pg_temp.t23_expect('спиране', 'Super Admin пуска изпращанията',
    $q$select public.super_admin_update_settings('demo23@example.invalid', true, 'Край на теста')$q$, 'ok');
  perform pg_temp.t23_as('service_role');
  perform pg_temp.t23_count('спиране', 'пуснато: опашката се взема отново', 'select (count(*) >= 1)::int from public.dispatch_claim(50)', 1);
  perform pg_temp.t23_as('postgres');
  perform pg_temp.t23_count('спиране', 'пуснато: писмото е взето за изпращане',
    format($q$select count(*) from public.report_dispatches where report_id = %L and status = 'sending'$q$, r1), 1);

  -- ===== Схема =====
  perform pg_temp.t23_count('схема', 'търсенето не връща имейл и телефон (само super_admin_get_contact)',
    $q$select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname in ('super_admin_find_users', 'super_admin_audit')
          and (pg_get_function_result(p.oid) ~ 'out_email ' or pg_get_function_result(p.oid) ~ 'phone')$q$, 0);
  perform pg_temp.t23_count('схема', 'dispatch_claim е само за service_role',
    $q$select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'dispatch_claim'
          and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))$q$, 0);

  -- ===== Резултат и връщане назад =====
  perform pg_temp.t23_as('postgres');
  select count(*), count(*) filter (where ok) into total, good from t23;
  select string_agg(format('  ✗ [%s] %s — %s', grp, label, detail), E'\n' order by n) into bad from t23 where not ok;
  raise exception '%', format(E'ТЕСТОВЕ ЗА SUPER ADMIN: %s от %s са наред.\n%s\n(Това „ERROR“ е нарочно: всички тестови данни са върнати назад.)',
                              good, total, case when bad is null then 'Няма проблеми.' else E'ПРОБЛЕМИ:\n' || bad end);
end $$;
