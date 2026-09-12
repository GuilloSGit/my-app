-- Fase 1 spike: schedule throwaway para probar la Edge Function `reconcile`
-- de punta a punta contra el proyecto real. No es el horario real de la
-- congregación (eso se carga en Fase 4, vía la UI). Se borra apenas se
-- confirma que funciona.
insert into meeting_schedules (id, kind, weekday, local_time, timezone, duration_minutes, active)
values ('00000000-0000-0000-0000-000000000001', 'midweek', 4, '19:00:00', 'America/Argentina/San_Juan', 90, true);
