-- 029_retention_and_plates.sql
-- Решения от 08.11.2026 (PROJECT.md, „Отворени въпроси“):
--   1) Регистрационен номер в писмото до институцията. Публичният текст остава пречистен.
--      Номерът отива само ако подкатегорията е с plates_in_letter И институцията е с receives_plates
--      (ОП „Градска мобилност“ за паркирането и ОДМВР). За тях dispatch_get_payload връща и оригиналния текст,
--      а send-emails маха от него имейлите, линковете и телефоните, но оставя номерата.
--   2) Хешът на IP в report_admin се трие 30 дни след подаването (както security_events).
--      Лимитът по IP (019) гледа само последните 24 часа, затова не се засяга.
--   3) Сигнал без профил (акаунтът е изтрит): 1 година след приключването оригиналният текст се заменя с
--      публичния, точната точка с публичната, точният адрес и бележката при отхвърляне се трият.
--      Снимките на такива сигнали трие Edge Function "maintenance" (файловете се трият само през Storage API).
--   4) 4 май 2027 остава неработен ден (018, КТ чл. 154, ал. 2). Тук няма промяна.
-- Миграцията може да се пусне повторно.

-- ===== 1) Регистрационни номера =====

alter table public.subcategories add column if not exists plates_in_letter boolean not null default false;
alter table public.institutions  add column if not exists receives_plates  boolean not null default false;

comment on column public.subcategories.plates_in_letter is
  'Писмото до институция с receives_plates съдържа регистрационните номера от текста (публичният текст е без тях)';
comment on column public.institutions.receives_plates is
  'Институцията получава регистрационните номера, ако подкатегорията е с plates_in_letter';

update public.subcategories set plates_in_letter = true
 where name in ('Неправилно паркиране, синя зона', 'Нарушаване на обществения ред');
update public.institutions set receives_plates = true
 where name in ('ОП „Градска мобилност“ (Община Сливен)', 'ОДМВР – Сливен');

-- Защита: ако име не съвпадне (например е преименувано от админ панела), редът се пропуска тихо
do $$
begin
  if (select count(*) from public.subcategories where plates_in_letter) <> 2 then
    raise exception 'Очаквани 2 подкатегории с номер в писмото, намерени %. Провери имената.',
      (select count(*) from public.subcategories where plates_in_letter);
  end if;
  if (select count(*) from public.institutions where receives_plates) <> 2 then
    raise exception 'Очаквани 2 институции, които получават номера, намерени %. Провери имената.',
      (select count(*) from public.institutions where receives_plates);
  end if;
end $$;

-- ===== 3) Обезличаване: колона и по-меки проверки за вече обезличените =====

alter table public.report_private add column if not exists anonymized_at timestamptz;

-- Публичният текст може да е по-къс от оригинала (напр. „[номер]“ вместо телефон), затова строгите
-- граници важат само докато сигналът не е обезличен. Нов сигнал пак минава през тях.
alter table public.report_private drop constraint if exists report_private_original_title_check;
alter table public.report_private drop constraint if exists report_private_original_description_check;
alter table public.report_private add constraint report_private_original_title_check
  check (char_length(original_title) between case when anonymized_at is null then 5 else 1 end and 100);
alter table public.report_private add constraint report_private_original_description_check
  check (char_length(original_description) between case when anonymized_at is null then 20 else 1 end and 2000);

create index if not exists report_private_orphan_idx on public.report_private (report_id)
  where user_id is null and anonymized_at is null;

-- ===== 1) Данни за писмото: + оригиналният текст, само когато номерът е разрешен =====
-- Промяна на върнатите колони изисква drop; правата се записват отново по-долу.

drop function if exists public.dispatch_get_payload(bigint);
create function public.dispatch_get_payload(p_dispatch_id bigint)
returns table (
  out_number               bigint,
  out_title                text,
  out_description          text,
  out_category             text,
  out_subcategory          text,
  out_address              text,
  out_lat                  double precision,
  out_lng                  double precision,
  out_institution          text,
  out_to_email             text,
  out_is_demo              boolean,
  out_role                 text,
  out_attempt              integer,
  out_created_at           timestamptz,
  out_original_title       text,      -- null, освен ако номерът е разрешен за тази подкатегория и институция
  out_original_description text
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.number, r.title, r.description, c.name, s.name,
         p.exact_address,
         extensions.st_y(p.exact_point), extensions.st_x(p.exact_point),
         i.name, d.to_email, d.is_demo, d.recipient_role, d.attempt, r.created_at,
         case when s.plates_in_letter and i.receives_plates and p.anonymized_at is null then p.original_title end,
         case when s.plates_in_letter and i.receives_plates and p.anonymized_at is null then p.original_description end
  from public.report_dispatches d
  join public.reports r on r.id = d.report_id
  join public.report_private p on p.report_id = r.id
  join public.subcategories s on s.id = r.subcategory_id
  join public.categories c on c.id = s.category_id
  join public.institutions i on i.id = d.institution_id
  where d.id = p_dispatch_id;
$$;

revoke execute on function public.dispatch_get_payload(bigint) from public, anon, authenticated;
grant execute on function public.dispatch_get_payload(bigint) to service_role;

-- ===== 2) и 3) Планирани задачи =====
-- Същата функция като в 015 с две нови задачи: purge_ip_hashes и anonymize_orphan_reports.

