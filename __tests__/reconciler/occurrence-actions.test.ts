import { describe, it, expect } from "vitest";
import {
  siblingWeekDate,
  defaultAssemblyLabel,
  weekdayOfDateString,
  matchingOccurrenceDates,
  addCalendarDays,
} from "@/supabase/functions/_shared/reconciler/occurrence-actions";

const TZ = "America/Argentina/San_Juan";
const THURSDAY = { weekday: 4, localTime: "19:00:00", timezone: TZ };
const SATURDAY = { weekday: 6, localTime: "18:00:00", timezone: TZ };

describe("siblingWeekDate", () => {
  it("jueves -> sábado de la misma semana", () => {
    const thursday = new Date("2026-09-17T22:00:00.000Z");
    expect(siblingWeekDate(thursday, TZ, SATURDAY).toISOString()).toBe("2026-09-19T21:00:00.000Z");
  });

  it("sábado -> jueves de la misma semana (ida y vuelta)", () => {
    const saturday = new Date("2026-09-19T21:00:00.000Z");
    expect(siblingWeekDate(saturday, TZ, THURSDAY).toISOString()).toBe("2026-09-17T22:00:00.000Z");
  });

  it("cruza el borde de año en la semana ISO 53 de 2026", () => {
    const thursday = new Date("2026-12-31T22:00:00.000Z");
    expect(siblingWeekDate(thursday, TZ, SATURDAY).toISOString()).toBe("2027-01-02T21:00:00.000Z");
  });
});

describe("defaultAssemblyLabel", () => {
  it("arma el rango lunes-domingo de la semana ISO de la fecha dada", () => {
    const thursday = new Date("2026-09-17T22:00:00.000Z"); // semana 2026/38: lunes 14 - domingo 20
    expect(defaultAssemblyLabel(thursday, TZ)).toBe("Asamblea (semana 14/09 al 20/09)");
  });

  it("funciona igual de un sábado que cae en la misma semana", () => {
    const saturday = new Date("2026-09-19T21:00:00.000Z");
    expect(defaultAssemblyLabel(saturday, TZ)).toBe("Asamblea (semana 14/09 al 20/09)");
  });
});

describe("weekdayOfDateString", () => {
  it("calcula el día de la semana en calendario puro, sin huso horario", () => {
    expect(weekdayOfDateString("2026-09-14")).toBe(1); // lunes
    expect(weekdayOfDateString("2026-09-17")).toBe(4); // jueves
    expect(weekdayOfDateString("2026-09-19")).toBe(6); // sábado
  });
});

describe("matchingOccurrenceDates", () => {
  const eventDays = ["2026-09-14", "2026-09-17", "2026-09-19"]; // lunes, jueves, sábado

  it("se queda solo con las fechas que coinciden con el weekday del schedule", () => {
    expect(matchingOccurrenceDates(eventDays, THURSDAY).map((d) => d.toISOString())).toEqual([
      "2026-09-17T22:00:00.000Z",
    ]);
    expect(matchingOccurrenceDates(eventDays, SATURDAY).map((d) => d.toISOString())).toEqual([
      "2026-09-19T21:00:00.000Z",
    ]);
  });

  it("devuelve vacío si ninguna fecha coincide con el weekday del schedule", () => {
    expect(matchingOccurrenceDates(["2026-09-14"], THURSDAY)).toEqual([]);
  });
});

describe("addCalendarDays", () => {
  it("suma días dentro del mismo mes", () => {
    expect(addCalendarDays("2026-11-06", 2)).toBe("2026-11-08");
  });

  it("hace rollover de mes", () => {
    expect(addCalendarDays("2026-11-30", 2)).toBe("2026-12-02");
  });

  it("hace rollover de año", () => {
    expect(addCalendarDays("2026-12-31", 2)).toBe("2027-01-02");
  });

  it("con 0 días devuelve la misma fecha", () => {
    expect(addCalendarDays("2026-11-06", 0)).toBe("2026-11-06");
  });
});
