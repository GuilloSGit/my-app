-- Fase 3 (post-cierre), a pedido del usuario: la agenda de la reunión de
-- entresemana solo traía el título/link genérico de la página del programa
-- (item.title/item.url), sin la cita real de "Lectura de la Biblia" —
-- ahora sí se cachea, junto al título/link, para no repetir el segundo
-- fetch (a la página del programa) en cada corrida de reconcile. Ver
-- wol.ts (parseBibleReading) y PROGRESS.md 2026-09-14.
alter table wol_week_cache
  add column midweek_bible_reading text;