create or replace function public.run_scheduled_job(p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  n bigint := 0;
  m bigint;
begin
  if p_name = 'delete_unconfirmed_accounts' then
    -- профилът се изтрива каскадно; сигналите на такива акаунти не съществуват (не са могли да подават)
    delete from auth.users u
     where u.email_confirmed_at is null
       and u.created_at < now() - interval '24 hours'
       and not exists (select 1 from public.profiles p where p.id = u.id and p.role <> 'citizen');
    get diagnostics n = row_count;
  elsif p_name = 'purge_events' then
    delete from public.security_events where created_at < now() - interval '30 days';
    get diagnostics n = row_count;
    delete from public.system_events where created_at < now() - interval '30 days';
    get diagnostics m = row_count;
    n := n + m;
  elsif p_name = 'purge_audit_log' then
    n := public.purge_audit_log();
  elsif p_name = 'purge_outbox' then
    delete from public.email_outbox where status in ('sent', 'failed') and updated_at < now() - interval '30 days';
    get diagnostics n = row_count;
  elsif p_name = 'purge_ip_hashes' then
    -- хешът трябва само за лимита по IP (последния час), затова се пази 30 дни
    update public.report_admin a
       set ip_hash = null
      from public.reports r
     where r.id = a.report_id
       and a.ip_hash is not null
       and r.created_at < now() - interval '30 days';
    get diagnostics n = row_count;
  elsif p_name = 'anonymize_orphan_reports' then
    -- сигнали без профил, приключени преди повече от 1 година; до 1000 на ден
    with due as (
      select rp.report_id
      from public.report_private rp
      join public.reports r on r.id = rp.report_id
      where rp.user_id is null
        and rp.anonymized_at is null
        and r.status in ('resolved', 'closed', 'rejected', 'withdrawn')
        and coalesce((select max(e.created_at) from public.report_events e
                       where e.report_id = r.id and e.status = r.status),
                     r.updated_at) < now() - interval '1 year'
      order by rp.report_id
      limit 1000
      for update of rp skip locked
    )
    update public.report_private rp
       set original_title       = r.title,
           original_description = r.description,
           exact_point          = r.public_point,
           exact_address        = r.public_address,
           reject_note          = null,
           anonymized_at        = now()
      from due, public.reports r
     where rp.report_id = due.report_id
       and r.id = due.report_id;
    get diagnostics n = row_count;
    update public.report_admin a
       set ip_hash = null
      from public.report_private rp
     where rp.report_id = a.report_id and rp.anonymized_at is not null and a.ip_hash is not null;
  else
    raise exception 'unknown_job';
  end if;

  if n > 0 then
    insert into public.system_events (source, level, message, details)
    values (p_name, 'info', 'Задачата е изпълнена', jsonb_build_object('rows', n));
  end if;
exception when others then
  insert into public.system_events (source, level, message)
  values (left(p_name, 60), 'error', left(sqlerrm, 500));
end;
$$;
revoke execute on function public.run_scheduled_job(text) from public, anon, authenticated;

-- ===== 3) Снимки на обезличените сигнали (за Edge Function "maintenance") =====

-- Пътищата за изтриване през Storage API, до 500 наведнъж
create or replace function public.retention_photos_due()
returns table (out_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select ph.path
  from public.report_photos ph
  join public.report_private rp on rp.report_id = ph.report_id
  where rp.anonymized_at is not null
  order by ph.id
  limit 500;
$$;

-- След успешно изтриване на файловете: махаме и записите. Пипа само снимки на обезличени сигнали.
create or replace function public.retention_photos_removed(p_paths text[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  delete from public.report_photos ph
   using public.report_private rp
   where rp.report_id = ph.report_id
     and rp.anonymized_at is not null
     and ph.path = any (coalesce(p_paths, '{}'));
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.retention_photos_due() from public, anon, authenticated;
revoke execute on function public.retention_photos_removed(text[]) from public, anon, authenticated;
grant execute on function public.retention_photos_due() to service_role;
grant execute on function public.retention_photos_removed(text[]) to service_role;

-- Разписание (UTC): обезличаването е преди maintenance (03:30), за да се изтрият снимките още същия ден
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('callsliven_anonymize_reports', '15 3 * * *', $c$select public.run_scheduled_job('anonymize_orphan_reports')$c$);
    perform cron.schedule('callsliven_purge_ip_hashes',   '45 3 * * *', $c$select public.run_scheduled_job('purge_ip_hashes')$c$);
  end if;
end $$;
