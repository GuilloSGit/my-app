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

    return { title, url: new URL(href, "https://wol.jw.org").toString() };
  };

  return { midweek: pick(SECTION.midweek), weekend: pick(SECTION.weekend) };
}

// Un solo fetch cubre ambas reuniones porque jueves y sábado caen en la
// misma semana ISO. `null` (no `throw`) tanto para HTTP no-ok como para
// fallas de red — el llamador (reconcileWeek) trata esto como transitorio
// (`wol_unreachable`), nunca como cancelación.
export async function fetchWol(week: string): Promise<WolWeekResult | null> {
  try {
    const res = await fetch(`https://wol.jw.org/es/wol/meetings/r4/lp-s/${week}`);
    if (!res.ok) return null;
    return parseWolHtml(await res.text());
  } catch {
    return null;
  }
}
