import { describe, it, expect, vi } from "vitest";
import { makeZoomClient } from "@/supabase/functions/_shared/zoom/client";
import type { ZoomMeetingDesired } from "@/supabase/functions/_shared/zoom/types";

const CREDENTIALS = { accountId: "acc1", clientId: "id1", clientSecret: "secret1" };

const DESIRED: ZoomMeetingDesired = {
  topic: "Reunión de entresemana - Jueves 17/09",
  startsAt: new Date("2026-09-17T22:00:00.000Z"),
  timezone: "America/Argentina/San_Juan",
  durationMinutes: 90,
  agenda: "Vida y Ministerio\nhttps://wol.jw.org/x",
};

function tokenResponse(accessToken = "tok1", expiresIn = 3600) {
  return new Response(JSON.stringify({ access_token: accessToken, expires_in: expiresIn }), { status: 200 });
}

describe("makeZoomClient", () => {
  it("pide un token OAuth con Basic auth antes de crear una reunión", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 111, join_url: "https://zoom.us/j/111", password: "abc123" }), {
          status: 201,
        }),
      );

    const client = makeZoomClient(CREDENTIALS, fetchMock);
    const result = await client.createMeeting(DESIRED);

    expect(result).toEqual({ zoomMeetingId: 111, joinUrl: "https://zoom.us/j/111", passcode: "abc123" });

    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0];
    expect(String(tokenUrl)).toContain("https://zoom.us/oauth/token?grant_type=account_credentials&account_id=acc1");
    expect(tokenInit.headers.Authorization).toBe(`Basic ${btoa("id1:secret1")}`);

    const [meetingUrl, meetingInit] = fetchMock.mock.calls[1];
    expect(meetingUrl).toBe("https://api.zoom.us/v2/users/me/meetings");
    expect(meetingInit.headers.Authorization).toBe("Bearer tok1");
    const body = JSON.parse(meetingInit.body as string);
    expect(body.type).toBe(2); // NUNCA 8 (recurrente) — el link tiene que variar
    expect(body.settings.use_pmi).toBe(false); // CRÍTICO
    expect(body.start_time).toBe("2026-09-17T19:00:00"); // sin sufijo Z
    expect(body.timezone).toBe("America/Argentina/San_Juan");
  });

  it("reutiliza el token cacheado en el mismo cliente en vez de pedir uno nuevo por llamada", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const client = makeZoomClient(CREDENTIALS, fetchMock);
    await client.updateMeeting(111, DESIRED);
    await client.updateMeeting(111, DESIRED);

    // 1 fetch de token + 2 fetches de PATCH = 3, no 4 — el segundo update
    // no volvió a pedir token.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("updateMeeting manda PATCH y no falla ante un 204", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(
      new Response(null, { status: 204 }),
    );

    const client = makeZoomClient(CREDENTIALS, fetchMock);
    await expect(client.updateMeeting(111, DESIRED)).resolves.toBeUndefined();

    const [, meetingInit] = fetchMock.mock.calls[1];
    expect(meetingInit.method).toBe("PATCH");
    const body = JSON.parse(meetingInit.body as string);
    expect(body.settings).toBeUndefined(); // update no reenvía settings
  });

  it("updateMeeting lanza si Zoom responde con error", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response("meeting not found", { status: 404 }));

    const client = makeZoomClient(CREDENTIALS, fetchMock);
    await expect(client.updateMeeting(999, DESIRED)).rejects.toThrow(/404/);
  });

  it("cancelMeeting trata un 404 como éxito (ya no existe del lado de Zoom)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response(null, { status: 404 }));

    const client = makeZoomClient(CREDENTIALS, fetchMock);
    await expect(client.cancelMeeting(111)).resolves.toBeUndefined();
  });

  it("getStartUrl pide la reunión on-demand y no cachea nada", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ start_url: "https://zoom.us/s/111?zak=xyz" }), { status: 200 }));

    const client = makeZoomClient(CREDENTIALS, fetchMock);
    const url = await client.getStartUrl(111);

    expect(url).toBe("https://zoom.us/s/111?zak=xyz");
    const [meetingUrl, meetingInit] = fetchMock.mock.calls[1];
    expect(meetingUrl).toBe("https://api.zoom.us/v2/meetings/111");
    expect(meetingInit.method).toBe("GET");
  });
});
