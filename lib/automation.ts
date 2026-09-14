import { supabase } from "./supabase";
import { formatMeetingDate } from "./meetings";

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

// Mensaje para compartir por WhatsApp (mismo tono que
// components/whatsapp-share.tsx, que usa el flujo manual viejo de
// `meetings`) — a diferencia de ese, acá agenda ya viene con el contenido
// real de wol.jw.org (Fase 3: "{título de la sección}\n{url}"), así que se
// suma al mensaje cuando existe en vez de perderse.
export function buildOccurrenceShareMessage(occurrence: Occurrence): string {
  const lines = [
    "¡Hola!",
    "",
    "Te comparto los datos para la reunión de la Congregación Media Agua:",
    "",
    `-> *${occurrence.topic}*`,
    `-> ${formatMeetingDate(occurrence.startsAt)}`,
  ];

  if (occurrence.agenda) {
    lines.push("", occurrence.agenda);
  }

  lines.push("");
  if (occurrence.joinUrl) lines.push(`Link: ${occurrence.joinUrl}`);
  if (occurrence.passcode) lines.push(`Contraseña: ${occurrence.passcode}`);
  lines.push("", "¡Te esperamos!");

  return lines.join("\n");
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

export const WEEKDAY_LABEL = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

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

// Dispara zoom-apply-browser (GitHub Actions) casi al instante en vez de
// esperar el backstop de reconcile cada 2 días. supabase.functions.invoke
// adjunta el JWT de la sesión activa solo; la Edge Function del otro lado
// (zoom-apply-dispatch) valida ese JWT contra ADMIN_EMAILS server-side.
export async function triggerZoomSync(): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.functions.invoke("zoom-apply-dispatch", { method: "POST" });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Editor de horario (Fase 4): preview (commit:false) y guardado
// (commit:true) de un cambio a meeting_schedules, ambos resueltos por la
// misma Edge Function (schedule-write) — el diff SIEMPRE se recalcula del
// lado del servidor, este tipo solo refleja lo que esa función devuelve.
export interface ScheduleWriteOp {
  kind: "create" | "update" | "cancel";
  occurrenceId?: string;
  zoomMeetingId?: number | null;
  topic: string;
  startsAt: string; // ISO
  previousTopic?: string;
  previousStartsAt?: string; // ISO
}

export interface ScheduleWriteInput {
  scheduleId: string;
  weekday: number;
  localTime: string; // "HH:mm"
  durationMinutes: number;
  commit: boolean;
}

export type ScheduleWriteResult =
  | { ok: true; ops: ScheduleWriteOp[]; committed: boolean; errors: string[] }
  | { ok: false; error: string };

export async function writeSchedule(input: ScheduleWriteInput): Promise<ScheduleWriteResult> {
  const { data, error } = await supabase.functions.invoke("schedule-write", { body: input });
  if (error) return { ok: false, error: error.message };

  const result = data as { ops: ScheduleWriteOp[]; committed: boolean; errors?: string[] };
  return { ok: true, ops: result.ops, committed: result.committed, errors: result.errors ?? [] };
}

// Acciones de un clic sobre una fila de la vista de mes (occurrence-action):
// Marcar Asamblea, Marcar Conmemoración, Crear igual sin contenido,
// Cancelar esta reunión, Mover a otro día. Sin preview — son acciones
// puntuales de una sola fila, el form del diálogo es la única salvaguarda.
export type OccurrenceActionKind =
  | "cancel"
  | "move"
  | "mark_assembly"
  | "mark_memorial"
  | "create_without_content";

export interface OccurrenceActionInput {
  occurrenceId: string;
  action: OccurrenceActionKind;
  reason?: string;
  date?: string; // "yyyy-MM-dd", requerido para move/mark_memorial
  time?: string; // "HH:mm", requerido para move/mark_memorial
  label?: string;
  venue?: string;
}

export async function occurrenceAction(input: OccurrenceActionInput): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.functions.invoke("occurrence-action", { body: input });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Form de excepción genérico (Fase 4, exception-create): declara una
// excepción de forma proactiva, antes de que exista una fila calculada
// por el reconciliador — a diferencia de mark_assembly/cancel en
// occurrenceAction, que solo actúan sobre una fila ya existente.
export type ExceptionKind = "assembly" | "special_event";

export interface CreateExceptionInput {
  kind: ExceptionKind;
  date?: string; // "yyyy-MM-dd", requerido para "assembly" (día de inicio si es de 3 días)
  venue?: string;
  eventDays?: string[]; // requerido para "special_event"
  suppresses?: ScheduleKind[]; // solo "special_event"
  createsZoom?: boolean; // solo "special_event"
  label?: string;
  title?: string; // solo "assembly"
  withBranchRep?: boolean; // solo "assembly"
  threeDays?: boolean; // solo "assembly" — la mayoría son de 1 día
}

export async function createException(input: CreateExceptionInput): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.functions.invoke("exception-create", { body: input });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
