-- Fase 0 spike: probar pg_cron -> pg_net -> Edge Function end-to-end.
-- Throwaway: se desprograma y se borra apenas se confirma que funciona.
select cron.schedule(
  'spike-ping',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://lwucctdliysrsscmjxsh.supabase.co/functions/v1/ping',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
