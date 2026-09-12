import { createClient } from "@supabase/supabase-js";
import { makeZoomClient } from "../_shared/zoom/client.ts";
import { applyZoomJob } from "../_shared/zoom/apply.ts";
import type { ZoomOutboxJob } from "../_shared/zoom/apply.ts";

// Función interna: la invoca el cron (Fase 5, cada 2 minutos vía pg_net) o
// una herramienta admin, nunca el browser de un usuario común. Mismo
// patrón simple que `reconcile`: alcanza con "¿tenés el token interno de
// esta función?", token propio (no compartido con RECONCILE_INTERNAL_TOKEN)
// generado esta sesión con `openssl rand -hex 32` — nunca un secreto del
// usuario.
function isAuthorized(req: Request): boolean {
  const expected = Deno.env.get("ZOOM_APPLY_INTERNAL_TOKEN");
  if (!expected) return false;
  const auth = req.headers.get("Authorization") ?? "";
  return auth === `Bearer ${expected}`;
}

// Lote chico a propósito: el cron de Fase 5 sondea cada 2 minutos, así que
// no hace falta drenar todo el outbox en una sola invocación.
const BATCH_SIZE = 5;

interface ZoomOutboxRow {
  id: number;
  occurrence_id: string;
  action: "create" | "update" | "cancel" | "enrich_agenda";
  payload: {
    topic?: string;
    agenda?: string | null;
    starts_at?: string;
    duration_minutes?: number;
    timezone?: string;
    zoom_meeting_id?: number | null;
  };
}

function toJob(row: ZoomOutboxRow): ZoomOutboxJob {
  return {
    id: row.id,
    occurrenceId: row.occurrence_id,
    action: row.action,
    payload: {
      topic: row.payload.topic,
      agenda: row.payload.agenda,
      startsAt: row.payload.starts_at,
      durationMinutes: row.payload.duration_minutes,
      timezone: row.payload.timezone,
      zoomMeetingId: row.payload.zoom_meeting_id,
    },
  };
}

Deno.serve(async (req) => {
  if (!isAuthorized(req)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: jobRows, error: dequeueError } = await supabase.rpc("dequeue_zoom_jobs", {
    p_limit: BATCH_SIZE,
  });

  if (dequeueError) {
    return new Response(JSON.stringify({ error: `dequeue: ${dequeueError.message}` }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const jobs = ((jobRows ?? []) as ZoomOutboxRow[]).map(toJob);

  // Un solo cliente (y un solo token OAuth, cacheado en su closure) para
  // todo el lote de esta invocación.
  const client = makeZoomClient({
    accountId: Deno.env.get("ZOOM_ACCOUNT_ID")!,
    clientId: Deno.env.get("ZOOM_CLIENT_ID")!,
    clientSecret: Deno.env.get("ZOOM_CLIENT_SECRET")!,
  });

  const results: Array<{ id: number; ok: boolean; error?: string }> = [];

  for (const job of jobs) {
    const outcome = await applyZoomJob(client, job);

    if (outcome.ok) {
      await supabase.rpc("complete_zoom_job", {
        p_id: job.id,
        p_success: true,
        p_zoom_meeting_id: outcome.result?.zoomMeetingId ?? null,
        p_join_url: outcome.result?.joinUrl ?? null,
        p_passcode: outcome.result?.passcode ?? null,
      });
      results.push({ id: job.id, ok: true });
    } else {
      // Si está corrida está caída de red a mitad de aplicar, esta fila
      // vuelve a 'pending' (con backoff) en complete_zoom_job — la próxima
      // invocación reintenta sin duplicar (el diff/dirty-check ya pasó al
      // encolar, no se vuelve a evaluar acá).
      await supabase.rpc("complete_zoom_job", {
        p_id: job.id,
        p_success: false,
        p_error: outcome.error,
      });
      results.push({ id: job.id, ok: false, error: outcome.error });
    }
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    headers: { "Content-Type": "application/json" },
  });
});
