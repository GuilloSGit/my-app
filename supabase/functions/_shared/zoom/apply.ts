import type { ZoomClient, ZoomMeetingDesired, ZoomMeetingResult } from "./types.ts";

export interface ZoomOutboxJob {
  id: number;
  occurrenceId: string;
  action: "create" | "update" | "cancel";
  payload: {
    topic?: string;
    agenda?: string | null;
    startsAt?: string;
    durationMinutes?: number;
    timezone?: string;
    zoomMeetingId?: number | null;
  };
}

export type ApplyResult =
  | { ok: true; result: ZoomMeetingResult | null }
  | { ok: false; error: string };

function toDesired(job: ZoomOutboxJob): ZoomMeetingDesired {
  const { topic, startsAt, durationMinutes, timezone } = job.payload;
  if (!topic || !startsAt || !durationMinutes || !timezone) {
    throw new Error(`payload incompleto para acción '${job.action}' del job ${job.id}`);
  }
  return { topic, startsAt: new Date(startsAt), timezone, durationMinutes, agenda: job.payload.agenda ?? null };
}

// Traduce un job de zoom_outbox a la llamada correspondiente del cliente de
// Zoom. No toca la base — quien llama (zoom-apply) lee el job, invoca esto,
// y persiste el resultado con complete_zoom_job. Separado de la Edge
// Function para poder testear el dispatch con un ZoomClient fake, sin
// stubbear fetch acá (eso lo cubre client.test.ts).
export async function applyZoomJob(client: ZoomClient, job: ZoomOutboxJob): Promise<ApplyResult> {
  try {
    switch (job.action) {
      case "create": {
        const result = await client.createMeeting(toDesired(job));
        return { ok: true, result };
      }
      case "update": {
        const zoomMeetingId = job.payload.zoomMeetingId;
        if (zoomMeetingId == null) throw new Error(`update sin zoomMeetingId (job ${job.id})`);
        await client.updateMeeting(zoomMeetingId, toDesired(job));
        return { ok: true, result: null };
      }
      case "cancel": {
        const zoomMeetingId = job.payload.zoomMeetingId;
        if (zoomMeetingId == null) throw new Error(`cancel sin zoomMeetingId (job ${job.id})`);
        await client.cancelMeeting(zoomMeetingId);
        return { ok: true, result: null };
      }
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
