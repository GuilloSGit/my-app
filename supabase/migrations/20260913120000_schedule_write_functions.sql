-- Fase 4: funciones SECURITY DEFINER para el editor de horario
-- (`schedule-write`). A diferencia de reconciler_upsert_occurrence/
-- reconciler_cancel_occurrence (que escriben por fecha, para el
-- reconciliador diario), estas escriben por `id` de ocurrencia — el
-- update/cancel que produce diffOccurrences() ya trae el id de la fila
-- existente a tocar (emparejamiento posicional, no por fecha). Escribir
-- por fecha acá dejaría filas duplicadas cuando cambia el día/hora del
-- schedule.
--
-- IMPORTANTE: expand() (el generador del lado "desired") arma cada
-- DesiredOccurrence con agenda:null siempre — es un generador de
-- calendario puro, no sabe nada de WOL. schedule_write_update_occurrence
-- NUNCA recibe/escribe agenda como parámetro: la lee de vuelta de la fila
-- que acaba de actualizar (`returning agenda`) y la reusa tal cual en el
-- payload del outbox. Si en algún momento se "simplifica" esto pasando
-- p_agenda desde afuera, cualquier edición de horario va a borrar la
-- agenda ya sincronizada de las próximas ocurrencias (y ese blank se
-- propaga al PATCH real de Zoom) — mismo tipo de bug que ya se evitó una
-- vez con join_url en Fase 2, ver ZOOM_AUTOMATION.md.

create or replace function schedule_write_update_occurrence(
  p_id uuid,
  p_starts_at timestamptz,
  p_duration_minutes int,
  p_topic text
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_schedule_id uuid;
  v_timezone text;
  v_agenda text;
  v_zoom_meeting_id bigint;
begin
  select schedule_id into v_schedule_id from meeting_occurrences where id = p_id;
  if v_schedule_id is null then
    raise exception 'schedule_write_update_occurrence: ocurrencia % no encontrada', p_id;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_schedule_id::text, 0));

  select timezone into v_timezone from meeting_schedules where id = v_schedule_id;

  update meeting_occurrences
  set starts_at = p_starts_at,
      duration_minutes = p_duration_minutes,
      topic = p_topic,
      status = 'pending',
      blocked_reason = null
  where id = p_id
  returning agenda, zoom_meeting_id into v_agenda, v_zoom_meeting_id;

  insert into zoom_outbox (occurrence_id, action, payload)
  values (
    p_id,
    case when v_zoom_meeting_id is null then 'create' else 'update' end,
    jsonb_build_object(
      'topic', p_topic,
      'agenda', v_agenda,
      'starts_at', p_starts_at,
      'duration_minutes', p_duration_minutes,
      'timezone', v_timezone,
      'zoom_meeting_id', v_zoom_meeting_id
    )
  );
end;
$$;

create or replace function schedule_write_cancel_occurrence(
  p_id uuid,
  p_reason text
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_schedule_id uuid;
  v_zoom_meeting_id bigint;
begin
  select schedule_id into v_schedule_id from meeting_occurrences where id = p_id;
  if v_schedule_id is null then
    raise exception 'schedule_write_cancel_occurrence: ocurrencia % no encontrada', p_id;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_schedule_id::text, 0));

  update meeting_occurrences
  set status = 'cancelled', blocked_reason = p_reason
  where id = p_id
  returning zoom_meeting_id into v_zoom_meeting_id;

  -- Igual que reconciler_cancel_occurrence: solo hay algo que cancelar del
  -- lado de Zoom si ya se había creado una reunión ahí.
  if v_zoom_meeting_id is not null then
    insert into zoom_outbox (occurrence_id, action, payload)
    values (p_id, 'cancel', jsonb_build_object('zoom_meeting_id', v_zoom_meeting_id));
  end if;
end;
$$;

revoke all on function schedule_write_update_occurrence(uuid, timestamptz, int, text) from public;
revoke all on function schedule_write_cancel_occurrence(uuid, text) from public;

grant execute on function schedule_write_update_occurrence(uuid, timestamptz, int, text) to service_role;
grant execute on function schedule_write_cancel_occurrence(uuid, text) to service_role;
