-- Fase 1: funciones SECURITY DEFINER para las únicas tres escrituras que
-- hace el reconciliador diario sobre meeting_occurrences. Cada llamada RPC
-- es una transacción PostgREST propia, y adentro se toma
-- pg_advisory_xact_lock antes de escribir — así una corrida de cron y una
-- resolución manual simultánea sobre el mismo schedule no se pisan en el
-- momento de escribir (el paso de lectura/decisión previo, en TypeScript,
-- no está cubierto por este lock; ver PROGRESS.md 2026-09-12 para el porqué
-- de esa limitación aceptada en esta fase).
--
-- Las tres tienen guarda de "no escribir si no cambió nada" en el `where`
-- del `on conflict do update`: si el contenido es idéntico, la fila queda
-- intacta (ni siquiera se toca `status`). Es necesario, no cosmético — en
-- Fase 2 encolar al outbox va a depender de que `status` pase a 'pending',
-- y disparar eso todos los días sin que nada haya cambiado quemaría el
-- cupo de 100 req/día de Zoom con el mismo formulario guardado sin editar.
--
-- Ninguna toca zoom_meeting_id/join_url/passcode — eso lo completa el
-- consumidor del outbox en Fase 2. `pinned = false` en el `where` del
-- update es una defensa extra: el camino diario nunca debería apuntar a una
-- fecha pinneada (esas quedan en otra fecha, movidas a mano), pero si
-- pasara, no la pisa.

create or replace function reconciler_cancel_occurrence(
  p_schedule_id uuid,
  p_starts_at timestamptz,
  p_duration_minutes int,
  p_topic text,
  p_reason text
) returns void language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_schedule_id::text, 0));

  insert into meeting_occurrences (schedule_id, starts_at, duration_minutes, topic, status, blocked_reason, origin)
  values (p_schedule_id, p_starts_at, p_duration_minutes, p_topic, 'cancelled', p_reason, 'schedule')
  on conflict (schedule_id, starts_at) do update
    set status = 'cancelled', blocked_reason = excluded.blocked_reason
    where meeting_occurrences.pinned = false
      and (meeting_occurrences.status is distinct from 'cancelled'
        or meeting_occurrences.blocked_reason is distinct from excluded.blocked_reason);
end;
$$;

create or replace function reconciler_mark_blocked(
  p_schedule_id uuid,
  p_starts_at timestamptz,
  p_duration_minutes int,
  p_topic text,
  p_reason text
) returns void language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_schedule_id::text, 0));

  insert into meeting_occurrences (schedule_id, starts_at, duration_minutes, topic, status, blocked_reason, origin)
  values (p_schedule_id, p_starts_at, p_duration_minutes, p_topic, 'blocked', p_reason, 'schedule')
  on conflict (schedule_id, starts_at) do update
    set status = 'blocked', blocked_reason = excluded.blocked_reason
    where meeting_occurrences.pinned = false
      and (meeting_occurrences.status is distinct from 'blocked'
        or meeting_occurrences.blocked_reason is distinct from excluded.blocked_reason);
end;
$$;

create or replace function reconciler_upsert_occurrence(
  p_schedule_id uuid,
  p_starts_at timestamptz,
  p_duration_minutes int,
  p_topic text,
  p_agenda text
) returns void language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_schedule_id::text, 0));

  insert into meeting_occurrences (schedule_id, starts_at, duration_minutes, topic, agenda, status, origin)
  values (p_schedule_id, p_starts_at, p_duration_minutes, p_topic, p_agenda, 'pending', 'schedule')
  on conflict (schedule_id, starts_at) do update
    set topic = excluded.topic, agenda = excluded.agenda, blocked_reason = null, status = 'pending'
    where meeting_occurrences.pinned = false
      and (meeting_occurrences.topic is distinct from excluded.topic
        or meeting_occurrences.agenda is distinct from excluded.agenda
        or meeting_occurrences.status = 'blocked'
        or meeting_occurrences.status = 'cancelled');
end;
$$;

-- Revocar el default de PUBLIC y dar exec solo a service_role — estas
-- funciones escriben con privilegios de SECURITY DEFINER, no deben quedar
-- invocables por `authenticated`/`anon` via la Data API.
revoke all on function reconciler_cancel_occurrence(uuid, timestamptz, int, text, text) from public;
revoke all on function reconciler_mark_blocked(uuid, timestamptz, int, text, text) from public;
revoke all on function reconciler_upsert_occurrence(uuid, timestamptz, int, text, text) from public;

grant execute on function reconciler_cancel_occurrence(uuid, timestamptz, int, text, text) to service_role;
grant execute on function reconciler_mark_blocked(uuid, timestamptz, int, text, text) to service_role;
grant execute on function reconciler_upsert_occurrence(uuid, timestamptz, int, text, text) to service_role;
