export interface ZoomCredentials {
  accountId: string;
  clientId: string;
  clientSecret: string;
}

// Campos deseados para una reunión, los mismos que ya viajan como payload
// de zoom_outbox (foto del estado deseado al momento de encolar).
export interface ZoomMeetingDesired {
  topic: string;
  startsAt: Date;
  timezone: string;
  durationMinutes: number;
  agenda: string | null;
}

export interface ZoomMeetingResult {
  zoomMeetingId: number;
  joinUrl: string;
  passcode: string | null;
}

export interface ZoomClient {
  createMeeting(desired: ZoomMeetingDesired): Promise<ZoomMeetingResult>;
  // PATCH conserva join_url — nunca recrear para un cambio de horario/tema.
  updateMeeting(zoomMeetingId: number, desired: ZoomMeetingDesired): Promise<void>;
  cancelMeeting(zoomMeetingId: number): Promise<void>;
  // start_url expira en ~2hs — nunca se persiste, se pide on-demand.
  getStartUrl(zoomMeetingId: number): Promise<string>;
}
