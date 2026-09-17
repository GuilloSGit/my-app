import "dotenv/config";
import { makeSupabase, dequeueJobs, completeJob, type ZoomOutboxRow } from "./lib/outbox";
import { ZoomBrowserClient, type ZoomMeetingDesired } from "./lib/zoom-browser";

const BATCH_SIZE = Number(process.env.ZOOM_APPLY_BATCH_SIZE ?? 5);

function toDesired(row: ZoomOutboxRow): ZoomMeetingDesired {
  const { topic, agenda, starts_at, duration_minutes, timezone } = row.payload;
  if (!topic || !starts_at || !duration_minutes || !timezone) {
    throw new Error(`payload incompleto para el job ${row.id} (acción '${row.action}')`);
  }
  return { topic, startsAt: new Date(starts_at), timezone, durationMinutes: duration_minutes, agenda: agenda ?? null };
}

// Reemplaza a la Edge Function `zoom-apply` (Fase 2, API REST — pausada):
// mismo contrato de outbox (`dequeue_zoom_jobs`/`complete_zoom_job`), pero
// corre fuera de Supabase porque necesita un navegador real. Pensado para
// correr desde un cron de GitHub Actions (ver
// .github/workflows/zoom-apply-browser.yml) reusando una sesión de Zoom ya
// logueada a mano (`capture-session.ts`).
async function main() {
  const supabase = makeSupabase();
  const jobs = await dequeueJobs(supabase, BATCH_SIZE);

  if (jobs.length === 0) {
    console.log("Sin jobs pendientes en zoom_outbox.");
    return;
  }

  console.log(`Dequeued ${jobs.length} job(s).`);

  const client = new ZoomBrowserClient();
  await client.open();

  try {
    for (const job of jobs) {
      console.log(`Job ${job.id} (${job.action}) — occurrence ${job.occurrence_id}`);
      try {
        switch (job.action) {
          case "create": {
            const result = await client.createMeeting(toDesired(job));
            await completeJob(supabase, job.id, { success: true, ...result });
            break;
          }
          case "update": {
            const zoomMeetingId = job.payload.zoom_meeting_id;
            if (zoomMeetingId == null) throw new Error(`update sin zoom_meeting_id (job ${job.id})`);
            await client.updateMeeting(zoomMeetingId, toDesired(job));
            // Sin esto, complete_zoom_job hace coalesce(null, passcode viejo)
            // y la base nunca se entera del passcode fijo que updateMeeting
            // ya dejó en Zoom — encontrado 2026-09-17 (Zoom bien, base vieja).
            await completeJob(supabase, job.id, { success: true, passcode: ZoomBrowserClient.FIXED_PASSCODE });
            break;
          }
          case "cancel": {
            const zoomMeetingId = job.payload.zoom_meeting_id;
            if (zoomMeetingId == null) throw new Error(`cancel sin zoom_meeting_id (job ${job.id})`);
            await client.cancelMeeting(zoomMeetingId);
            await completeJob(supabase, job.id, { success: true });
            break;
          }
        }
        console.log(`Job ${job.id} OK`);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error(`Job ${job.id} FALLÓ: ${message}`);
        await completeJob(supabase, job.id, { success: false, error: message });
      }
    }
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
