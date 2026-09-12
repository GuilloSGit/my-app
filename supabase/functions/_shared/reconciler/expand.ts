import { fromZonedTime, toZonedTime } from "date-fns-tz";
import type { DesiredOccurrence, Schedule } from "./types.ts";
import { buildTopic } from "./topic.ts";

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

// Genera las ocurrencias deseadas de un schedule entre `from` y `to`
// (inclusive), una por semana, en la zona horaria del schedule. Es un
// generador de calendario puro — no sabe nada de excepciones, pinned, ni de
// lo que ya existe en la base; eso lo filtra quien llama.
export function expand(
  schedule: Pick<Schedule, "kind" | "weekday" | "localTime" | "durationMinutes" | "timezone">,
  from: Date,
  to: Date,
): DesiredOccurrence[] {
  const results: DesiredOccurrence[] = [];

  // `toZonedTime` devuelve un Date cuyos getters LOCALES (no UTC) reflejan
  // la hora de pared en `timezone`, sin importar la zona del sistema que
  // corre esto — por eso el cursor de calendario abajo usa getFullYear/
  // getMonth/getDate/getDay normales, nunca los UTC.
  const zonedFrom = toZonedTime(from, schedule.timezone);
  const zonedTo = toZonedTime(to, schedule.timezone);

  const cursor = new Date(zonedFrom.getFullYear(), zonedFrom.getMonth(), zonedFrom.getDate());
  const endCursor = new Date(zonedTo.getFullYear(), zonedTo.getMonth(), zonedTo.getDate());

  while (cursor.getTime() <= endCursor.getTime()) {
    if (cursor.getDay() === schedule.weekday) {
      const dateStr = `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(cursor.getDate())}`;
      const startsAt = fromZonedTime(`${dateStr}T${schedule.localTime}`, schedule.timezone);

      if (startsAt.getTime() >= from.getTime() && startsAt.getTime() <= to.getTime()) {
        results.push({
          startsAt,
          durationMinutes: schedule.durationMinutes,
          topic: buildTopic(schedule.kind, startsAt, schedule.timezone),
          agenda: null,
        });
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return results;
}
