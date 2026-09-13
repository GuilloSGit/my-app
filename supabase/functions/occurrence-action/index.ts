import { createClient } from "@supabase/supabase-js";
import { fromZonedTime } from "date-fns-tz";
import { requireAdmin } from "../_shared/admin-auth.ts";
import { corsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { buildTopic } from "../_shared/reconciler/topic.ts";
import { siblingWeekDate, defaultAssemblyLabel } from "../_shared/reconciler/occurrence-actions.ts";

// Acciones de un clic sobre una fila de /dashboard/automatizacion: Marcar
// Asamblea, Marcar Conmemoración, Crear igual sin contenido, Cancelar
// esta reunión, Mover a otro día. Sin preview (a diferencia de
// schedule-write): son acciones puntuales de una sola fila, no un diff de
// varias semanas — el form + botón "Confirmar" del diálogo es la única
// salvaguarda.
//
// "cancel"/"move" escriben una excepción real en schedule_exceptions, no
// alcanza con cancelar la fila: reconcile vuelve a evaluar cada semana
// desde cero cada corrida, y reconciler_upsert_occurrence revive
// cualquier fila 'cancelled' en una fecha donde WOL siga teniendo
// contenido (ver el `where ... status = 'cancelled'` de su guarda). Ver
// ZOOM_AUTOMATION.md/PROGRESS.md para el resto del razonamiento por acción.

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function dateOnly(d: Date): string {
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function normalizeTime(time: string): string {
  return time.length === 5 ? `${time}:00` : time;
}

type Action = "cancel" | "move" | "mark_assembly" | "mark_memorial" | "create_without_content";

interface Body {
  occurrenceId?: string;
  action?: Action;
  reason?: string;
  date?: string;
  time?: string;
  label?: string;
  venue?: string;
}

const VALID_ACTIONS: Action[] = ["cancel", "move", "mark_assembly", "mark_memorial", "create_without_content"];

function validationError(body: Body): string | null {
  if (!body.occurrenceId) return "occurrenceId es requerido";
  if (!body.action || !VALID_ACTIONS.includes(body.action)) return "action inválida";
  if (
    (body.action === "move" || body.action === "mark_memorial") &&
    (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date) || !body.time || !/^\d{2}:\d{2}(:\d{2})?$/.test(body.time))
  ) {
    return "date/time son requeridos (yyyy-MM-dd / HH:mm) para esta acción";
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

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: occ, error: occError } = await supabase
    .from("meeting_occurrences")
    .select("*")
    .eq("id", body.occurrenceId)
    .single();
  if (occError || !occ) return jsonResponse({ error: "ocurrencia no encontrada" }, 404);

  const { data: schedule, error: schedError } = await supabase
    .from("meeting_schedules")
    .select("*")
    .eq("id", occ.schedule_id)
    .single();
  if (schedError || !schedule) return jsonResponse({ error: "schedule no encontrado" }, 404);

  const startsAt = new Date(occ.starts_at);

  try {
    switch (body.action) {
      case "cancel": {
        const { error: excError } = await supabase.from("schedule_exceptions").insert({
          kind: "no_meeting",
          label: body.reason ?? "Cancelada a mano",
          venue: null,
          event_days: [dateOnly(startsAt)],
          suppresses: [schedule.kind],
          creates_zoom: false,
        });
        if (excError) throw new Error(excError.message);

        const { error: cancelError } = await supabase.rpc("schedule_write_cancel_occurrence", {
          p_id: occ.id,
          p_reason: body.reason ?? "manual_cancel",
        });
        if (cancelError) throw new Error(cancelError.message);
        break;
      }

      case "move": {
        const newStartsAt = fromZonedTime(`${body.date}T${normalizeTime(body.time!)}`, schedule.timezone);

        const { error: excError } = await supabase.from("schedule_exceptions").insert({
          kind: "special_event",
          label: body.label ?? "Reunión movida",
          venue: null,
          event_days: [dateOnly(startsAt)],
          suppresses: [schedule.kind],
          creates_zoom: true,
        });
        if (excError) throw new Error(excError.message);

        const { error: cancelError } = await supabase.rpc("schedule_write_cancel_occurrence", {
          p_id: occ.id,
          p_reason: "moved",
        });
        if (cancelError) throw new Error(cancelError.message);

        const { error: upsertError } = await supabase.rpc("reconciler_upsert_occurrence", {
          p_schedule_id: schedule.id,
          p_starts_at: newStartsAt.toISOString(),
          p_duration_minutes: schedule.duration_minutes,
          p_topic: buildTopic(schedule.kind, newStartsAt, schedule.timezone),
          p_agenda: null,
          p_timezone: schedule.timezone,
        });
        if (upsertError) throw new Error(upsertError.message);
        break;
      }

      case "mark_assembly": {
        const { data: otherSchedule, error: otherError } = await supabase
          .from("meeting_schedules")
          .select("*")
          .neq("kind", schedule.kind)
          .eq("active", true)
          .maybeSingle();
        if (otherError) throw new Error(otherError.message);

        const eventDays = [dateOnly(startsAt)];
        if (otherSchedule) {
          const siblingDate = siblingWeekDate(startsAt, schedule.timezone, {
            weekday: otherSchedule.weekday,
            localTime: otherSchedule.local_time,
            timezone: otherSchedule.timezone,
          });
          eventDays.push(dateOnly(siblingDate));

          const { data: siblingOcc, error: siblingLookupError } = await supabase
            .from("meeting_occurrences")
            .select("id, status")
            .eq("schedule_id", otherSchedule.id)
            .eq("starts_at", siblingDate.toISOString())
            .maybeSingle();
          if (siblingLookupError) throw new Error(siblingLookupError.message);

          if (siblingOcc && siblingOcc.status !== "cancelled") {
            const { error: siblingCancelError } = await supabase.rpc("schedule_write_cancel_occurrence", {
              p_id: siblingOcc.id,
              p_reason: "assembly",
            });
            if (siblingCancelError) throw new Error(siblingCancelError.message);
          }
        }

        const { error: excError } = await supabase.from("schedule_exceptions").insert({
          kind: "assembly",
          label: body.venue ?? defaultAssemblyLabel(startsAt, schedule.timezone),
          venue: body.venue ?? null,
          event_days: eventDays,
          suppresses: ["midweek", "weekend"],
          creates_zoom: false,
        });
        if (excError) throw new Error(excError.message);

        const { error: cancelError } = await supabase.rpc("schedule_write_cancel_occurrence", {
          p_id: occ.id,
          p_reason: "assembly",
        });
        if (cancelError) throw new Error(cancelError.message);
        break;
      }

      case "mark_memorial": {
        const newStartsAt = fromZonedTime(`${body.date}T${normalizeTime(body.time!)}`, schedule.timezone);

        const { error: upsertError } = await supabase.rpc("reconciler_upsert_occurrence", {
          p_schedule_id: schedule.id,
          p_starts_at: newStartsAt.toISOString(),
          p_duration_minutes: schedule.duration_minutes,
          p_topic: "Conmemoración",
          p_agenda: null,
          p_timezone: schedule.timezone,
        });
        if (upsertError) throw new Error(upsertError.message);
        break;
      }

      case "create_without_content": {
        const { error: upsertError } = await supabase.rpc("reconciler_upsert_occurrence", {
          p_schedule_id: schedule.id,
          p_starts_at: occ.starts_at,
          p_duration_minutes: schedule.duration_minutes,
          p_topic: buildTopic(schedule.kind, startsAt, schedule.timezone),
          p_agenda: null,
          p_timezone: schedule.timezone,
        });
        if (upsertError) throw new Error(upsertError.message);

        const { error: pinError } = await supabase
          .from("meeting_occurrences")
          .update({ pinned: true })
          .eq("schedule_id", schedule.id)
          .eq("starts_at", occ.starts_at);
        if (pinError) throw new Error(pinError.message);
        break;
      }
    }
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }

  return jsonResponse({ ok: true });
});
