-- 009_create_report.sql
-- Подаване на сигнал: срокове, проверка за близки сигнали и функцията create_report.
--
-- create_report се вика САМО от Edge Function (с ключа service_role), след като тя е:
--   проверила Turnstile, геокодирала адреса, пречистила текста от лични данни и качила снимките.
-- Клиентът не може да я вика директно, защото би могъл да подаде непречистен текст като публичен.

-- Добавя работни дни (без събота, неделя и празниците от таблицата holidays), по часовник на София
create function public.add_working_days(p_from timestamptz, p_days integer)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  d date := (p_from at time zone 'Europe/Sofia')::date;
  t time := (p_from at time zone 'Europe/Sofia')::time;
  n integer := 0;
begin
  while n < p_days loop
    d := d + 1;
    if extract(isodow from d) < 6
       and not exists (select 1 from public.holidays h where h.day = d) then
      n := n + 1;
    end if;
  end loop;
  return (d + t) at time zone 'Europe/Sofia';
end;
$$;

-- Срокове по приоритет: първа реакция и решаване
--   критичен: 1 час / 24 часа (календарни); висок: 1 / 3 работни дни;
--   среден: 3 / 14 работни дни; нисък: 7 / 30 работни дни
create function public.sla_due(
  p_start timestamptz,
  p_priority public.report_priority,
  out first_response_due timestamptz,
  out resolve_due timestamptz
)
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_priority = 'critical' then
    first_response_due := p_start + interval '1 hour';
    resolve_due        := p_start + interval '24 hours';
  elsif p_priority = 'high' then
    first_response_due := public.add_working_days(p_start, 1);
    resolve_due        := public.add_working_days(p_start, 3);
  elsif p_priority = 'medium' then
    first_response_due := public.add_working_days(p_start, 3);
    resolve_due        := public.add_working_days(p_start, 14);
  else
    first_response_due := public.add_working_days(p_start, 7);
    resolve_due        := public.add_working_days(p_start, 30);
  end if;
end;
$$;

-- Близки сигнали за предупреждението във формата: до 50 м, същата категория, само активни публични
create function public.find_nearby_reports(
  p_lat double precision,
  p_lng double precision,
  p_subcategory_id integer
)
returns table (report_number bigint, report_title text, report_status public.report_status, distance_m integer)
language sql
stable
set search_path = ''
as $$
  select r.number, r.title, r.status,
         round(extensions.st_distance(r.public_point::extensions.geography, x.pt::extensions.geography))::integer
  from public.reports r
  join public.subcategories s on s.id = r.subcategory_id
  cross join lateral (
    select extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326) as pt
  ) x
  where s.category_id = (select c.category_id from public.subcategories c where c.id = p_subcategory_id)
    and r.status in ('new', 'sent', 'in_progress')
    and not r.needs_review
    and extensions.st_dwithin(r.public_point::extensions.geography, x.pt::extensions.geography, 50)
  order by 4
  limit 5;
$$;

