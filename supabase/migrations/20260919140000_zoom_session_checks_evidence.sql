-- 2026-09-19: constancia de cada chequeo de sesión de Zoom. Hasta ahora
-- solo se guardaba ok + message, sin ninguna prueba de que el navegador
-- realmente había entrado a la cuenta y visto contenido (el usuario lo
-- cuestionó: no había forma de saber si un "OK" era cierto).
--   final_url     — URL donde aterrizó el navegador.
--   meetings_seen — cantidad de reuniones visibles en "Próximas" (0 es
--                   válido: lista vacía real); null si el chequeo no
--                   pudo llegar a contarlas.
--   account_label — email/cuenta leída de /profile (solo evidencia, no
--                   decide el OK); null si no se pudo leer.
--   run_url       — link a la corrida de GitHub Actions, que tiene la
--                   captura de pantalla como artifact.
--   source        — 'manual' (botón / gh workflow run) o 'schedule' (cron).
-- Columnas nullable: las filas históricas quedan sin constancia.
alter table zoom_session_checks
  add column final_url text,
  add column meetings_seen integer,
  add column account_label text,
  add column run_url text,
  add column source text;
