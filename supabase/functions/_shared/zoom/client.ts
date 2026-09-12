import { formatInTimeZone } from "date-fns-tz";
import type { ZoomClient, ZoomCredentials, ZoomMeetingDesired, ZoomMeetingResult } from "./types.ts";

const TOKEN_URL = "https://zoom.us/oauth/token";
const API_BASE = "https://api.zoom.us/v2";

// Formato que Zoom espera para `start_time` cuando se manda `timezone`
// aparte: hora de pared SIN sufijo `Z` — con `Z` Zoom lo interpretaría como
// UTC e ignoraría `timezone`, corriendo la hora mostrada a los asistentes.
function zoomStartTime(startsAt: Date, timezone: string): string {
  return formatInTimeZone(startsAt, timezone, "yyyy-MM-dd'T'HH:mm:ss");
}

async function readErrorBody(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

// El caché de token vive en el closure del cliente, no a nivel de módulo:
// confirmado con un spike de Fase 2 (ver PROGRESS.md 2026-09-12) que una
// Edge Function no reutiliza estado de módulo entre invocaciones — cada
// invocación arranca un isolate nuevo, así que un caché a nivel de módulo
// nunca pega. Cachear acá adentro sí sirve: una misma invocación de
// `zoom-apply` procesa varios jobs del outbox y no necesita pedir un token
// nuevo por cada uno.
export function makeZoomClient(
  credentials: ZoomCredentials,
  fetchImpl: typeof fetch = fetch,
): ZoomClient {
  let cachedToken: { value: string; expiresAt: number } | null = null;

  async function getAccessToken(): Promise<string> {
    if (cachedToken && cachedToken.expiresAt > Date.now()) {
      return cachedToken.value;
    }

    const basic = btoa(`${credentials.clientId}:${credentials.clientSecret}`);
    const res = await fetchImpl(
      `${TOKEN_URL}?grant_type=account_credentials&account_id=${credentials.accountId}`,
      { method: "POST", headers: { Authorization: `Basic ${basic}` } },
    );

    if (!res.ok) {
      throw new Error(`zoom oauth token: ${res.status} ${await readErrorBody(res)}`);
    }

    const body = await res.json();
    // Margen de 60s para no arrancar un lote de requests con un token a
    // punto de expirar (dura 1h).
    cachedToken = { value: body.access_token, expiresAt: Date.now() + (body.expires_in - 60) * 1000 };
    return cachedToken.value;
  }

  async function zoomFetch(path: string, init: RequestInit = {}): Promise<Response> {
    const token = await getAccessToken();
    return fetchImpl(`${API_BASE}${path}`, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
  }

  return {
    async createMeeting(desired: ZoomMeetingDesired): Promise<ZoomMeetingResult> {
      const res = await zoomFetch("/users/me/meetings", {
        method: "POST",
        body: JSON.stringify({
          topic: desired.topic,
          type: 2, // ocurrencia única, NUNCA 8 (recurrente) — el link tiene que variar por reunión
          start_time: zoomStartTime(desired.startsAt, desired.timezone),
          timezone: desired.timezone,
          duration: desired.durationMinutes,
          agenda: desired.agenda ?? "",
          settings: {
            use_pmi: false, // CRÍTICO: con PMI el link se repite en todas las reuniones
            join_before_host: true,
            waiting_room: false,
            approval_type: 2,
            mute_upon_entry: true,
            participant_video: false,
          },
        }),
      });

      if (!res.ok) {
        throw new Error(`zoom createMeeting: ${res.status} ${await readErrorBody(res)}`);
      }

      const body = await res.json();
      return { zoomMeetingId: body.id, joinUrl: body.join_url, passcode: body.password ?? null };
    },

    // PATCH conserva join_url — por eso ante un cambio de horario/tema se
    // actualiza la ocurrencia en vez de recrearla.
    async updateMeeting(zoomMeetingId: number, desired: ZoomMeetingDesired): Promise<void> {
      const res = await zoomFetch(`/meetings/${zoomMeetingId}`, {
        method: "PATCH",
        body: JSON.stringify({
          topic: desired.topic,
          start_time: zoomStartTime(desired.startsAt, desired.timezone),
          timezone: desired.timezone,
          duration: desired.durationMinutes,
          agenda: desired.agenda ?? "",
        }),
      });

      if (res.status !== 204) {
        throw new Error(`zoom updateMeeting: ${res.status} ${await readErrorBody(res)}`);
      }
    },

    async cancelMeeting(zoomMeetingId: number): Promise<void> {
      const res = await zoomFetch(`/meetings/${zoomMeetingId}`, { method: "DELETE" });

      // 404 = ya no existe del lado de Zoom (borrada a mano, o un cancel
      // duplicado tras un corte de red a mitad de apply) — se trata como
      // éxito: el objetivo ("que no exista") ya se cumple, no hay nada que
      // reintentar.
      if (res.status !== 204 && res.status !== 404) {
        throw new Error(`zoom cancelMeeting: ${res.status} ${await readErrorBody(res)}`);
      }
    },

    // start_url expira en ~2hs y nunca se persiste — se pide on-demand acá.
    async getStartUrl(zoomMeetingId: number): Promise<string> {
      const res = await zoomFetch(`/meetings/${zoomMeetingId}`, { method: "GET" });

      if (!res.ok) {
        throw new Error(`zoom getStartUrl: ${res.status} ${await readErrorBody(res)}`);
      }

      const body = await res.json();
      return body.start_url;
    },
  };
}
