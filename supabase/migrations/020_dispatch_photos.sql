-- 020_dispatch_photos.sql
-- За Edge Function "send-emails": кои снимки има сигналът, към който е писмото (ADM-12).
-- Връща само пътищата. Подписаните временни линкове се правят от функцията през Storage API.

create function public.dispatch_get_photos(p_dispatch_id bigint)
returns table (out_path text, out_position smallint)
language sql
stable
security definer
set search_path = ''
as $$
  select ph.path, ph.position
  from public.report_dispatches d
  join public.report_photos ph on ph.report_id = d.report_id
  where d.id = p_dispatch_id
  order by ph.position;
$$;

revoke execute on function public.dispatch_get_photos(bigint) from public, anon, authenticated;
grant execute on function public.dispatch_get_photos(bigint) to service_role;
