import { addMonths } from "date-fns";
import type { Issue, MeetingKind, Schedule, ScheduleException, WolItem, WolWeekResult } from "./types.ts";
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
  now: Date,
): Promise<void> {
  const schedule = await ports.getSchedule(scheduleId);
  const date = occurrenceDateForWeek(schedule, week);

  // La semana que contiene `now` puede tener su día de reunión ya pasado
  // (depende de qué día de esa semana caiga la corrida respecto al
  // weekday del schedule -- con un cron cada 2 días esto pasa seguido, no
  // es solo un caso de la primera corrida). Nada que reconciliar: Zoom no
  // permite agendar en el pasado, y aunque lo permitiera no tendría
  // sentido. Se corta antes de tocar excepciones/WOL a propósito, no solo
  // antes de escribir.
  if (date.getTime() < now.getTime()) {
    return;
  }

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
    agenda: buildAgenda(item),
  });
}

// Función pura: separada de reconcileWeek para poder testearla sin pasar
// por todo el fake de puertos. `edition` existe en items de ambos kinds
// (ej. "La Atalaya (estudio) 2026 | julio" en weekend, "Guía de
// actividades 2026 | septiembre" en midweek). `bibleReading` solo existe
// en items de "midweek" (ver WolItem/wol.ts) — un item de "weekend"
// simplemente nunca lo trae, así que esa rama no hace falta condicionarla
// por schedule.kind.
export function buildAgenda(item: WolItem): string {
  const lines = [item.title];
  if (item.edition) lines.push(item.edition);
  lines.push(item.url);

  const base = lines.join("\n");
  return item.bibleReading ? `${base}\n\nLectura de la Biblia: ${item.bibleReading}` : base;
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
      await reconcileWeek(scheduleId, week, issues, ports, now);
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
