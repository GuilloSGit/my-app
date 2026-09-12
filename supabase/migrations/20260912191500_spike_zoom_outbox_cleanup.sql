-- Fase 2 spike cleanup: se confirmó de punta a punta contra el proyecto
-- real (ver PROGRESS.md 2026-09-12) que reconciler_upsert_occurrence
-- encola 'create' en zoom_outbox, que reconcileMonth corrido dos veces no
-- duplica jobs (idempotencia también a nivel de outbox), y que zoom-apply
-- dequeue/backoff/last_error funcionan con una falla real de OAuth (sin
-- credenciales de Zoom todavía). Se retira todo el artefacto throwaway.
delete from zoom_outbox where occurrence_id in (
  select id from meeting_occurrences where schedule_id = '00000000-0000-0000-0000-000000000002'
);
delete from reconcile_runs where schedule_id = '00000000-0000-0000-0000-000000000002';
delete from meeting_occurrences where schedule_id = '00000000-0000-0000-0000-000000000002';
delete from meeting_schedules where id = '00000000-0000-0000-0000-000000000002';
