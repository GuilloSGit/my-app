import { getISOWeek, getISOWeekYear } from "date-fns";
import { toZonedTime } from "date-fns-tz";

// Semana ISO de un día calendario, calculada al mediodía LOCAL para evitar
// corrimientos por huso horario en los bordes del día. `year`/`month`/`day`
// van en calendario, `month` en 1-12 (no 0-based).
export function isoWeekKeyFromCalendarDate(year: number, month: number, day: number): string {
  const noon = new Date(year, month - 1, day, 12, 0, 0);
  return `${getISOWeekYear(noon)}/${getISOWeek(noon)}`;
}

// Semana ISO de una ocurrencia real (instante UTC + timezone del schedule).
export function isoWeekKeyForInstant(at: Date, timezone: string): string {
  const zoned = toZonedTime(at, timezone);
  return isoWeekKeyFromCalendarDate(zoned.getFullYear(), zoned.getMonth() + 1, zoned.getDate());
}

// Lista de semanas ISO (sin duplicados, en orden) entre `from` y `to`
// inclusive, calculada día por día en el calendario local — el horizonte
// del reconciliador es de ~1 mes, así que iterar día a día es barato y evita
// depender de aritmética de "sumar semanas" que podría desalinearse con el
// borde real de una semana ISO.
export function isoWeeksBetween(from: Date, to: Date): string[] {
  const weeks: string[] = [];
  const seen = new Set<string>();
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 12, 0, 0);
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 12, 0, 0);

  while (cursor.getTime() <= end.getTime()) {
    const key = isoWeekKeyFromCalendarDate(cursor.getFullYear(), cursor.getMonth() + 1, cursor.getDate());
    if (!seen.has(key)) {
      seen.add(key);
      weeks.push(key);
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return weeks;
}
