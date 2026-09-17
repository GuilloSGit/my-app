import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "../_shared/admin-auth.ts";
import { corsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { computeScheduleWriteOps } from "../_shared/reconciler/schedule-write.ts";
import type { Occurrence, Schedule } from "../_shared/reconciler/types.ts";

// Editor de horario (Fase 4): preview + guardado de un cambio a
// meeting_schedules. El diff SIEMPRE se recalcula acá contra el estado
// real de la base, tanto en preview (commit:false) como en el guardado
// (commit:true) -- nunca se confía en un diff mandado por el cliente, así
// no importa cuánto tiempo pase entre "Ver cambios" y "Confirmar".
//
// Alcance de esta iteración: solo edita día/hora/duración de uno de los 2
// schedules existentes (kind/timezone/active no se tocan acá). Guardar no
// dispara sync a Zoom -- eso lo sigue haciendo el botón "Sincronizar
// ahora" (zoom-apply-dispatch) por separado.

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

interface Body {
  scheduleId?: string;
  weekday?: number;
  localTime?: string;
  durationMinutes?: number;
  commit?: boolean;
}

function validationError(body: Body): string | null {
  if (!body.scheduleId) return "scheduleId es requerido";
  if (
    typeof body.weekday !== "number" ||
    !Number.isInteger(body.weekday) ||
    body.weekday < 0 ||
    body.weekday > 6
  ) {
    return "weekday debe ser un entero entre 0 y 6";
  }
  if (typeof body.localTime !== "string" || !/^\d{2}:\d{2}(:\d{2})?$/.test(body.localTime)) {
    return "localTime debe tener formato HH:mm o HH:mm:ss";
  }
  // El dropdown de horarios de Zoom (zoom-automation/lib/zoom-browser.ts)
  // solo ofrece opciones cada 15 minutos -- un localTime fuera de esa
  // grilla cuelga la automatización más adelante buscando una opción que
  // no existe (ver PROGRESS.md 2026-09-17, caso real con duration_minutes:
  // 140). Se corta acá, en el único punto de entrada de escritura, en vez
  // de descubrirlo recién en el navegador automatizado.
  if (Number(body.localTime.slice(3, 5)) % 15 !== 0) {
    return "localTime debe caer en un múltiplo de 15 minutos (Zoom solo permite :00, :15, :30, :45)";
  }
  if (
    typeof body.durationMinutes !== "number" ||
    !Number.isInteger(body.durationMinutes) ||
    body.durationMinutes <= 0
  ) {
    return "durationMinutes debe ser un entero positivo";
  }
  if (body.durationMinutes % 15 !== 0) {
    return "durationMinutes debe ser múltiplo de 15 (el dropdown de duración de Zoom solo permite 0/15/30/45 minutos)";
  }
  return null;
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  const admin = await requireAdmin(req, {
    supabaseUrl: Deno.env.get("SUPABASE_URL")!,
    supabaseAnonKey: Deno.env.get("SUPABASE_ANON_KEY")!,
    adminEmailsEnv: Deno.env.get("ADMIN_EMAILS"),
  });
  if (admin instanceof Response) return admin;

  let body: Body;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const error = validationError(body);
  if (error) return jsonResponse({ error }, 400);

  const localTime = body.localTime!.length === 5 ? `${body.localTime}:00` : body.localTime!;
  const commit = body.commit === true;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: currentRow, error: scheduleError } = await supabase
    .from("meeting_schedules")
    .select("*")
    .eq("id", body.scheduleId)
    .single();

  if (scheduleError || !currentRow) {
    return jsonResponse({ error: "schedule no encontrado" }, 404);
  }

  const proposed: Schedule = {
    id: currentRow.id,
    kind: currentRow.kind,
    weekday: body.weekday!,
    localTime,
    timezone: currentRow.timezone,
    durationMinutes: body.durationMinutes!,
    active: currentRow.active,
  };

  const now = new Date();
  const until = new Date(now);
  until.setMonth(until.getMonth() + 1);

  const { data: actualRows, error: actualError } = await supabase
    .from("meeting_occurrences")
    .select("*")
    .eq("schedule_id", proposed.id)
    .neq("status", "cancelled")
    .eq("pinned", false)
    .gte("starts_at", now.toISOString())
    .lte("starts_at", until.toISOString())
    .order("starts_at", { ascending: true });

  if (actualError) {
    return jsonResponse({ error: `no se pudieron leer las ocurrencias: ${actualError.message}` }, 500);
  }

  const actual: Occurrence[] = (actualRows ?? []).map((row) => ({
    id: row.id,
    scheduleId: row.schedule_id,
    startsAt: new Date(row.starts_at),
    durationMinutes: row.duration_minutes,
    topic: row.topic,
    agenda: row.agenda,
    wolWeek: row.wol_week,
    zoomMeetingId: row.zoom_meeting_id,
    joinUrl: row.join_url,
    passcode: row.passcode,
    status: row.status,
    blockedReason: row.blocked_reason,
    origin: row.origin,
    pinned: row.pinned,
  }));

  const ops = computeScheduleWriteOps(proposed, actual, now);

  if (!commit) {
    return jsonResponse({ ops, committed: false });
  }

  const scheduleChanged =
    currentRow.weekday !== proposed.weekday ||
    currentRow.local_time !== proposed.localTime ||
    currentRow.duration_minutes !== proposed.durationMinutes;

  if (scheduleChanged) {
    const { error: updateError } = await supabase
      .from("meeting_schedules")
      .update({
        weekday: proposed.weekday,
        local_time: proposed.localTime,
        duration_minutes: proposed.durationMinutes,
      })
      .eq("id", proposed.id);

    if (updateError) {
      return jsonResponse({ error: `no se pudo actualizar el schedule: ${updateError.message}` }, 500);
    }
  }

  const errors: string[] = [];

  for (const op of ops) {
    try {
      if (op.kind === "create") {
        const { error: rpcError } = await supabase.rpc("reconciler_upsert_occurrence", {
          p_schedule_id: proposed.id,
          p_starts_at: op.startsAt,
          p_duration_minutes: proposed.durationMinutes,
          p_topic: op.topic,
          p_agenda: null,
          p_timezone: proposed.timezone,
        });
        if (rpcError) throw new Error(rpcError.message);
      } else if (op.kind === "update") {
        const { error: rpcError } = await supabase.rpc("schedule_write_update_occurrence", {
          p_id: op.occurrenceId,
          p_starts_at: op.startsAt,
          p_duration_minutes: proposed.durationMinutes,
          p_topic: op.topic,
        });
        if (rpcError) throw new Error(rpcError.message);
      } else {
        const { error: rpcError } = await supabase.rpc("schedule_write_cancel_occurrence", {
          p_id: op.occurrenceId,
          p_reason: "schedule_changed",
        });
        if (rpcError) throw new Error(rpcError.message);
      }
    } catch (e) {
      errors.push(`${op.kind} ${op.startsAt}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return jsonResponse({ ops, committed: true, errors });
});
