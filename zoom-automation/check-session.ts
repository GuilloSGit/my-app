import "dotenv/config";
import { chromium, type Page } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { SESSION_FILE, BASE_URL, eitherName, waitVisible } from "./lib/zoom-browser";
import { makeSupabase } from "./lib/outbox";
import { sendAlertEmail, currentRunUrl, currentRunSource } from "./lib/alert-email";

// Chequeo de la sesión guardada, para el botón "Verificar sesión" de
// /dashboard/automatizacion (zoom-session-check-dispatch + este workflow),
// para el cron de zoom-session-check.yml y a demanda. A diferencia de
// apply.ts, no toca ningún job del outbox ni crea/edita/cancela nada:
// solo navega, mira, y guarda CONSTANCIA de lo que vio.
//
// Qué cuenta como OK (2026-09-19, a pedido del usuario: el botón solo
// miraba que apareciera "Programar una reunión" y no dejaba ninguna
// prueba de que se había entrado de verdad):
//   1. el botón de agendar es visible (no estamos en /signin), Y
//   2. si la base espera reuniones futuras ya creadas en Zoom, la lista
//      "Próximas" tiene que mostrar al menos una — ver una lista vacía
//      cuando debería tener contenido es señal de sesión rota o de página
//      a medio cargar, no de "todo bien".
// Constancia: URL final, cuántas reuniones vio, cuenta leída de /profile
// (solo evidencia, NO decide el OK: selector sin verificar), link a la
// corrida de GitHub Actions y captura de pantalla SIEMPRE (no solo en
// fallas) subida como artifact por el workflow.
const EVIDENCE_DIR = path.join(__dirname, ".session", "evidence");
const ALERT_REMINDER_MS = 24 * 60 * 60 * 1000;

async function screenshot(page: Page, name: string): Promise<void> {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  try {
    await page.screenshot({ path: path.join(EVIDENCE_DIR, name), fullPage: true });
  } catch {
    // si ni la captura funciona, no hay más que hacer acá
  }
}

// Solo evidencia: el primer email que aparezca en /profile. Nunca tira.
async function readAccountLabel(page: Page): Promise<string | null> {
  try {
    await page.goto(`${BASE_URL}/profile`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000);
    const text = await page.locator("body").innerText({ timeout: 5000 });
    return text.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/)?.[0] ?? null;
  } catch {
    return null;
  }
}

async function main() {
  const supabase = makeSupabase();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: SESSION_FILE });
  const page = await context.newPage();

  let ok = false;
  let message: string;
  let meetingsSeen: number | null = null;
  let accountLabel: string | null = null;
  let finalUrl: string | null = null;

  try {
    await page.goto(`${BASE_URL}/meeting#/upcoming`);

    const scheduleButton = page.getByRole("button", {
      name: eitherName("Schedule a Meeting", "Programar una reunión"),
    });

    if (await waitVisible(scheduleButton, 15_000)) {
      // Darle tiempo a la lista a renderizar antes de contar (esta cuenta
      // carga muchos scripts de terceros — ver incidente 2026-09-14).
      await page
        .locator('a[href^="/s/"]')
        .first()
        .waitFor({ state: "visible", timeout: 10_000 })
        .catch(() => {});
      meetingsSeen = await page.locator('a[href^="/s/"]').count();
      finalUrl = page.url();
      await screenshot(page, "check-session-upcoming.png");

      const { count: expected, error: expectedError } = await supabase
        .from("meeting_occurrences")
        .select("id", { count: "exact", head: true })
        .not("zoom_meeting_id", "is", null)
        .neq("status", "cancelled")
        .gte("starts_at", new Date().toISOString());
      if (expectedError) throw new Error(`No se pudo leer meeting_occurrences: ${expectedError.message}`);

      if ((expected ?? 0) > 0 && meetingsSeen === 0) {
        message = `Sesión dudosa — la base espera ${expected} reuniones en Zoom pero la lista "Próximas" apareció vacía.`;
      } else {
        ok = true;
        message = `Sesión activa — se vieron ${meetingsSeen} reunión(es) en "Próximas" (la base espera ${expected ?? 0}).`;
      }

      accountLabel = await readAccountLabel(page);
      if (accountLabel) await screenshot(page, "check-session-profile.png");
    } else if (/\/signin/.test(page.url())) {
      finalUrl = page.url();
      message = "Sesión vencida — la página redirigió al login.";
      await screenshot(page, "check-session-failure.png");
    } else {
      finalUrl = page.url();
      message = `Sesión posiblemente vencida — no se encontró el botón de agendar. URL final: ${page.url()}`;
      await screenshot(page, "check-session-failure.png");
    }
  } catch (e) {
    message = `Error al verificar: ${e instanceof Error ? e.message : String(e)}`;
    finalUrl = finalUrl ?? page.url();
    await screenshot(page, "check-session-failure.png");
  } finally {
    await browser.close();
  }

  console.log(`[check-session] ok=${ok} meetings_seen=${meetingsSeen ?? "-"} account=${accountLabel ?? "-"} — ${message}`);

  // Leer el chequeo anterior ANTES de insertar este, para decidir si
  // avisar por email (solo en la transición a fallo, o como recordatorio
  // cada 24hs si sigue fallando — no un mail por cada corrida del cron).
  const { data: previous } = await supabase
    .from("zoom_session_checks")
    .select("ok, checked_at")
    .order("checked_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const runUrl = currentRunUrl();
  const { error } = await supabase.from("zoom_session_checks").insert({
    ok,
    message,
    final_url: finalUrl,
    meetings_seen: meetingsSeen,
    account_label: accountLabel,
    run_url: runUrl,
    source: currentRunSource(),
  });
  if (error) throw new Error(`No se pudo guardar el resultado: ${error.message}`);

  if (!ok) {
    const shouldAlert =
      !previous || previous.ok || Date.now() - new Date(previous.checked_at).getTime() > ALERT_REMINDER_MS;
    if (shouldAlert) {
      try {
        await sendAlertEmail(
          "Zoom (Media Agua): la sesión guardada falló el chequeo",
          [
            message,
            "",
            "Hay que recapturarla desde una terminal real:",
            "  npm run zoom:capture-session",
            "  npm run zoom:upload-session",
            runUrl ? `\nCorrida (con captura de pantalla): ${runUrl}` : "",
          ].join("\n"),
        );
      } catch (e) {
        console.error("[check-session] No se pudo mandar el email de aviso:", e);
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
