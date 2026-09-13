import { describe, it, expect } from "vitest";
import {
  siblingWeekDate,
  defaultAssemblyLabel,
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
