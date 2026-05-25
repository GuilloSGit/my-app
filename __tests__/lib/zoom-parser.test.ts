import { describe, it, expect } from "vitest";
import { parseZoomMessage, isValidZoomMessage } from "@/lib/zoom-parser";

const SAMPLE_MESSAGE = `
Tema: Reunión General
Hora: 12 abr 2026 07:00 p. m.
ID de reunión: 893 4991 0935
Código de acceso: 001914
https://us05web.zoom.us/j/89349910935?pwd=abc123
`;

describe("parseZoomMessage", () => {
  it("extrae título del campo Tema", () => {
    const result = parseZoomMessage(SAMPLE_MESSAGE);
    expect(result?.title).toBe("Reunión General");
  });

  it("extrae link de Zoom", () => {
    const result = parseZoomMessage(SAMPLE_MESSAGE);
    expect(result?.zoomLink).toContain("zoom.us/j/89349910935");
  });

  it("extrae ID de reunión sin espacios", () => {
    const result = parseZoomMessage(SAMPLE_MESSAGE);
    expect(result?.zoomId).toBe("89349910935");
  });

  it("extrae código de acceso", () => {
    const result = parseZoomMessage(SAMPLE_MESSAGE);
    expect(result?.passcode).toBe("001914");
  });

  it("convierte hora PM correctamente", () => {
    const result = parseZoomMessage(SAMPLE_MESSAGE);
    expect(result?.date).toContain("T19:00:00");
  });

  it("convierte hora AM correctamente", () => {
    const msg = "Hora: 5 may 2026 08:30 a. m.\nhttps://zoom.us/j/123 Tema: Test";
    const result = parseZoomMessage(msg);
    expect(result?.date).toContain("T08:30:00");
  });

  it("convierte 12pm a mediodía", () => {
    const msg = "Hora: 1 jun 2026 12:00 p. m.\nhttps://zoom.us/j/999 Tema: Test";
    const result = parseZoomMessage(msg);
    expect(result?.date).toContain("T12:00:00");
  });

  it("convierte 12am a medianoche", () => {
    const msg = "Hora: 1 jun 2026 12:00 a. m.\nhttps://zoom.us/j/999 Tema: Test";
    const result = parseZoomMessage(msg);
    expect(result?.date).toContain("T00:00:00");
  });

  it("retorna null si no hay título ni link", () => {
    const result = parseZoomMessage("Texto sin datos de reunión");
    expect(result).toBeNull();
  });

  it("acepta 'Contraseña' como campo de passcode", () => {
    const msg = "Tema: Test\nhttps://zoom.us/j/123\nContraseña: mediaagua";
    const result = parseZoomMessage(msg);
    expect(result?.passcode).toBe("mediaagua");
  });

  it("acepta ID de reunión sin espacios", () => {
    const msg = "Tema: Test\nhttps://zoom.us/j/99999\nID de reunión: 99999";
    const result = parseZoomMessage(msg);
    expect(result?.zoomId).toBe("99999");
  });

  it("el offset de zona horaria es -03:00", () => {
    const result = parseZoomMessage(SAMPLE_MESSAGE);
    expect(result?.date).toContain("-03:00");
  });
});

describe("isValidZoomMessage", () => {
  it("reconoce texto con zoom.us", () => {
    expect(isValidZoomMessage("https://zoom.us/j/123")).toBe(true);
  });

  it("reconoce texto con ID de reunión", () => {
    expect(isValidZoomMessage("ID de reunión: 123 456")).toBe(true);
  });

  it("reconoce texto con Código de acceso", () => {
    expect(isValidZoomMessage("Código de acceso: abc")).toBe(true);
  });

  it("retorna false para texto sin relación con Zoom", () => {
    expect(isValidZoomMessage("Hola, ¿cómo estás?")).toBe(false);
  });
});
