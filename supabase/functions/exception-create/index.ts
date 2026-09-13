import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "../_shared/admin-auth.ts";
import { corsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { defaultAssemblyLabel, matchingOccurrenceDates } from "../_shared/reconciler/occurrence-actions.ts";
import { occurrenceDateForWeek } from "../_shared/reconciler/occurrence-date.ts";
import { isoWeekKeyFromCalendarDate } from "../_shared/reconciler/iso-week.ts";

// Form de excepción genérico (Fase 4, último punto): declara una
// excepción de forma proactiva, antes de que el reconciliador haya
// llegado a calcular esa semana — a diferencia de "Marcar Asamblea"/
// "Cancelar" en occurrence-action, que solo actúan sobre una fila que ya
// existe. Si ya había una fila calculada para alguna de las fechas
// afectadas, se cancela en el mismo submit (mismo RPC que ya usa
// occurrence-action). Sin preview: el form + "Confirmar" del diálogo es
// la salvaguarda, mismo criterio que occurrence-action.

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

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface Body {
  kind?: "assembly" | "special_event";
  date?: string;
  venue?: string;
  eventDays?: string[];
  suppresses?: string[];
  createsZoom?: boolean;
  label?: string;
}

function validationError(body: Body): string | null {
  if (body.kind !== "assembly" && body.kind !== "special_event") return "kind inválido";
  if (body.kind === "assembly" && (!body.date || !DATE_RE.test(body.date))) {
    return "date es requerida (yyyy-MM-dd) para Asamblea";
  }
  if (body.kind === "special_event") {
    if (!Array.isArray(body.eventDays) || body.eventDays.length === 0) {
      return "eventDays requiere al menos una fecha";
    }
    if (body.eventDays.some((d) => !DATE_RE.test(d))) return "eventDays debe tener formato yyyy-MM-dd";
    if (body.suppresses?.some((k) => k !== "midweek" && k !== "weekend")) {
      return "suppresses solo admite midweek/weekend";
    }
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

  const { data: schedules, error: schedulesError } = await supabase
    .from("meeting_schedules")
    .select("*")
    .eq("active", true);
  if (schedulesError) return jsonResponse({ error: schedulesError.message }, 500);

  try {
    if (body.kind === "assembly") {
      const [year, month, day] = body.date!.split("-").map(Number);
      const week = isoWeekKeyFromCalendarDate(year, month, day);
      const referenceDate = new Date(`${body.date}T12:00:00Z`); // solo para defaultAssemblyLabel
      const eventDays: string[] = [];

      for (const row of schedules ?? []) {
        const date = occurrenceDateForWeek(
          { weekday: row.weekday, localTime: row.local_time, timezone: row.timezone },
          week,
        );
        eventDays.push(dateOnly(date));
        await cancelIfExists(supabase, row.id, date);
      }

      const { error: excError } = await supabase.from("schedule_exceptions").insert({
        kind: "assembly",
        label: body.venue ?? defaultAssemblyLabel(referenceDate, (schedules?.[0] ?? {}).timezone ?? "UTC"),
        venue: body.venue ?? null,
        event_days: eventDays,
        suppresses: (schedules ?? []).map((s) => s.kind),
        creates_zoom: false,
      });
      if (excError) throw new Error(excError.message);
    } else {
      const suppresses = body.suppresses ?? [];

      for (const row of schedules ?? []) {
        if (!suppresses.includes(row.kind)) continue;
        const dates = matchingOccurrenceDates(body.eventDays!, {
          weekday: row.weekday,
          localTime: row.local_time,
          timezone: row.timezone,
        });
        for (const date of dates) {
          await cancelIfExists(supabase, row.id, date);
        }
      }

      const { error: excError } = await supabase.from("schedule_exceptions").insert({
        kind: "special_event",
        label: body.label ?? "Acontecimiento especial",
        venue: body.venue ?? null,
        event_days: body.eventDays,
        suppresses,
        creates_zoom: body.createsZoom === true,
      });
      if (excError) throw new Error(excError.message);
    }
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }

  return jsonResponse({ ok: true });
});

async function cancelIfExists(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  scheduleId: string,
  date: Date,
): Promise<void> {
  const { data: existing, error: lookupError } = await supabase
    .from("meeting_occurrences")
    .select("id, status")
    .eq("schedule_id", scheduleId)
    .eq("starts_at", date.toISOString())
    .maybeSingle();
  if (lookupError) throw new Error(lookupError.message);

  if (existing && existing.status !== "cancelled") {
    const { error: cancelError } = await supabase.rpc("schedule_write_cancel_occurrence", {
      p_id: existing.id,
      p_reason: "exception",
    });
    if (cancelError) throw new Error(cancelError.message);
  }
}
