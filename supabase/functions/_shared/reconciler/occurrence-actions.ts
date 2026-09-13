import { startOfISOWeek, endOfISOWeek } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import type { Schedule } from "./types.ts";
import { occurrenceDateForWeek } from "./occurrence-date.ts";
import { isoWeekKeyForInstant } from "./iso-week.ts";

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

// Fecha del "otro" schedule (midweek/weekend) en la misma semana ISO que
// `at` — usado por "Marcar Asamblea", que por default suprime siempre
// ambas reuniones de la semana, no solo la fila desde la que se dispara.
export function siblingWeekDate(
  at: Date,
  scheduleTimezone: string,
  otherSchedule: Pick<Schedule, "weekday" | "localTime" | "timezone">,
): Date {
  const week = isoWeekKeyForInstant(at, scheduleTimezone);
  return occurrenceDateForWeek(otherSchedule, week);
}

// Label default de una excepción de Asamblea cuando no se carga lugar:
// "Asamblea (semana {lunes dd/mm} al {domingo dd/mm})". Calendario local
// en la zona del schedule, mismo truco que expand.ts (reconstruir un Date
// "de calendario" a partir de los getters zonificados) para no depender
// de la zona horaria del sistema que corre esto.
export function defaultAssemblyLabel(at: Date, timezone: string): string {
  const zoned = toZonedTime(at, timezone);
  const calendarDate = new Date(zoned.getFullYear(), zoned.getMonth(), zoned.getDate());
  const monday = startOfISOWeek(calendarDate);
  const sunday = endOfISOWeek(calendarDate);
  const fmt = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  return `Asamblea (semana ${fmt(monday)} al ${fmt(sunday)})`;
}
