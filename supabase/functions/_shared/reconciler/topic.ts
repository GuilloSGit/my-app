import { formatInTimeZone } from "date-fns-tz";
import type { MeetingKind } from "./types.ts";

const LABEL: Record<MeetingKind, string> = {
  midweek: "Reunión de entresemana",
  weekend: "Reunión de fin de semana",
};

const DOW: Record<string, string> = {
  "1": "Lunes",
  "2": "Martes",
  "3": "Miércoles",
  "4": "Jueves",
  "5": "Viernes",
  "6": "Sábado",
  "7": "Domingo",
};

// Función pura: el título es derivado de (kind, startsAt, timezone) y nunca
// editable a mano — si starts_at cambia, el título cambia solo, y el diff
// del reconciliador lo detecta como parte del mismo update.
export function buildTopic(kind: MeetingKind, startsAt: Date, timezone: string): string {
  const dia = DOW[formatInTimeZone(startsAt, timezone, "i")];
  const fecha = formatInTimeZone(startsAt, timezone, "dd/MM");
  return `${LABEL[kind]} - ${dia} ${fecha}`;
}
