import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface ZoomOutboxRow {
  id: number;
  occurrence_id: string;
  action: "create" | "update" | "cancel";
  payload: {
    topic?: string;
    agenda?: string | null;
    starts_at?: string;
    duration_minutes?: number;
    timezone?: string;
    zoom_meeting_id?: number | null;
  };
}

export type CompleteOutcome =
  | { success: true; zoomMeetingId?: number; joinUrl?: string; passcode?: string | null }
  | { success: false; error: string };

// Mismo contrato RPC que ya usa la Edge Function `zoom-apply`
// (supabase/functions/zoom-apply) — `dequeue_zoom_jobs`/`complete_zoom_job`
// no distinguen quién las llama, solo que sea `service_role`. Este worker
// corre fuera de Supabase (necesita un navegador real para Playwright, que
// no corre en Deno/Edge Functions) pero consume el mismo outbox.
export function makeSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en el entorno");
  }
  return createClient(url, key);
}

export async function dequeueJobs(supabase: SupabaseClient, limit = 5): Promise<ZoomOutboxRow[]> {
  const { data, error } = await supabase.rpc("dequeue_zoom_jobs", { p_limit: limit });
  if (error) throw new Error(`dequeue_zoom_jobs: ${error.message}`);
  return (data ?? []) as ZoomOutboxRow[];
}

export async function completeJob(supabase: SupabaseClient, id: number, outcome: CompleteOutcome): Promise<void> {
  const { error } = await supabase.rpc("complete_zoom_job", {
    p_id: id,
    p_success: outcome.success,
    p_error: outcome.success ? null : outcome.error,
    p_zoom_meeting_id: outcome.success ? outcome.zoomMeetingId ?? null : null,
    p_join_url: outcome.success ? outcome.joinUrl ?? null : null,
    p_passcode: outcome.success ? outcome.passcode ?? null : null,
  });
  if (error) throw new Error(`complete_zoom_job: ${error.message}`);
}
