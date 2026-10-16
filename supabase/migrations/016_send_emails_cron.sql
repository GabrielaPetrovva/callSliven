-- 016_send_emails_cron.sql
-- Всяка минута pg_cron проверява опашките за писма и ако има нещо за изпращане,
-- вика Edge Function "send-emails" през pg_net. Адресът на проекта и тайната са в Supabase Vault (не в кода).
--
-- Преди да заработи, в SQL Editor се добавят два записа във Vault (вижте инструкциите към миграцията):
--   project_url  - https://<ref>.supabase.co
--   cron_secret  - същата стойност като тайната CRON_SECRET на функцията

do $$
begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net не може да се включи оттук (%). Включете го от Database -> Extensions.', sqlerrm;
end $$;

-- Записва системна грешка най-много веднъж на час за едно и също съобщение, за да не пълни журнала всяка минута.
create function public.log_system_event_throttled(p_source text, p_message text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.system_events e
    where e.source = p_source and e.message = left(p_message, 500) and e.created_at > now() - interval '1 hour'
  ) then
    insert into public.system_events (source, level, message) values (p_source, 'error', left(p_message, 500));
  end if;
end;
$$;

create function public.invoke_send_emails()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_url text;
  secret text;
begin
  -- няма нищо за изпращане: не викаме функцията
  if not exists (
       select 1 from public.report_dispatches d
       where d.status = 'queued' or (d.status = 'sending' and d.updated_at < now() - interval '10 minutes')
     )
     and not exists (
       select 1 from public.email_outbox o
       where o.attempts < 3 and (o.status = 'queued' or (o.status = 'sending' and o.updated_at < now() - interval '10 minutes'))
     )
  then
    return;
  end if;

  select s.decrypted_secret into base_url from vault.decrypted_secrets s where s.name = 'project_url';
  select s.decrypted_secret into secret   from vault.decrypted_secrets s where s.name = 'cron_secret';
  if base_url is null or secret is null then
    perform public.log_system_event_throttled('send_emails_cron', 'Във Vault липсва project_url или cron_secret: писмата не се изпращат');
    return;
  end if;

  perform net.http_post(
    url := rtrim(base_url, '/') || '/functions/v1/send-emails',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
exception when others then
  perform public.log_system_event_throttled('send_emails_cron', 'Грешка при извикване на send-emails: ' || sqlerrm);
end;
$$;

revoke execute on function public.log_system_event_throttled(text, text) from public, anon, authenticated;
revoke execute on function public.invoke_send_emails() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('callsliven_send_emails', '* * * * *', $c$select public.invoke_send_emails()$c$);
  end if;
end $$;
