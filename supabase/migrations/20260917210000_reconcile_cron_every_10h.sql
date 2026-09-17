-- A pedido del usuario: bajar el backstop de "cada 2 días" a "al menos
-- una vez cada 10 horas" — sigue siendo un backstop (no una garantía en
-- tiempo real; para eso está "Sincronizar ahora"/disparar reconcile a
-- mano), pero un hueco de 2 días era demasiado si el cron real deja de
-- correr por algún motivo (como pasó: sin corridas reales entre el
-- 2026-09-13 y el 2026-09-17).
--
-- '0 */10 * * *' dispara a las 00, 10 y 20hs UTC — el hueco más largo
-- entre corridas queda en 10hs exactas (00→10, 10→20), el más corto en
-- 4hs (20→00 del día siguiente). Mismo criterio de aproximación aceptada
-- que ya se usaba con "cada 2 días" (ver 20260913150000_reconcile_cron.sql).
--
-- `cron.unschedule` por nombre no rompe si el job ya no existe con ese
-- nombre exacto (0 filas afectadas, sin error) — seguro de re-aplicar.
select cron.unschedule(jobid) from cron.job where jobname = 'reconcile-every-2-days';

select cron.schedule(
  'reconcile-every-10-hours',
  '0 */10 * * *',
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
