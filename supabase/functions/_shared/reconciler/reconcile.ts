import { addMonths } from "date-fns";
import type { Issue, MeetingKind, Schedule, ScheduleException, WolWeekResult } from "./types.ts";
import { buildTopic } from "./topic.ts";
import { occurrenceDateForWeek } from "./occurrence-date.ts";
import { isoWeeksBetween } from "./iso-week.ts";

// Puertos inyectados: todo lo que toca la base o red vive afuera de esta
// función, para poder testear reconcileWeek/reconcileMonth con un fake en
// memoria (mismo patrón que ya usa este repo en
// __tests__/integration/meetings.integration.test.ts) sin depender de un
// Postgres real ni mockear a nivel de red.
export interface ReconcilePorts {
  getSchedule(scheduleId: string): Promise<Schedule>;
  findException(date: Date, kind: MeetingKind): Promise<ScheduleException | null>;
  getWolCached(week: string): Promise<WolWeekResult | null>;
  cancelOccurrence(scheduleId: string, date: Date, reason: string): Promise<void>;
  markBlocked(scheduleId: string, date: Date, reason: string): Promise<void>;
  upsertOccurrence(
    scheduleId: string,
    date: Date,
    fields: { topic: string; agenda: string | null },
  ): Promise<void>;
}

// Regla de seguridad que atraviesa todo el reconciliador: solo una
// excepción explícita cancela una reunión. La falta de datos nunca cancela,
// bloquea (wol_section_missing) o directamente no toca nada si es
// transitorio (wol_unreachable) — nunca se colapsan estos dos casos en el
// mismo catch, son señales distintas.
export async function reconcileWeek(
  scheduleId: string,
  week: string,
  issues: Issue[],
  ports: ReconcilePorts,
): Promise<void> {
  const schedule = await ports.getSchedule(scheduleId);
  const date = occurrenceDateForWeek(schedule, week);

  const exception = await ports.findException(date, schedule.kind);
  if (exception) {
    await ports.cancelOccurrence(scheduleId, date, `${exception.kind}:${exception.label}`);
    issues.push({
      week,
      date: date.toISOString(),
      severity: "info",
      code: "suppressed",
      message: `${exception.label}${exception.venue ? ` — ${exception.venue}` : ""}`,
    });
    return;
  }

  const wol = await ports.getWolCached(week);

  if (wol === null) {
    issues.push({
      week,
      date: date.toISOString(),
      severity: "warning",
      code: "wol_unreachable",
      message: "No se pudo consultar WOL. Reintenta en la próxima corrida.",
    });
    return; // transitorio: no toca nada
  }

  const item = wol[schedule.kind];
  if (!item) {
    await ports.markBlocked(scheduleId, date, "wol_section_missing");
    issues.push({
      week,
      date: date.toISOString(),
      severity: "blocked",
      code: "wol_section_missing",
      message:
        "Semana sin programa publicado. Puede ser Conmemoración, asamblea o acontecimiento especial. Requiere revisión.",
    });
    return; // no crea reunión vacía
  }

  await ports.upsertOccurrence(scheduleId, date, {
    topic: buildTopic(schedule.kind, date, schedule.timezone),
    agenda: `${item.title}\n${item.url}`,
  });
}

// Una transacción/llamada por semana vive del lado del puerto
// (cancelOccurrence/markBlocked/upsertOccurrence), no acá — esta función
// solo garantiza que una semana que tira error no frena a las demás: el
// mes tiene que terminar de ejecutarse siempre, salvo la semana con
// problema, que queda registrada como `week_failed`.
export async function reconcileMonth(
  scheduleId: string,
  ports: ReconcilePorts,
  options: { now?: Date } = {},
): Promise<Issue[]> {
  const issues: Issue[] = [];
  const now = options.now ?? new Date();
  const weeks = isoWeeksBetween(now, addMonths(now, 1));

  for (const week of weeks) {
    try {
      await reconcileWeek(scheduleId, week, issues, ports);
    } catch (e) {
      issues.push({
        week,
        severity: "blocked",
        code: "week_failed",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return issues;
}
