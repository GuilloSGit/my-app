import type { BrowserContext } from "playwright";

// `context.storageState()` captura TODAS las cookies/localStorage del
// browser en el momento de la captura, incluidas las de rastreo de
// terceros que quedaron seteadas por scripts de marketing en zoom.com/
// zoom.us (Amazon Ads, Bing, LinkedIn, DoubleClick, StackAdapt, etc.) —
// nada de eso hace falta para reusar la sesión logueada, y sin filtrarlas
// el archivo pesa demasiado para entrar como GitHub Actions secret (límite
// 64 KB; el archivo sin filtrar puede superar los 100 KB fácil). Se
// conserva todo lo que sea *.zoom.us (incluye el vanity domain
// jworg.zoom.us, us02web.zoom.us, telemetry, etc.).
function isZoomHost(hostOrDomain: string): boolean {
  return hostOrDomain.replace(/^\./, "").endsWith("zoom.us");
}

export async function zoomOnlyStorageState(
  context: BrowserContext,
): Promise<Awaited<ReturnType<BrowserContext["storageState"]>>> {
  const full = await context.storageState();
  return {
    cookies: full.cookies.filter((c) => isZoomHost(c.domain)),
    origins: full.origins.filter((o) => {
      try {
        return isZoomHost(new URL(o.origin).hostname);
      } catch {
        return false;
      }
    }),
  };
}