-- Основната функция. Всичко става в една транзакция: сигнал, частни данни, администраторски данни,
-- първо събитие в хронологията и запис в Audit Log. Грешките са кодове, които Edge Function превежда.
create function public.create_report(
  p_user_id              uuid,
  p_idempotency_key      uuid,
  p_subcategory_id       integer,
  p_title                text,          -- пречистен
  p_description          text,          -- пречистен
  p_original_title       text,
  p_original_description text,
  p_lat                  double precision,
  p_lng                  double precision,
  p_public_address       text    default null,
  p_exact_address        text    default null,
  p_ip_hash              text    default null,
  p_suspicious_reasons   text[]  default '{}',
  p_photo_count          integer default 0
)
returns table (out_report_id uuid, out_number bigint, out_status public.report_status, out_needs_review boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  prof        public.profiles%rowtype;
  sub         public.subcategories%rowtype;
  pt          extensions.geometry;
  pub_pt      extensions.geometry;
  v_id        uuid;
  v_number    bigint;
  v_review    boolean;
  v_first     timestamptz;
  v_resolve   timestamptz;
  cnt_hour    integer;
  cnt_day     integer;
begin
  -- един потребител подава по един сигнал наведнъж (иначе две едновременни заявки заобикалят лимита)
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  -- повторно натискане: връщаме вече създадения сигнал
  select r.id, r.number, r.status, r.needs_review
    into out_report_id, out_number, out_status, out_needs_review
  from public.report_private p
  join public.reports r on r.id = p.report_id
  where p.user_id = p_user_id and p.idempotency_key = p_idempotency_key;
  if found then
    return next;
    return;
  end if;

  select * into prof from public.profiles where id = p_user_id;
  if not found then raise exception 'profile_not_found'; end if;
  if not prof.active then raise exception 'account_inactive'; end if;
  if prof.restricted_until is not null and prof.restricted_until > now() then
    raise exception 'account_restricted';
  end if;

  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'invalid_location';
  end if;
  pt := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326);

  select s.* into sub
  from public.subcategories s
  join public.categories c on c.id = s.category_id
  where s.id = p_subcategory_id and s.active and c.active;
  if not found then raise exception 'invalid_subcategory'; end if;

  -- границата на общината (с допуск 5 м)
  if not exists (select 1 from public.boundaries where is_active) then
    raise exception 'no_boundary';
  end if;
  if not exists (
    select 1 from public.boundaries b
    where b.is_active
      and extensions.st_dwithin(b.geom::extensions.geography, pt::extensions.geography, 5)
  ) then
    raise exception 'outside_municipality';
  end if;

  if sub.requires_photo and coalesce(p_photo_count, 0) < 1 then
    raise exception 'photo_required';
  end if;

  -- лимити: броят се и отхвърлените; акаунти с един и същ нормализиран имейл се броят заедно
  select count(*) filter (where rp.created_at > now() - interval '1 hour'),
         count(*) filter (where rp.created_at > now() - interval '24 hours')
    into cnt_hour, cnt_day
  from public.report_private rp
  where rp.user_id in (
    select pr.id from public.profiles pr
    where pr.id = p_user_id
       or (prof.email_normalized is not null and pr.email_normalized = prof.email_normalized)
  );
  if prof.created_at > now() - interval '24 hours' then
    if cnt_day >= 3 then raise exception 'rate_limited'; end if;      -- нов акаунт: 3 за 24 часа
  elsif cnt_hour >= 5 or cnt_day >= 20 then
    raise exception 'rate_limited';                                    -- после: 5 на час и 20 на ден
  end if;

  v_review := coalesce(cardinality(p_suspicious_reasons), 0) > 0;

  -- публично място: мрежа ≈15 м; при „скрий точния адрес“ ≈100 м
  pub_pt := extensions.st_snaptogrid(pt, case when sub.hide_exact_address then 0.001 else 0.000135 end);

  -- сроковете тръгват от подаването; за подозрителен сигнал - от одобрението (по-късно)
  if not v_review then
    select d.first_response_due, d.resolve_due into v_first, v_resolve
    from public.sla_due(now(), sub.default_priority) d;
  end if;

  begin
    insert into public.reports
      (subcategory_id, title, description, status, needs_review, public_point, public_address)
    values
      (sub.id, p_title, p_description, 'new', v_review, pub_pt, p_public_address)
    returning id, number into v_id, v_number;

    insert into public.report_private
      (report_id, user_id, idempotency_key, original_title, original_description, exact_point, exact_address)
    values
      (v_id, p_user_id, p_idempotency_key, p_original_title, p_original_description, pt, p_exact_address);

    insert into public.report_admin
      (report_id, priority, institution_id, cc_institution_id, suspicious_reasons, ip_hash,
       first_response_due, resolve_due)
    values
      (v_id, sub.default_priority, sub.institution_id, sub.cc_institution_id,
       coalesce(p_suspicious_reasons, '{}'), p_ip_hash, v_first, v_resolve);

    insert into public.report_events (report_id, status) values (v_id, 'new');

    perform public.write_audit(
      'report.created', 'report', v_id::text, null,
      jsonb_build_object('number', v_number, 'subcategory_id', sub.id,
                         'needs_review', v_review,
                         'suspicious_count', coalesce(cardinality(p_suspicious_reasons), 0)),
      p_user_id);
  exception when unique_violation then
    -- две еднакви заявки едновременно: връщаме тази, която е успяла
    select r.id, r.number, r.status, r.needs_review
      into out_report_id, out_number, out_status, out_needs_review
    from public.report_private p
    join public.reports r on r.id = p.report_id
    where p.user_id = p_user_id and p.idempotency_key = p_idempotency_key;
    return next;
    return;
  end;

  out_report_id := v_id;
  out_number := v_number;
  out_status := 'new';
  out_needs_review := v_review;
  return next;
end;
$$;

-- Права
revoke execute on function public.add_working_days(timestamptz, integer) from public, anon, authenticated;
revoke execute on function public.sla_due(timestamptz, public.report_priority) from public, anon, authenticated;
revoke execute on function public.create_report(uuid, uuid, integer, text, text, text, text,
  double precision, double precision, text, text, text, text[], integer) from public, anon, authenticated;
grant execute on function public.create_report(uuid, uuid, integer, text, text, text, text,
  double precision, double precision, text, text, text, text[], integer) to service_role;

revoke execute on function public.find_nearby_reports(double precision, double precision, integer) from public, anon;
grant execute on function public.find_nearby_reports(double precision, double precision, integer) to authenticated, service_role;