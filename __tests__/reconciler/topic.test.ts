import { describe, it, expect } from "vitest";
import { buildTopic } from "@/supabase/functions/_shared/reconciler/topic";

const TZ = "America/Argentina/San_Juan"; // UTC-3 todo el año, sin horario de verano

describe("buildTopic", () => {
  it("arma el título de entresemana con día y fecha en la zona dada", () => {
    // 2026-09-17 19:00 local (-03:00) = 22:00 UTC, jueves
    const startsAt = new Date("2026-09-17T22:00:00.000Z");
    expect(buildTopic("midweek", startsAt, TZ)).toBe("Reunión de entresemana - Jueves 17/09");
  });

  it("arma el título de fin de semana", () => {
    // 2026-09-19 18:00 local (-03:00) = 21:00 UTC, sábado
    const startsAt = new Date("2026-09-19T21:00:00.000Z");
    expect(buildTopic("weekend", startsAt, TZ)).toBe("Reunión de fin de semana - Sábado 19/09");
  });

  it("el título cambia si cambia la fecha, para la misma kind", () => {
    const a = buildTopic("midweek", new Date("2026-09-17T22:00:00.000Z"), TZ);
    const b = buildTopic("midweek", new Date("2026-09-24T22:00:00.000Z"), TZ);
    expect(a).not.toBe(b);
  });

  it("usa el día calendario correcto en la zona horaria, no en UTC", () => {
    // 2026-01-01 02:00 UTC = 2025-12-31 23:00 local (-03:00) -> miércoles 31/12
    const startsAt = new Date("2026-01-01T02:00:00.000Z");
    expect(buildTopic("midweek", startsAt, TZ)).toBe("Reunión de entresemana - Miércoles 31/12");
  });

  it("respeta una zona horaria distinta a la de San Juan", () => {
    // mismo instante que arriba, pero en UTC: cae en el 1 de enero
    const startsAt = new Date("2026-01-01T02:00:00.000Z");
    expect(buildTopic("weekend", startsAt, "UTC")).toBe("Reunión de fin de semana - Jueves 01/01");
  });
});
