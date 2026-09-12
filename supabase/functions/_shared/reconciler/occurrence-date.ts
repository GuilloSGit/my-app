import { addDays, startOfISOWeek } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import type { Schedule } from "./types.ts";

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

// Inversa de expand(): dado un schedule y una semana ISO ("2026/38"),
// devuelve el instante exacto (UTC) de la ocurrencia de esa semana. El 4 de
// enero cae siempre en la semana ISO 1 de su año (definición de ISO 8601),
// así que arrancar ahí y sumar semanas completas es seguro sin depender de
// setISOWeek/setISOWeekYear.
export function occurrenceDateForWeek(
  schedule: Pick<Schedule, "weekday" | "localTime" | "timezone">,
  week: string,
): Date {
  const [yearStr, weekStr] = week.split("/");
  const year = Number(yearStr);
  const weekNum = Number(weekStr);

  const jan4 = new Date(year, 0, 4, 12, 0, 0);
  const mondayOfWeek1 = startOfISOWeek(jan4);
  const targetMonday = addDays(mondayOfWeek1, (weekNum - 1) * 7);

  // schedule.weekday: 0=domingo..6=sábado (Date#getDay()). Offset desde el
  // lunes de esa semana ISO.
  const offsetFromMonday = schedule.weekday === 0 ? 6 : schedule.weekday - 1;
  const targetDate = addDays(targetMonday, offsetFromMonday);

  const dateStr = `${targetDate.getFullYear()}-${pad(targetDate.getMonth() + 1)}-${pad(targetDate.getDate())}`;
  return fromZonedTime(`${dateStr}T${schedule.localTime}`, schedule.timezone);
}
