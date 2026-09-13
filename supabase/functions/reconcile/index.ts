import { createClient } from "@supabase/supabase-js";
import { reconcileMonth } from "../_shared/reconciler/reconcile.ts";
import { makeDbPorts, makeDryRunPorts } from "../_shared/reconciler/db-ports.ts";
import type { Schedule } from "../_shared/reconciler/types.ts";
import { dispatchZoomApplyWorkflow } from "../_shared/github/dispatch-workflow.ts";

// Función interna: la invoca el cron (Fase 5, via pg_net + Vault) o una
// herramienta admin, nunca el browser de un usuario común. El gate no es
// "¿sos admin?" (eso lo resuelven schedule-write/occurrence-action, que sí
// van a leer la sesión del usuario) — acá alcanza con "¿tenés el token
// interno de esta función?", el mismo patrón simple que ya se usó en el
// spike de Fase 0.
function isAuthorized(req: Request): boolean {
  const expected = Deno.env.get("RECONCILE_INTERNAL_TOKEN");
  if (!expected) return false;
  const auth = req.headers.get("Authorization") ?? "";
  return auth === `Bearer ${expected}`;
}

Deno.serve(async (req) => {
  if (!isAuthorized(req)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: { scheduleId?: string; dryRun?: boolean };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  if (!body.scheduleId) {
    return new Response(JSON.stringify({ error: "scheduleId es requerido" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: scheduleRow, error: scheduleError } = await supabase
    .from("meeting_schedules")
    .select("*")
    .eq("id", body.scheduleId)
    .single();

  if (scheduleError || !scheduleRow) {
    return new Response(JSON.stringify({ error: "schedule no encontrado" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const schedule: Schedule = {
    id: scheduleRow.id,
    kind: scheduleRow.kind,
    weekday: scheduleRow.weekday,
    localTime: scheduleRow.local_time,
    timezone: scheduleRow.timezone,
    durationMinutes: scheduleRow.duration_minutes,
    active: scheduleRow.active,
  };

  const realPorts = makeDbPorts(supabase, schedule);
  const isDryRun = body.dryRun === true;
  const { ports, recorded } = isDryRun
    ? makeDryRunPorts(realPorts)
    : { ports: realPorts, recorded: undefined };

  const startedAt = new Date();
  const issues = await reconcileMonth(schedule.id, ports, { now: startedAt });

  // El dry-run es un preview: no ensucia reconcile_runs (esa tabla refleja
  // corridas reales del cron/apply, no sondeos del editor de horario).
  let dispatched: { ok: boolean; error?: string } | undefined;
  if (!isDryRun) {
    await supabase.from("reconcile_runs").insert({
      schedule_id: schedule.id,
      started_at: startedAt.toISOString(),
      finished_at: new Date().toISOString(),
      issues,
    });

    // Fase 5: backstop real. Llamado directo a dispatchZoomApplyWorkflow
    // (no a la Edge Function zoom-apply-dispatch) porque esa usa
    // requireAdmin -- gate de JWT de sesión pensado para el browser de un
    // admin -- y reconcile es server-to-server, sin JWT de usuario. Un
    // fallo acá no tiene que tirar abajo la respuesta de reconcile (ya
    // escribió todo lo que tenía que escribir); el backstop de "Sincronizar
    // ahora" sigue disponible igual si esto falla.
    try {
      dispatched = await dispatchZoomApplyWorkflow({ githubPat: Deno.env.get("GITHUB_PAT")! });
    } catch (e) {
      dispatched = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  return new Response(JSON.stringify({ issues, dryRun: isDryRun, recorded, dispatched }), {
    headers: { "Content-Type": "application/json" },
  });
});
