-- Fase 4 (post-cierre), a pedido del usuario: el form de excepción de
-- Asamblea guardaba en `event_days` las fechas de las reuniones propias
-- suprimidas (jueves/sábado), nunca las fechas reales del evento — no
-- había ningún lugar para guardar "esta asamblea es el 06 al 08 de
-- noviembre" ni su título/si tiene representante de la Sucursal. Ver
-- PROGRESS.md 2026-09-13/14 para el detalle de la confusión que esto
-- generó con una excepción real ya cargada.
--
-- `starts_on`/`ends_on` son la fecha real del evento (distinta de
-- `event_days`, que sigue significando "qué reuniones quedan
-- canceladas"). Solo se completan para kind='assembly' — nadie las
-- necesita para 'special_event', que ya usa `event_days` con las fechas
-- reales tal cual las carga el admin.
alter table schedule_exceptions
  add column title text,
  add column with_branch_rep boolean not null default false,
  add column starts_on date,
  add column ends_on date;
