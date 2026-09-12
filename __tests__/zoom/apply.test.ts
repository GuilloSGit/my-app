import { describe, it, expect, vi } from "vitest";
import { applyZoomJob } from "@/supabase/functions/_shared/zoom/apply";
import type { ZoomOutboxJob } from "@/supabase/functions/_shared/zoom/apply";
import type { ZoomClient } from "@/supabase/functions/_shared/zoom/types";

function fakeClient(overrides: Partial<ZoomClient> = {}): ZoomClient {
  return {
    createMeeting: vi.fn().mockRejectedValue(new Error("no debería llamarse")),
    updateMeeting: vi.fn().mockRejectedValue(new Error("no debería llamarse")),
    cancelMeeting: vi.fn().mockRejectedValue(new Error("no debería llamarse")),
    getStartUrl: vi.fn().mockRejectedValue(new Error("no debería llamarse")),
    ...overrides,
  };
}

const BASE_PAYLOAD = {
  topic: "Reunión de entresemana - Jueves 17/09",
  startsAt: "2026-09-17T22:00:00.000Z",
  durationMinutes: 90,
  timezone: "America/Argentina/San_Juan",
  agenda: "Vida y Ministerio\nhttps://wol.jw.org/x",
};

describe("applyZoomJob", () => {
  it("create llama a createMeeting con los campos deseados y devuelve el resultado", async () => {
    const createMeeting = vi.fn().mockResolvedValue({ zoomMeetingId: 111, joinUrl: "https://zoom.us/j/111", passcode: "abc" });
    const client = fakeClient({ createMeeting });
    const job: ZoomOutboxJob = { id: 1, occurrenceId: "o1", action: "create", payload: BASE_PAYLOAD };

    const outcome = await applyZoomJob(client, job);

    expect(outcome).toEqual({ ok: true, result: { zoomMeetingId: 111, joinUrl: "https://zoom.us/j/111", passcode: "abc" } });
    expect(createMeeting).toHaveBeenCalledWith({
      topic: BASE_PAYLOAD.topic,
      startsAt: new Date(BASE_PAYLOAD.startsAt),
      timezone: BASE_PAYLOAD.timezone,
      durationMinutes: BASE_PAYLOAD.durationMinutes,
      agenda: BASE_PAYLOAD.agenda,
    });
  });

  it("update llama a updateMeeting con el zoomMeetingId del payload", async () => {
    const updateMeeting = vi.fn().mockResolvedValue(undefined);
    const client = fakeClient({ updateMeeting });
    const job: ZoomOutboxJob = {
      id: 2,
      occurrenceId: "o1",
      action: "update",
      payload: { ...BASE_PAYLOAD, zoomMeetingId: 111 },
    };

    const outcome = await applyZoomJob(client, job);

    expect(outcome).toEqual({ ok: true, result: null });
    expect(updateMeeting).toHaveBeenCalledWith(111, expect.objectContaining({ topic: BASE_PAYLOAD.topic }));
  });

  it("update sin zoomMeetingId en el payload falla en vez de llamar a Zoom", async () => {
    const client = fakeClient();
    const job: ZoomOutboxJob = { id: 3, occurrenceId: "o1", action: "update", payload: BASE_PAYLOAD };

    const outcome = await applyZoomJob(client, job);

    expect(outcome.ok).toBe(false);
    expect(client.updateMeeting).not.toHaveBeenCalled();
  });

  it("cancel llama a cancelMeeting con el zoomMeetingId del payload", async () => {
    const cancelMeeting = vi.fn().mockResolvedValue(undefined);
    const client = fakeClient({ cancelMeeting });
    const job: ZoomOutboxJob = { id: 4, occurrenceId: "o1", action: "cancel", payload: { zoomMeetingId: 111 } };

    const outcome = await applyZoomJob(client, job);

    expect(outcome).toEqual({ ok: true, result: null });
    expect(cancelMeeting).toHaveBeenCalledWith(111);
  });

  it("enrich_agenda todavía no soportado: falla en vez de aplicarse a medias", async () => {
    const client = fakeClient();
    const job: ZoomOutboxJob = { id: 5, occurrenceId: "o1", action: "enrich_agenda", payload: {} };

    const outcome = await applyZoomJob(client, job);

    expect(outcome.ok).toBe(false);
  });

  it("un error del cliente de Zoom se devuelve como { ok: false }, no se propaga", async () => {
    const createMeeting = vi.fn().mockRejectedValue(new Error("zoom createMeeting: 429 rate limited"));
    const client = fakeClient({ createMeeting });
    const job: ZoomOutboxJob = { id: 6, occurrenceId: "o1", action: "create", payload: BASE_PAYLOAD };

    const outcome = await applyZoomJob(client, job);

    expect(outcome).toEqual({ ok: false, error: "zoom createMeeting: 429 rate limited" });
  });
});
