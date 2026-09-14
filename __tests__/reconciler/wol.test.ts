import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseWolHtml, parseBibleReading } from "@/supabase/functions/_shared/reconciler/wol";

// Fixture real: HTML de https://wol.jw.org/es/wol/meetings/r4/lp-s/2026/38
// (fetch verificado en sesión, ver PROGRESS.md 2026-09-12).
const REAL_HTML = readFileSync(
  path.join(__dirname, "..", "fixtures", "wol-2026-38.html"),
  "utf-8",
);

// Fixtures reales: página del programa de cada reunión (item.url de arriba),
// fetch verificado en sesión 2026-09-14 — ver PROGRESS.md.
const MIDWEEK_PROGRAM_HTML = readFileSync(
  path.join(__dirname, "..", "fixtures", "wol-2026-38-midweek-program.html"),
  "utf-8",
);
const WEEKEND_PROGRAM_HTML = readFileSync(
  path.join(__dirname, "..", "fixtures", "wol-2026-38-weekend-program.html"),
  "utf-8",
);

describe("parseWolHtml — contra el DOM real de wol.jw.org", () => {
  it("extrae el item de Vida y Ministerio (midweek)", () => {
    const result = parseWolHtml(REAL_HTML);
    expect(result.midweek).toEqual({
      title: "14-20 de septiembre",
      url: "https://wol.jw.org/es/wol/d/r4/lp-s/202026253",
    });
  });

  it("extrae el item de Estudio de La Atalaya (weekend)", () => {
    const result = parseWolHtml(REAL_HTML);
    expect(result.weekend).toEqual({
      title: "El libro de Isaías nos consuela",
      url: "https://wol.jw.org/es/wol/d/r4/lp-s/2026483",
    });
  });

  it("ignora la sección 'Otras publicaciones'", () => {
    // si el parser mirara por posición en vez de por texto de h2, se
    // arriesgaría a levantar contenido de esta sección — no debe pasar.
    const result = parseWolHtml(REAL_HTML);
    expect(result.midweek?.title).not.toContain("Otras publicaciones");
    expect(result.weekend?.title).not.toContain("Otras publicaciones");
  });
});

describe("parseWolHtml — casos sintéticos", () => {
  it("devuelve null para una sección ausente (semana de asamblea/Conmemoración)", () => {
    const html = `
      <h2>Vida y Ministerio</h2>
      <ul><li><a href="/es/wol/d/r4/lp-s/1"><div class="cardLine1">Guía</div></a></li></ul>
      <h2>Otras publicaciones</h2>
      <ul><li><a href="/es/wol/d/r4/lp-s/2"><div class="cardLine1">Otra cosa</div></a></li></ul>
    `;
    const result = parseWolHtml(html);
    expect(result.midweek).not.toBeNull();
    expect(result.weekend).toBeNull();
  });

  it("usa el fallback a texto completo del link si .cardLine1 no existe", () => {
    const html = `
      <h2>Estudio de La Atalaya</h2>
      <ul><li><a href="/es/wol/d/r4/lp-s/3">Un título sin markup de card</a></li></ul>
    `;
    const result = parseWolHtml(html);
    expect(result.weekend).toEqual({
      title: "Un título sin markup de card",
      url: "https://wol.jw.org/es/wol/d/r4/lp-s/3",
    });
  });

  it("ancla por texto del h2, no por posición", () => {
    // orden invertido respecto al caso normal — igual debe matchear bien
    const html = `
      <h2>Estudio de La Atalaya</h2>
      <ul><li><a href="/x"><div class="cardLine1">Atalaya</div></a></li></ul>
      <h2>Vida y Ministerio</h2>
      <ul><li><a href="/y"><div class="cardLine1">Vida</div></a></li></ul>
    `;
    const result = parseWolHtml(html);
    expect(result.midweek?.title).toBe("Vida");
    expect(result.weekend?.title).toBe("Atalaya");
  });
});

describe("parseBibleReading — contra el DOM real de wol.jw.org", () => {
  it("extrae la cita de Lectura de la Biblia de la página del programa de entresemana", () => {
    expect(parseBibleReading(MIDWEEK_PROGRAM_HTML)).toBe("JEREMÍAS 34, 35");
  });

  it("devuelve null contra la página del programa de fin de semana (no tiene esta sección)", () => {
    expect(parseBibleReading(WEEKEND_PROGRAM_HTML)).toBeNull();
  });

  it("devuelve null si no hay ningún <header> en la página", () => {
    expect(parseBibleReading("<html><body><h2>Sin header</h2></body></html>")).toBeNull();
  });
});
