import { startOfISOWeek, endOfISOWeek } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
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

// Día de la semana (0=domingo..6=sábado, igual a Date#getDay()) de una
// fecha "yyyy-MM-dd" en calendario puro — event_days no tiene componente
// de hora ni zona horaria propia, así que no hay conversión que hacer acá
// (a diferencia de defaultAssemblyLabel/siblingWeekDate, que sí parten de
// un instante real).
export function weekdayOfDateString(dateStr: string): number {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).getDay();
}

// De una lista de event_days (el form de excepción del Acontecimiento
// especial), las que coinciden con el weekday del schedule dado —
// únicas fechas donde ese schedule podría tener de verdad una ocurrencia
// calculada —, convertidas al instante real donde esa ocurrencia
// existiría (mismo `fromZonedTime` que usa expand.ts).
export function matchingOccurrenceDates(
  eventDays: string[],
  schedule: Pick<Schedule, "weekday" | "localTime" | "timezone">,
): Date[] {
  return eventDays
    .filter((d) => weekdayOfDateString(d) === schedule.weekday)
    .map((d) => fromZonedTime(`${d}T${schedule.localTime}`, schedule.timezone));
}

// Suma días de calendario puro a una fecha "yyyy-MM-dd" (sin zona
// horaria, mismo criterio que weekdayOfDateString) — usado por el form de
// excepción de Asamblea para calcular `ends_on` a partir de `starts_on` +
// 2 cuando el admin marca "3 días" (la mayoría de las asambleas son de un
// solo día; la de 3 días es un caso aparte, una vez al año). El
// constructor de Date con año/mes/día numéricos ya hace rollover de mes/
// año correctamente (ej. 30 nov + 2 = 2 dic).
export function addCalendarDays(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const result = new Date(year, month - 1, day + days);
  return `${result.getFullYear()}-${pad(result.getMonth() + 1)}-${pad(result.getDate())}`;
}
