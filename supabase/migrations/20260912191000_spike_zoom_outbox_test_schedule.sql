-- Fase 2 spike: schedule throwaway para confirmar de punta a punta que
-- reconciler_upsert_occurrence/reconciler_cancel_occurrence ahora encolan
-- filas reales en zoom_outbox. Se borra apenas se confirma (ver migración
-- de cleanup inmediatamente posterior).
insert into meeting_schedules (id, kind, weekday, local_time, timezone, duration_minutes, active)
values ('00000000-0000-0000-0000-000000000002', 'midweek', 4, '19:00:00', 'America/Argentina/San_Juan', 90, true);
