-- Fase 4: horario real de la congregación, cargado a mano por única vez.
-- Confirmado con el usuario 2026-09-12: entresemana jueves 19:00 (2hs),
-- fin de semana sábado 18:00 (2hs). Esto es un stopgap — el editor de
-- horario (Fase 4, punto 5) va a reemplazar esta carga manual por una UI
-- editable, para cuando el horario cambie en el futuro no haga falta
-- tocar la base de nuevo.
insert into meeting_schedules (kind, weekday, local_time, timezone, duration_minutes, active)
values
  ('midweek', 4, '19:00:00', 'America/Argentina/San_Juan', 120, true),
  ('weekend', 6, '18:00:00', 'America/Argentina/San_Juan', 120, true);
