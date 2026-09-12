-- Fase 3: `enrich_agenda` quedó en el schema desde el diseño original
-- (spec previo a Fase 1) como una acción de PATCH-solo-agenda separada de
-- create/update, pero nunca se implementó un productor para ella —
-- `reconciler_upsert_occurrence` (Fase 1/2) ya resuelve el mismo caso
-- encolando 'update' cuando el contenido cambia sobre una ocurrencia ya
-- sincronizada (preserva join_url igual que un PATCH real haría). Sacarla
-- del constraint en vez de dejarla como código muerto sin productor ni
-- consumidor real.
alter table zoom_outbox drop constraint zoom_outbox_action_check;
alter table zoom_outbox add constraint zoom_outbox_action_check
  check (action in ('create', 'update', 'cancel'));
