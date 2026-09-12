-- Fase 1 spike cleanup: se confirmó que la Edge Function `reconcile` corre
-- end-to-end contra el proyecto real (dry-run y aplicación real, dos
-- corridas seguidas sin error — ver PROGRESS.md 2026-09-12). Se retira el
-- schedule throwaway y todo lo que generó; `wol_week_cache` se deja intacto
-- porque es contenido real reutilizable, no un artefacto de la prueba.
delete from reconcile_runs where schedule_id = '00000000-0000-0000-0000-000000000001';
delete from meeting_occurrences where schedule_id = '00000000-0000-0000-0000-000000000001';
delete from meeting_schedules where id = '00000000-0000-0000-0000-000000000001';
