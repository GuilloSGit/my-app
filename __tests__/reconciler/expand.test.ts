import { describe, it, expect } from "vitest";
import { expand } from "@/supabase/functions/_shared/reconciler/expand";

const TZ = "America/Argentina/San_Juan";

// weekday: 0=domingo..6=sábado (Date#getDay())
const THURSDAY_SCHEDULE = {
  kind: "midweek" as const,
  weekday: 4,
  localTime: "19:00:00",
  durationMinutes: 90,
  timezone: TZ,
};

const SATURDAY_SCHEDULE = {
  kind: "weekend" as const,
  weekday: 6,
  localTime: "18:00:00",
  durationMinutes: 105,
  timezone: TZ,
};

describe("expand", () => {
  it("genera una ocurrencia por semana, con join_url pendiente de asignar", () => {
    // jueves 03/09, 10/09, 17/09, 24/09/2026
    const from = new Date("2026-09-01T00:00:00.000Z");
    const to = new Date("2026-09-30T00:00:00.000Z");
    const result = expand(THURSDAY_SCHEDULE, from, to);
    expect(result.map((r) => r.startsAt.toISOString())).toEqual([
      "2026-09-03T22:00:00.000Z",
      "2026-09-10T22:00:00.000Z",
      "2026-09-17T22:00:00.000Z",
      "2026-09-24T22:00:00.000Z",
    ]);
    expect(result.every((r) => r.durationMinutes === 90)).toBe(true);
  });

  it("respeta otro weekday/hora (sábado 18:00)", () => {
    const from = new Date("2026-09-01T00:00:00.000Z");
    const to = new Date("2026-09-30T00:00:00.000Z");
    const result = expand(SATURDAY_SCHEDULE, from, to);
    expect(result.map((r) => r.startsAt.toISOString())).toEqual([
      "2026-09-05T21:00:00.000Z",
      "2026-09-12T21:00:00.000Z",
      "2026-09-19T21:00:00.000Z",
      "2026-09-26T21:00:00.000Z",
    ]);
  });

  it("cruza el borde de mes sin perder ni duplicar semanas", () => {
    // jueves cerca de fin/inicio de mes: 29/01, 05/02, 2026 (2026-01-29 es jueves)
    const from = new Date("2026-01-25T00:00:00.000Z");
    const to = new Date("2026-02-10T00:00:00.000Z");
    const result = expand(THURSDAY_SCHEDULE, from, to);
    expect(result.map((r) => r.startsAt.toISOString().slice(0, 10))).toEqual([
      "2026-01-29",
      "2026-02-05",
    ]);
  });

  it("cruza el borde de año, incluida la semana ISO 53 de 2026 -> semana 1 de 2027", () => {
    const from = new Date("2026-12-15T00:00:00.000Z");
    const to = new Date("2027-01-08T00:00:00.000Z");
    const result = expand(THURSDAY_SCHEDULE, from, to);
    expect(result.map((r) => r.startsAt.toISOString().slice(0, 10))).toEqual([
      "2026-12-17",
      "2026-12-24",
      "2026-12-31",
      "2027-01-07",
    ]);
  });

  it("el topic de cada ocurrencia generada coincide con buildTopic", () => {
    const from = new Date("2026-09-01T00:00:00.000Z");
    const to = new Date("2026-09-10T00:00:00.000Z");
    const [first] = expand(THURSDAY_SCHEDULE, from, to);
    expect(first.topic).toBe("Reunión de entresemana - Jueves 03/09");
  });

  it("devuelve vacío si el rango no contiene ningún día de la semana pedida", () => {
    const from = new Date("2026-09-04T00:00:00.000Z"); // viernes
    const to = new Date("2026-09-09T00:00:00.000Z"); // miércoles siguiente
    expect(expand(THURSDAY_SCHEDULE, from, to)).toEqual([]);
  });
});
