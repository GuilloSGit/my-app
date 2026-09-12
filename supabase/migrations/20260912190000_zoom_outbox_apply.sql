-- Fase 2: conecta el outbox real. Las funciones de escritura del
-- reconciliador (Fase 1) ahora encolan en `zoom_outbox` cuando SÍ aplican un
-- cambio (misma guarda `where` ya existente evita encolar cuando el
-- contenido es idéntico al de antes — ver 20260912165322 para el porqué).
-- Se agregan además `dequeue_zoom_jobs`/`complete_zoom_job`, consumidas por
-- la Edge Function `zoom-apply`.

-- reconciler_upsert_occurrence cambia de firma: se agrega p_timezone,
-- necesario para que el payload del outbox sea autosuficiente (zoom-apply
-- arma `start_time` sin depender de volver a leer meeting_schedules).
drop function if exists reconciler_upsert_occurrence(uuid, timestamptz, int, text, text);

create or replace function reconciler_upsert_occurrence(
  p_schedule_id uuid,
  p_starts_at timestamptz,
  p_duration_minutes int,
  p_topic text,
  p_agenda text,
  p_timezone text
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_zoom_meeting_id bigint;
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
        or meeting_occurrences.status = 'cancelled')
  returning id, zoom_meeting_id into v_id, v_zoom_meeting_id;

  -- v_id solo viene no-nulo si la guarda de arriba realmente aplicó el
  -- cambio (insert nuevo, o update que pasó el `where`) — eso es lo que
  -- mantiene la garantía de dirty-check también a nivel de Zoom: guardar el
  -- form sin cambios sigue sin encolar nada. zoom_meeting_id null = todavía
  -- no existe en Zoom → 'create'; no-null = ya sincronizada antes → 'update'
  -- (PATCH conserva join_url).
  if v_id is not null then
    insert into zoom_outbox (occurrence_id, action, payload)
    values (
      v_id,
      case when v_zoom_meeting_id is null then 'create' else 'update' end,
      jsonb_build_object(
        'topic', p_topic,
        'agenda', p_agenda,
        'starts_at', p_starts_at,
        'duration_minutes', p_duration_minutes,
        'timezone', p_timezone,
        'zoom_meeting_id', v_zoom_meeting_id
      )
    );
  end if;
end;
$$;

revoke all on function reconciler_upsert_occurrence(uuid, timestamptz, int, text, text, text) from public;
grant execute on function reconciler_upsert_occurrence(uuid, timestamptz, int, text, text, text) to service_role;

-- reconciler_cancel_occurrence: misma firma de antes (no necesita
-- timezone, cancel solo necesita el zoom_meeting_id existente), se
-- reemplaza el cuerpo para encolar un job 'cancel' cuando corresponde.
create or replace function reconciler_cancel_occurrence(
  p_schedule_id uuid,
  p_starts_at timestamptz,
  p_duration_minutes int,
  p_topic text,
  p_reason text
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_zoom_meeting_id bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_schedule_id::text, 0));

  insert into meeting_occurrences (schedule_id, starts_at, duration_minutes, topic, status, blocked_reason, origin)
  values (p_schedule_id, p_starts_at, p_duration_minutes, p_topic, 'cancelled', p_reason, 'schedule')
  on conflict (schedule_id, starts_at) do update
    set status = 'cancelled', blocked_reason = excluded.blocked_reason
    where meeting_occurrences.pinned = false
      and (meeting_occurrences.status is distinct from 'cancelled'
        or meeting_occurrences.blocked_reason is distinct from excluded.blocked_reason)
  returning id, zoom_meeting_id into v_id, v_zoom_meeting_id;

  -- Solo hay algo que cancelar del lado de Zoom si ya se había creado una
  -- reunión ahí (zoom_meeting_id no nulo). Si nunca se sincronizó, cancelar
  -- en Postgres alcanza.
  if v_id is not null and v_zoom_meeting_id is not null then
    insert into zoom_outbox (occurrence_id, action, payload)
    values (v_id, 'cancel', jsonb_build_object('zoom_meeting_id', v_zoom_meeting_id));
  end if;
end;
$$;

-- reconciler_mark_blocked no cambia: bloquear nunca toca Zoom (ver
-- ZOOM_AUTOMATION.md — "si ya existía una reunión sincronizada... no se
-- borra, queda como está y se marca").

create or replace function dequeue_zoom_jobs(p_limit int default 5)
returns setof zoom_outbox
language plpgsql security definer set search_path = public as $$
begin
  -- `for update skip locked` es lo que permite correr zoom-apply más
  -- seguido que su propia duración típica sin que dos invocaciones
  -- concurrentes tomen el mismo job (mismo patrón de pg-boss que este
  -- outbox reemplaza).
  return query
    update zoom_outbox
    set status = 'processing', updated_at = now()
    where id in (
      select id from zoom_outbox
      where status = 'pending' and available_at <= now()
      order by available_at
      limit p_limit
      for update skip locked
    )
    returning *;
end;
$$;

revoke all on function dequeue_zoom_jobs(int) from public;
grant execute on function dequeue_zoom_jobs(int) to service_role;

create or replace function complete_zoom_job(
  p_id bigint,
  p_success boolean,
  p_error text default null,
  p_zoom_meeting_id bigint default null,
  p_join_url text default null,
  p_passcode text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_occurrence_id uuid;
  v_action text;
  v_attempts int;
begin
  select occurrence_id, action, attempts into v_occurrence_id, v_action, v_attempts
  from zoom_outbox where id = p_id;

  if v_occurrence_id is null then
    return; -- job inexistente: defensivo, no debería pasar en uso normal
  end if;

  if p_success then
    update zoom_outbox set status = 'done', updated_at = now() where id = p_id;

    if v_action in ('create', 'update') then
      update meeting_occurrences
      set zoom_meeting_id = coalesce(p_zoom_meeting_id, zoom_meeting_id),
          join_url = coalesce(p_join_url, join_url),
          passcode = coalesce(p_passcode, passcode),
          status = 'synced'
      where id = v_occurrence_id;
    end if;
    -- action = 'cancel': meeting_occurrences.status ya quedó 'cancelled'
    -- desde reconciler_cancel_occurrence, nada más que persistir acá.
  else
    -- Backoff exponencial (1,2,4,8min...) con techo de 5 intentos; después
    -- pasa a 'failed' y requiere revisión humana en vez de reintentar para
    -- siempre. Limitación aceptada: un job que quede en 'processing' porque
    -- la invocación se cayó antes de llamar a complete_zoom_job no tiene
    -- todavía un reaper — no crítico al volumen actual (~2 reuniones/semana),
    -- pendiente si se vuelve un problema real.
    update zoom_outbox
    set attempts = attempts + 1,
        status = case when attempts + 1 >= 5 then 'failed' else 'pending' end,
        last_error = p_error,
        available_at = now() + (power(2, least(attempts + 1, 6)) * interval '1 minute'),
        updated_at = now()
    where id = p_id;
  end if;
end;
$$;

revoke all on function complete_zoom_job(bigint, boolean, text, bigint, text, text) from public;
grant execute on function complete_zoom_job(bigint, boolean, text, bigint, text, text) to service_role;
