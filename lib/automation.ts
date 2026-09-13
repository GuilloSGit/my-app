import { supabase } from "./supabase";

export type ScheduleKind = "midweek" | "weekend";
export type OccurrenceStatus = "pending" | "synced" | "cancelled" | "blocked";
export type OccurrenceOrigin = "schedule" | "manual";

export interface Schedule {
  id: string;
  kind: ScheduleKind;
  weekday: number; // 0 = domingo, igual a Date#getDay()
  localTime: string; // "HH:mm:ss"
  timezone: string;
  durationMinutes: number;
  active: boolean;
}

export interface Occurrence {
  id: string;
  scheduleId: string;
  scheduleKind: ScheduleKind;
  startsAt: string; // ISO
  durationMinutes: number;
  topic: string;
  agenda: string | null;
  joinUrl: string | null;
  passcode: string | null;
  status: OccurrenceStatus;
  blockedReason: string | null;
  origin: OccurrenceOrigin;
  pinned: boolean;
}

export interface ReconcileRunSummary {
  scheduleId: string;
  startedAt: string;
  finishedAt: string | null;
  issuesCount: number;
}

interface ScheduleRow {
  id: string;
  kind: ScheduleKind;
  weekday: number;
  local_time: string;
  timezone: string;
  duration_minutes: number;
  active: boolean;
}

function rowToSchedule(row: ScheduleRow): Schedule {
  return {
    id: row.id,
    kind: row.kind,
    weekday: row.weekday,
    localTime: row.local_time,
    timezone: row.timezone,
    durationMinutes: row.duration_minutes,
    active: row.active,
  };
}

export async function getActiveSchedules(): Promise<Schedule[]> {
  const { data, error } = await supabase
    .from("meeting_schedules")
    .select("*")
    .eq("active", true)
    .order("kind", { ascending: true });

  if (error) throw new Error(error.message);
  return (data as ScheduleRow[]).map(rowToSchedule);
}

interface OccurrenceRow {
  id: string;
  schedule_id: string;
  starts_at: string;
  duration_minutes: number;
  topic: string;
  agenda: string | null;
  join_url: string | null;
  passcode: string | null;
  status: OccurrenceStatus;
  blocked_reason: string | null;
  origin: OccurrenceOrigin;
  pinned: boolean;
  meeting_schedules: { kind: ScheduleKind } | { kind: ScheduleKind }[] | null;
}

function rowToOccurrence(row: OccurrenceRow): Occurrence {
  // PostgREST puede devolver el embed como objeto o como array de 1 según
  // versión/config — normalizamos acá para no depender de ese detalle.
  const embedded = Array.isArray(row.meeting_schedules)
    ? row.meeting_schedules[0]
    : row.meeting_schedules;

  return {
    id: row.id,
    scheduleId: row.schedule_id,
    scheduleKind: embedded?.kind ?? "midweek",
    startsAt: row.starts_at,
    durationMinutes: row.duration_minutes,
    topic: row.topic,
    agenda: row.agenda,
    joinUrl: row.join_url,
    passcode: row.passcode,
    status: row.status,
    blockedReason: row.blocked_reason,
    origin: row.origin,
    pinned: row.pinned,
  };
}

// Horizonte de la vista de mes: coincide con el horizonte de 1 mes que ya
// usa `reconcileMonth` (ver supabase/functions/_shared/reconciler/reconcile.ts)
// — no tiene sentido mostrar más de lo que el reconciliador va a calcular.
export async function getUpcomingOccurrences(daysAhead = 35): Promise<Occurrence[]> {
  const now = new Date();
  const until = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

  const { data, error } = await supabase
    .from("meeting_occurrences")
    .select("*, meeting_schedules(kind)")
    .gte("starts_at", now.toISOString())
    .lte("starts_at", until.toISOString())
    .order("starts_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data as OccurrenceRow[]).map(rowToOccurrence);
}

interface ReconcileRunRow {
  schedule_id: string | null;
  started_at: string;
  finished_at: string | null;
  issues: unknown[] | null;
}

// Una fila por schedule con la corrida más reciente — se pide más de lo
// necesario (las últimas 20) y se filtra en JS a la primera ocurrencia de
// cada schedule_id (orden ya viene por started_at desc). El volumen de
// reconcile_runs es bajísimo (2 schedules, cada varios días), no justifica
// una función SQL de agregación para esto.
export async function getLatestReconcileRuns(): Promise<ReconcileRunSummary[]> {
  const { data, error } = await supabase
    .from("reconcile_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(20);

  if (error) throw new Error(error.message);

  const rows = data as ReconcileRunRow[];
  const seen = new Set<string>();
  const latest: ReconcileRunSummary[] = [];

  for (const row of rows) {
    if (!row.schedule_id || seen.has(row.schedule_id)) continue;
    seen.add(row.schedule_id);
    latest.push({
      scheduleId: row.schedule_id,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      issuesCount: row.issues?.length ?? 0,
    });
  }

  return latest;
}

const SCHEDULE_KIND_LABEL: Record<ScheduleKind, string> = {
  midweek: "Entresemana",
  weekend: "Fin de semana",
};

export function scheduleKindLabel(kind: ScheduleKind): string {
  return SCHEDULE_KIND_LABEL[kind];
}

const STATUS_LABEL: Record<OccurrenceStatus, string> = {
  pending: "Pendiente",
  synced: "Sincronizada",
  cancelled: "Cancelada",
  blocked: "Bloqueada",
};

export function occurrenceStatusLabel(status: OccurrenceStatus): string {
  return STATUS_LABEL[status];
}
