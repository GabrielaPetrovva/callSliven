-- 024_pause_holds_queue.sql
-- „Спри всички изпращания“ (SA-2) досега спираше само НОВИТЕ изпращания (admin_send_report дава sending_paused).
-- Писмата, които вече чакаха в опашката, пак тръгваха при следващото минаване на send-emails (всяка минута),
-- защото dispatch_claim не гледаше превключвателя. Сега, докато изпращанията са спрени, опашката към
-- институциите не се взема: писмата остават „В опашката“ и тръгват сами, когато Super Admin пусне изпращанията.
-- Писмата до гражданите (email_outbox: отхвърлен сигнал, сигурностни известия) не се спират.

create or replace function public.dispatch_claim(p_limit integer default 10)
returns table (out_id bigint)
language sql
security definer
set search_path = ''
as $$
  with c as (
    select d.id from public.report_dispatches d
    where (select s.sending_enabled from public.app_settings s)
      and (d.status = 'queued'
           or (d.status = 'sending' and d.updated_at < now() - interval '10 minutes'))
    order by d.id
    limit greatest(1, least(coalesce(p_limit, 10), 50))
    for update skip locked
  )
  update public.report_dispatches d
     set status = 'sending', updated_at = now()
    from c
   where d.id = c.id
  returning d.id;
$$;

-- create or replace пази правата от 013; пак ги записваме изрично, за да е ясно кой може да я вика
revoke execute on function public.dispatch_claim(integer) from public, anon, authenticated;
grant execute on function public.dispatch_claim(integer) to service_role;
