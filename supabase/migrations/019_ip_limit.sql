-- 019_ip_limit.sql
-- Мек лимит по IP (SUB-15): колко сигнала са подадени от един и същ (хеширан) IP адрес за последния час.
-- Edge Function "submit-report" я вика преди да създаде сигнал: при 6 и повече сигнала отива за ръчен преглед,
-- при 15 и повече подаването се отказва до следващия час. Прагът е умишлено висок: училища, общински
-- мрежи и мобилни оператори споделят един IP между много хора.

create index report_admin_ip_hash_idx on public.report_admin (ip_hash) where ip_hash is not null;

create function public.ip_recent_report_count(p_ip_hash text, p_window interval default interval '1 hour')
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.report_admin a
  join public.reports r on r.id = a.report_id
  where a.ip_hash = p_ip_hash
    and r.created_at > now() - least(p_window, interval '24 hours');
$$;

revoke execute on function public.ip_recent_report_count(text, interval) from public, anon, authenticated;
grant execute on function public.ip_recent_report_count(text, interval) to service_role;
