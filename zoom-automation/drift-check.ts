import "dotenv/config";
import { ZoomBrowserClient } from "./lib/zoom-browser";
import { makeSupabase } from "./lib/outbox";

// drift-check (Fase 5, último ítem pendiente del roadmap): compara la
// cuenta real de Zoom contra meeting_occurrences y reporta divergencias,
// nunca corrige nada solo. Corre vía
// .github/workflows/zoom-drift-check.yml (cron semanal + a demanda desde
// el botón "Chequear divergencias ahora" de /dashboard/automatizacion).
// Ver el plan de implementación para el detalle de las decisiones
// tomadas con el usuario (alcance, aviso por email, etc.).

// Mismo horizonte que reconcileMonth/getUpcomingOccurrences — no tiene
// sentido reportar "falta en Zoom" para una ocurrencia que el propio
// reconciliador todavía ni calculó.
const HORIZON_DAYS = 35;

type IssueType = "missing_in_zoom" | "orphan_in_zoom" | "mismatch";

interface DriftIssue {
  type: IssueType;
  zoomMeetingId: number;
  occurrenceId?: string;
  topic: string;
  detail: string;
}

interface TrackedOccurrenceRow {
  id: string;
  zoom_meeting_id: number;
  topic: string;
  starts_at: string;
  duration_minutes: number;
  meeting_schedules: { timezone: string } | { timezone: string }[] | null;
}

function scheduleTimezone(row: TrackedOccurrenceRow): string {
  const embedded = Array.isArray(row.meeting_schedules) ? row.meeting_schedules[0] : row.meeting_schedules;
  return embedded?.timezone ?? "America/Argentina/Buenos_Aires";
}

async function sendDriftCheckEmail(issues: DriftIssue[]): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[drift-check] RESEND_API_KEY no configurada — no se manda el email de aviso, solo queda en el dashboard.");
    return;
  }

  const lines = issues.map((issue) => `- [${issue.type}] Zoom ${issue.zoomMeetingId} "${issue.topic}": ${issue.detail}`);

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Galpón Digital <no-reply@galpon-digital.com.ar>",
      to: "guillermoandrada@gmail.com",
      subject: `drift-check: ${issues.length} divergencia${issues.length === 1 ? "" : "s"} en Zoom (Media Agua)`,
      text: [`drift-check encontró ${issues.length} divergencia(s) entre Zoom y la base:`, "", ...lines].join("\n"),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(`Resend respondió ${res.status}: ${body}`);
  }
}

async function main() {
  const supabase = makeSupabase();
  const startedAt = new Date().toISOString();
  const issues: DriftIssue[] = [];

  // Todas las ocurrencias con zoom_meeting_id alguna vez seteado (no solo
  // las del horizonte de 35 días) — necesario para no marcar como
  // "huérfana" una reunión real que la automatización ya creó pero cae
  // más adelante en el calendario.
  const { data: allTrackedRows, error: allTrackedError } = await supabase
    .from("meeting_occurrences")
    .select("id, zoom_meeting_id, topic, starts_at, duration_minutes, meeting_schedules(timezone)")
    .not("zoom_meeting_id", "is", null);
  if (allTrackedError) throw new Error(`No se pudo leer meeting_occurrences: ${allTrackedError.message}`);

  const trackedIds = new Set((allTrackedRows as TrackedOccurrenceRow[]).map((row) => row.zoom_meeting_id));

  const now = new Date();
  const until = new Date(now.getTime() + HORIZON_DAYS * 24 * 60 * 60 * 1000);
  const toVerify = (allTrackedRows as TrackedOccurrenceRow[]).filter((row) => {
    const startsAt = new Date(row.starts_at);
    return startsAt >= now && startsAt <= until;
  });

  const client = new ZoomBrowserClient();
  await client.open();
  try {
    for (const row of toVerify) {
      const timezone = scheduleTimezone(row);
      const real = await client.readMeetingSummary(row.zoom_meeting_id, timezone);

      if (!real) {
        issues.push({
          type: "missing_in_zoom",
          zoomMeetingId: row.zoom_meeting_id,
          occurrenceId: row.id,
          topic: row.topic,
          detail: "La ocurrencia está sincronizada en la base pero la reunión ya no existe en Zoom.",
        });
        continue;
      }

      const mismatches: string[] = [];
      if (real.topic !== row.topic) {
        mismatches.push(`tema esperado "${row.topic}", real "${real.topic}"`);
      }
      if (Math.abs(real.startsAt.getTime() - new Date(row.starts_at).getTime()) > 60_000) {
        mismatches.push(`horario esperado ${row.starts_at}, real ${real.startsAt.toISOString()}`);
      }
      if (real.durationMinutes !== row.duration_minutes) {
        mismatches.push(`duración esperada ${row.duration_minutes}min, real ${real.durationMinutes}min`);
      }
      if (mismatches.length > 0) {
        issues.push({
          type: "mismatch",
          zoomMeetingId: row.zoom_meeting_id,
          occurrenceId: row.id,
          topic: row.topic,
          detail: mismatches.join("; "),
        });
      }
    }

    // Alcance amplio a propósito (decisión del usuario): cualquier
    // reunión de la cuenta que no matchee ningún zoom_meeting_id
    // trackeado se reporta, incluidas las del flujo manual viejo.
    const realMeetings = await client.listMeetingIds();
    for (const meeting of realMeetings) {
      if (trackedIds.has(meeting.zoomMeetingId)) continue;
      issues.push({
        type: "orphan_in_zoom",
        zoomMeetingId: meeting.zoomMeetingId,
        topic: meeting.topic,
        detail: "Reunión real en la cuenta de Zoom sin ninguna ocurrencia asociada en la base.",
      });
    }
  } finally {
    await client.close();
  }

  const { error: insertError } = await supabase.from("drift_check_runs").insert({
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    issues,
  });
  if (insertError) throw new Error(`No se pudo guardar la corrida de drift-check: ${insertError.message}`);

  console.log(`[drift-check] ${issues.length} divergencia(s) encontrada(s).`);

  if (issues.length > 0) {
    try {
      await sendDriftCheckEmail(issues);
    } catch (e) {
      // Un fallo del email no debe tirar abajo la corrida — el registro
      // ya quedó guardado en drift_check_runs, mismo criterio que ya usa
      // reconcile con el dispatch de zoom-apply-browser.
      console.error("[drift-check] No se pudo mandar el email de aviso:", e);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
