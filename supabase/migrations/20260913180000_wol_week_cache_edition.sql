-- A pedido del usuario: la agenda de fin de semana solo traía el título del
-- artículo (cardLine1, ej. "Aprendamos de los gabaonitas"), sin la edición
-- de La Atalaya de donde sale (cardLine2, ej. "La Atalaya (estudio) 2026 |
-- julio") — dato real que ya está en la misma tarjeta de wol.jw.org, sin
-- ningún fetch extra (a diferencia de la lectura bíblica de Fase 3, que sí
-- necesitó un segundo fetch). Existe también para "midweek" (la guía
-- mensual), así que la columna es simétrica aunque el pedido puntual haya
-- sido por "weekend". Ver wol.ts (parseWolHtml) y PROGRESS.md 2026-09-14.
alter table wol_week_cache
  add column midweek_edition text,
  add column weekend_edition text;
