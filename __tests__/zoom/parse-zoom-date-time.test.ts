import { describe, it, expect } from "vitest";
import { parseZoomDateTime, eitherName } from "@/zoom-automation/lib/zoom-browser";

const TZ = "America/Argentina/Buenos_Aires";

describe("parseZoomDateTime", () => {
  it("parsea el formato real del form de edición: DD/MM/YYYY + HH:mm", () => {
    // Captura real 2026-09-19: fecha "19/09/2026", hora "18:00" (GMT-3).
    expect(parseZoomDateTime("19/09/2026", "18:00", TZ).toISOString()).toBe("2026-09-19T21:00:00.000Z");
  });

  it("interpreta día/mes (no mes/día) cuando ambos son <= 12", () => {
    expect(parseZoomDateTime("03/10/2026", "19:00", TZ).toISOString()).toBe("2026-10-03T22:00:00.000Z");
  });

  it("sigue aceptando el label en inglés del dropdown", () => {
    expect(parseZoomDateTime("Saturday,September 19,2026", "18:00", TZ).toISOString()).toBe(
      "2026-09-19T21:00:00.000Z",
    );
  });

  it("tira un error explícito si la hora viene vacía (regresión: innerText de un <input>)", () => {
    expect(() => parseZoomDateTime("19/09/2026", "", TZ)).toThrow(/No se pudo parsear fecha\/hora/);
  });

  it("tira un error explícito si la fecha no tiene un formato conocido", () => {
    expect(() => parseZoomDateTime("mañana", "18:00", TZ)).toThrow(/No se pudo parsear fecha\/hora/);
  });
});

describe("eitherName", () => {
  it("matchea el texto en inglés o en español", () => {
    const re = eitherName("Edit", "Editar");
    expect(re.test("Edit")).toBe(true);
    expect(re.test("Editar")).toBe(true);
    expect(re.test("Delete")).toBe(false);
  });
});
