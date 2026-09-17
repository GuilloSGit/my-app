import "dotenv/config";
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { SESSION_FILE, BASE_URL, eitherName, waitVisible } from "./lib/zoom-browser";
import { makeSupabase } from "./lib/outbox";

// Chequeo liviano de la sesión guardada, para uso desde el botón
// "Verificar sesión de Zoom" (/dashboard/automatizacion vía
// zoom-session-check-dispatch + este workflow) — a diferencia de
// apply.ts, no toca ningún job del outbox ni crea/edita/cancela nada,
// solo navega y mira dónde aterrizó. Corre en CI vía
// .github/workflows/zoom-session-check.yml, sin schedule (a demanda).
const FAILURE_DIR = path.join(__dirname, ".session", "failures");

async function screenshotOnFailure(page: import("playwright").Page): Promise<void> {
  mkdirSync(FAILURE_DIR, { recursive: true });
  const file = path.join(FAILURE_DIR, `check-session-${Date.now()}.png`);
  try {
    await page.screenshot({ path: file, fullPage: true });
    console.error(`Screenshot guardada en ${file}`);
  } catch {
    // si ni la captura funciona, no hay más que hacer acá
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: SESSION_FILE });
  const page = await context.newPage();

  let ok = false;
  let message: string;

  try {
    await page.goto(`${BASE_URL}/meeting#/upcoming`);

    const scheduleButton = page.getByRole("button", {
      name: eitherName("Schedule a Meeting", "Programar una reunión"),
    });

    if (await waitVisible(scheduleButton, 10_000)) {
      ok = true;
      message = "Sesión activa — se pudo ver la lista de reuniones.";
    } else if (/\/signin/.test(page.url())) {
      message = "Sesión vencida — la página redirigió al login.";
      await screenshotOnFailure(page);
    } else {
      message = `Sesión posiblemente vencida — no se encontró el botón de agendar. URL final: ${page.url()}`;
      await screenshotOnFailure(page);
    }
  } catch (e) {
    message = `Error al verificar: ${e instanceof Error ? e.message : String(e)}`;
    await screenshotOnFailure(page);
  } finally {
    await browser.close();
  }

  console.log(`[check-session] ok=${ok} — ${message}`);

  const supabase = makeSupabase();
  const { error } = await supabase.from("zoom_session_checks").insert({ ok, message });
  if (error) throw new Error(`No se pudo guardar el resultado: ${error.message}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
