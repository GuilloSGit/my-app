-- Fase 5: activa el cron real de `reconcile`. pg_cron/pg_net ya estaban
-- habilitados desde Fase 0 (20260912134421_enable_cron_and_net.sql,
-- verificado end-to-end con el spike spike-ping/spike-cleanup).
--
-- Un solo `select net.http_post(...) from meeting_schedules where active
-- = true` dispara un net.http_post INDEPENDIENTE por fila — es el driver
-- que faltaba (Fase 0/2-bis lo dejaban pendiente): nunca espera la
-- respuesta de un schedule antes de "disparar" el siguiente (todas las
-- llamadas de pg_net son async), y se generaliza a los schedules que
-- estén `active` en vez de hardcodear los 2 IDs actuales.
--
-- El token nunca va acá (secret real, no puede vivir en una migración
-- versionada) — se lee de Supabase Vault por nombre. El usuario corre
-- una sola vez, en el SQL Editor de Supabase, con el mismo valor que ya
-- tiene cargado como secret de función RECONCILE_INTERNAL_TOKEN:
--
--   select vault.create_secret('<el mismo valor>', 'reconcile_internal_token');
--
-- El orden no importa: si esta migración se aplica antes de que exista
-- el secret, net.http_post manda un Bearer vacío y reconcile devuelve
-- 401 sin romper nada.
--
-- '0 6 */2 * *' es una aproximación de "cada 2 días" (días impares del
-- calendario, no un intervalo real de 48hs — puede dar 1 o 3 días de
-- separación justo en un cambio de mes), aceptada a propósito: es un
-- backstop, no una garantía exacta — "Sincronizar ahora" cubre la
-- necesidad de tiempo real.
select cron.schedule(
  'reconcile-every-2-days',
  '0 6 */2 * *',
  $$
  select net.http_post(
    url := 'https://lwucctdliysrsscmjxsh.supabase.co/functions/v1/reconcile',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'reconcile_internal_token'
      )
    ),
    body := jsonb_build_object('scheduleId', id)
  )
  from meeting_schedules
  where active = true;
  $$
);
