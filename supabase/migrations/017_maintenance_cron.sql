-- 017_maintenance_cron.sql
-- Всеки ден в 03:30 (UTC) pg_cron вика Edge Function "maintenance": изтрива остарели временни снимки
-- и проверява, че базата отговаря. Ползва същите записи във Vault като send-emails (project_url, cron_secret).

create function public.invoke_maintenance()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_url text;
  secret text;
begin
  select s.decrypted_secret into base_url from vault.decrypted_secrets s where s.name = 'project_url';
  select s.decrypted_secret into secret   from vault.decrypted_secrets s where s.name = 'cron_secret';
  if base_url is null or secret is null then
    perform public.log_system_event_throttled('maintenance_cron', 'Във Vault липсва project_url или cron_secret: поддръжката не работи');
    return;
  end if;

  perform net.http_post(
    url := rtrim(base_url, '/') || '/functions/v1/maintenance',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
exception when others then
  perform public.log_system_event_throttled('maintenance_cron', 'Грешка при извикване на maintenance: ' || sqlerrm);
end;
$$;

revoke execute on function public.invoke_maintenance() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('callsliven_maintenance', '30 3 * * *', $c$select public.invoke_maintenance()$c$);
  end if;
end $$;
