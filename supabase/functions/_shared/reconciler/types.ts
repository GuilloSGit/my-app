export type MeetingKind = "midweek" | "weekend";

export type OccurrenceStatus = "pending" | "synced" | "cancelled" | "blocked";

export type OccurrenceOrigin = "schedule" | "manual";

export type ExceptionKind = "assembly" | "special_event" | "no_meeting";

export interface Schedule {
  id: string;
  kind: MeetingKind;
  weekday: number; // 0 = domingo ... 6 = sábado, igual a Date#getDay()
  localTime: string; // "HH:mm:ss" o "HH:mm", hora de pared en `timezone`
  timezone: string;
  durationMinutes: number;
  active: boolean;
}

export interface DesiredOccurrence {
  startsAt: Date;
  durationMinutes: number;
  topic: string;
  agenda: string | null;
}

export interface Occurrence {
  id: string;
  scheduleId: string;
  startsAt: Date;
  durationMinutes: number;
  topic: string;
  agenda: string | null;
  wolWeek: string | null;
  zoomMeetingId: number | null;
  joinUrl: string | null;
  passcode: string | null;
  status: OccurrenceStatus;
  blockedReason: string | null;
  origin: OccurrenceOrigin;
  pinned: boolean;
}

export interface ScheduleException {
  id: string;
  kind: ExceptionKind;
  label: string;
  venue: string | null;
  eventDays: string[]; // "yyyy-MM-dd"
  suppresses: MeetingKind[];
  createsZoom: boolean;
  note: string | null;
}

export interface WolItem {
  title: string;
  url: string;
  edition?: string | null; // "cardLine2" de wol.jw.org, ambos kinds — ver wol.ts
  bibleReading?: string | null; // solo "midweek" — ver wol.ts
  treasuresTitle?: string | null; // solo "midweek", título real de "Tesoros de la Biblia" — ver wol.ts
  theme?: string | null; // solo "weekend", caja "TEMA" del artículo de estudio — ver wol.ts
}

export interface WolWeekResult {
  midweek: WolItem | null;
  weekend: WolItem | null;
}

export interface Issue {
  week: string;
  date?: string;
  severity: "blocked" | "warning" | "info";
  code: string;
  message: string;
}

export type ReconcileOp =
  | { kind: "create"; to: DesiredOccurrence }
  | { kind: "update"; id: string; zoomMeetingId: number | null; to: DesiredOccurrence }
  | { kind: "cancel"; id: string; zoomMeetingId: number | null };
