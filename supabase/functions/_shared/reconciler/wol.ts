import * as cheerio from "cheerio";
import type { WolItem, WolWeekResult } from "./types.ts";

const SECTION = {
  midweek: "Vida y Ministerio",
  weekend: "Estudio de La Atalaya",
} as const;

// Ancla por texto literal del h2, NUNCA por posición. Verificado contra el
// DOM real de wol.jw.org (2026-09-12, semana 2026/38): las semanas de
// asamblea o de la Conmemoración pueden reordenar u omitir secciones, y un
// índice posicional metería la publicación equivocada en la agenda sin
// fallar ruidosamente — el peor modo de falla posible acá.
export function parseWolHtml(html: string): WolWeekResult {
  const $ = cheerio.load(html);

  const pick = (label: string): WolItem | null => {
    const h = $("h2")
      .filter((_, el) => $(el).text().trim() === label)
      .first();
    if (!h.length) return null;

    const a = h.nextAll("ul").first().find("li a").first();
    if (!a.length) return null;

    const href = a.attr("href");
    if (!href) return null;

    // `.cardLine1` verificado contra el DOM real. El fallback a `a.text()`
    // queda como red de seguridad si wol.jw.org cambia el markup — funciona
    // pero devuelve el título con la referencia de publicación pegada.
    const cardLine1 = a.find(".cardLine1").first();
    const title = cardLine1.length ? cardLine1.text().trim() : a.text().trim();

    // `.cardLine2`: la edición/publicación de esa tarjeta (ej. "La Atalaya
    // (estudio) 2026 | julio", "Guía de actividades 2026 | septiembre") —
    // verificado contra el DOM real (2026-09-14, semana 2026/37). A
    // diferencia de `.cardLine1`, no hay fallback: si no está, `edition`
    // queda `null` en vez de arriesgar texto de otro elemento.
    const cardLine2 = a.find(".cardLine2").first();
    const edition = cardLine2.length ? cardLine2.text().trim() : null;

    return { title, url: new URL(href, "https://wol.jw.org").toString(), edition };
  };

  return { midweek: pick(SECTION.midweek), weekend: pick(SECTION.weekend) };
}

// El título real de la primera sección del programa de Vida y Ministerio
// ("Tesoros de la Biblia") vive en la misma página del programa
// (item.url) que ya se fetchea para `bibleReading` — sin fetch extra.
// Ancla por el texto del h2 "TESOROS DE LA BIBLIA" (mismo criterio "nunca
// por posición" que `parseWolHtml`/`parseBibleReading`, verificado contra
// el DOM real, semana 2026/38): el título específico de esa semana es el
// primer `<h3>` que aparece después, dentro de la sección — ej. "1.
// Jehová recompensa a los que siempre le obedecen". Se saca el prefijo
// numérico ("1. ") porque es solo el correlativo del punto, no parte del
// título real.
export function parseTreasuresTitle(html: string): string | null {
  const $ = cheerio.load(html);
  const heading = $("h2")
    .filter((_, el) => $(el).text().trim().toUpperCase() === "TESOROS DE LA BIBLIA")
    .first();
  if (!heading.length) return null;

  // El h2 vive en su propio div envoltorio; el h3 con el título real de
  // esa semana está dentro del div hermano siguiente (verificado contra
  // el DOM real — ver fixture wol-2026-38-midweek-program.html).
  const h3 = heading.parent().nextAll().find("h3").first();
  if (!h3.length) return null;

  const text = h3.text().trim().replace(/^\d+\.\s*/, "");
  return text || null;
}

// La caja "TEMA" del artículo de estudio de La Atalaya vive en la página
// del artículo (item.url) — hace falta un segundo fetch, igual que la
// cita bíblica de entresemana. Ancla por el `<p>` cuyo texto sea
// exactamente "TEMA" (verificado contra el DOM real que pegó el usuario,
// semana 2026/38 — mismo fixture que
// __tests__/fixtures/wol-2026-38-weekend-program.html): el resumen real es
// el texto del siguiente `<p>` hermano.
export function parseWeekendTheme(html: string): string | null {
  const $ = cheerio.load(html);
  const label = $("p")
    .filter((_, el) => $(el).text().trim().toUpperCase() === "TEMA")
    .first();
  if (!label.length) return null;

  const text = label.next("p").text().trim();
  return text || null;
}

// La cita de "Lectura de la Biblia" de Vida y Ministerio vive en la página
// del programa (item.url), no en la página índice de la semana — hace
// falta un segundo fetch. Ancla en `header h2`: verificado contra el DOM
// real (2026-09-14, semana 2026/38) que el <header> del documento
// contiene siempre exactamente dos elementos, el <h1> con la fecha y un
// único <h2> con la cita (a veces partida en más de un <a>/<strong>, ej.
// "JEREMÍAS 34," + " 35") — nunca por el id numérico ("p2"), que es
// simplemente el correlativo de párrafo de wol.jw.org y no algo que este
// documento controle. La reunión de fin de semana no tiene una cita
// equivalente (el <header> de esa página es un template totalmente
// distinto, verificado contra el DOM real de esa misma semana) — por eso
// esto solo se llama para `midweek`.
export function parseBibleReading(html: string): string | null {
  const $ = cheerio.load(html);
  const h2 = $("header h2").first();
  if (!h2.length) return null;

  //   (nbsp) aparece entre los <a> partidos de la cita en el DOM real.
  const text = h2.text().replace(/ /g, " ").replace(/\s+/g, " ").trim();
  return text || null;
}

// Un solo fetch a la página del programa cubre tanto `bibleReading` como
// `treasuresTitle` — ambos viven en el mismo HTML, ver arriba.
async function fetchMidweekExtras(url: string): Promise<{ bibleReading: string | null; treasuresTitle: string | null }> {
  try {
    const res = await fetch(url);
    if (!res.ok) return { bibleReading: null, treasuresTitle: null };
    const html = await res.text();
    return { bibleReading: parseBibleReading(html), treasuresTitle: parseTreasuresTitle(html) };
  } catch {
    return { bibleReading: null, treasuresTitle: null };
  }
}

async function fetchWeekendTheme(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return parseWeekendTheme(await res.text());
  } catch {
    return null;
  }
}

// Un solo fetch a la página índice cubre ambas reuniones porque jueves y
// sábado caen en la misma semana ISO. `null` (no `throw`) tanto para HTTP
// no-ok como para fallas de red — el llamador (reconcileWeek) trata esto
// como transitorio (`wol_unreachable`), nunca como cancelación. El
// segundo fetch (a la página del programa/artículo de cada reunión) es
// best-effort para las dos: si falla, `bibleReading`/`treasuresTitle`/
// `theme` quedan `null` y el resto de la semana se procesa igual — no
// vale la pena tratar esto como wol_unreachable cuando la página índice
// sí respondió.
export async function fetchWol(week: string): Promise<WolWeekResult | null> {
  try {
    const res = await fetch(`https://wol.jw.org/es/wol/meetings/r4/lp-s/${week}`);
    if (!res.ok) return null;
    const result = parseWolHtml(await res.text());

    if (result.midweek) {
      const { bibleReading, treasuresTitle } = await fetchMidweekExtras(result.midweek.url);
      result.midweek = { ...result.midweek, bibleReading, treasuresTitle };
    }

    if (result.weekend) {
      result.weekend = { ...result.weekend, theme: await fetchWeekendTheme(result.weekend.url) };
    }

    return result;
  } catch {
    return null;
  }
}
