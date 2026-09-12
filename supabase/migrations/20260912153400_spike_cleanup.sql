-- Fase 0 spike cleanup: se confirmó que pg_cron -> pg_net -> Edge Function
-- funciona end-to-end contra el proyecto real (ver PROGRESS.md, 2026-09-12).
-- Se retiran los objetos throwaway; la función `ping` se borra aparte via CLI.
select cron.unschedule('spike-ping');
drop table public._spike_log;
