import { describe, it, expect } from "vitest";
import {
  isoWeekKeyFromCalendarDate,
  isoWeekKeyForInstant,
  isoWeeksBetween,
} from "@/supabase/functions/_shared/reconciler/iso-week";
import { occurrenceDateForWeek } from "@/supabase/functions/_shared/reconciler/occurrence-date";

const TZ = "America/Argentina/San_Juan";

describe("isoWeekKeyFromCalendarDate", () => {
  it("calcula la semana ISO de una fecha común", () => {
    expect(isoWeekKeyFromCalendarDate(2026, 9, 14)).toBe("2026/38");
  });

  it("2026 tiene semana ISO 53 (año largo)", () => {
    expect(isoWeekKeyFromCalendarDate(2026, 12, 31)).toBe("2026/53");
  });

  it("el 1 de enero de 2027 cae en la semana ISO 1 de 2027, no en la 53 de 2026", () => {
    expect(isoWeekKeyFromCalendarDate(2027, 1, 7)).toBe("2027/1");
  });
});

describe("isoWeeksBetween", () => {
  it("cruza el borde 53/2026 -> 1/2027 sin saltos ni duplicados", () => {
    const from = new Date("2026-12-24T12:00:00.000Z");
    const to = new Date("2027-01-08T12:00:00.000Z");
    expect(isoWeeksBetween(from, to)).toEqual(["2026/52", "2026/53", "2027/1"]);
  });
});

describe("occurrenceDateForWeek", () => {
  const THURSDAY = { weekday: 4, localTime: "19:00:00", timezone: TZ };

  it("es la inversa de isoWeekKeyFromCalendarDate para una semana común", () => {
    const d = occurrenceDateForWeek(THURSDAY, "2026/38");
    expect(d.toISOString()).toBe("2026-09-17T22:00:00.000Z"); // jueves 17/09, 19:00 -03:00
  });

  it("resuelve correctamente la semana ISO 53 de 2026", () => {
    const d = occurrenceDateForWeek(THURSDAY, "2026/53");
    expect(d.toISOString().slice(0, 10)).toBe("2026-12-31");
  });

  it("resuelve correctamente la semana 1 de 2027, sin confundirla con la 53 de 2026", () => {
    const d = occurrenceDateForWeek(THURSDAY, "2027/1");
    expect(d.toISOString().slice(0, 10)).toBe("2027-01-07");
  });

  it("es consistente con isoWeekKeyForInstant (ida y vuelta)", () => {
    const d = occurrenceDateForWeek(THURSDAY, "2026/40");
    expect(isoWeekKeyForInstant(d, TZ)).toBe("2026/40");
  });
});
