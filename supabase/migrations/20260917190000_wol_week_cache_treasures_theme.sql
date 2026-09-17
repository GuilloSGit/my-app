-- A pedido del usuario: el mensaje de WhatsApp enriquecido (Fase 3+) todavía
-- no traía el título real de "Tesoros de la Biblia" (entresemana) ni la caja
-- "TEMA" del artículo de estudio (fin de semana) — ambos se cachean acá
-- junto al resto de la agenda, mismo patrón que
-- 20260913170000_wol_week_cache_bible_reading.sql y
-- 20260913180000_wol_week_cache_edition.sql. Ver wol.ts
-- (parseTreasuresTitle/parseWeekendTheme) y ROADMAP.md/PROGRESS.md.
alter table wol_week_cache
  add column midweek_treasures_title text,
  add column weekend_theme text;
