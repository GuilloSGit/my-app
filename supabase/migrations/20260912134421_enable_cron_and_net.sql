-- Fase 0 spike: habilitar pg_cron y pg_net para el reconciliador de Zoom.
-- No contiene secretos — la programación real de jobs con credenciales
-- (Fase 5) se hace aparte via Supabase Vault, nunca en una migración versionada.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
