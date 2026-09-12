import { chromium, type Browser, type BrowserContext, type Locator, type Page } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";

export interface ZoomMeetingDesired {
  topic: string;
  startsAt: Date;
  timezone: string;
  durationMinutes: number;
  agenda: string | null;
}

export interface ZoomMeetingResult {
  zoomMeetingId: number;
  joinUrl: string;
  passcode: string | null;
}

const SESSION_FILE = path.join(__dirname, "..", ".session", "zoom-storage-state.json");
const FAILURE_DIR = path.join(__dirname, "..", ".session", "failures");

// Vanity domain real de esta cuenta (organización "Kingdom Support
// Services, Inc."), confirmado en la grabación de codegen del usuario
// 2026-09-12 — no es "zoom.us" genérico.
const BASE_URL = process.env.ZOOM_WEB_BASE_URL ?? "https://jworg.zoom.us";

// Formatea la fecha como el accessible name real del botón del datepicker
// de Zoom: "Saturday,September 19,2026" (sin espacio tras la 1ª coma, con
// espacio tras el día). Confirmado contra el DOM real en la grabación.
function zoomDateOptionLabel(date: Date, timezone: string): string {
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: timezone }).format(date);
  const month = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: timezone }).format(date);
  const day = new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone: timezone }).format(date);
  const year = new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: timezone }).format(date);
  return `${weekday},${month} ${day},${year}`;
}

// Formato real de las opciones del listado de horarios de Zoom en esta
// cuenta: 24hs con cero a la izquierda, cada 15 minutos ("17:00", "17:15",
// ...) — confirmado contra el DOM real (no es 12hs con AM/PM como se había
// asumido antes de verlo).
function zoomTimeOptionLabel(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone,
  }).formatToParts(date);
  const hour = parts.find((p) => p.type === "hour")!.value;
  const minute = parts.find((p) => p.type === "minute")!.value;
  return `${hour}:${minute}`;
}

// `locator.isVisible()` mira el estado EN ESE INSTANTE, sin esperar — en un
// SPA que anima la apertura de un dropdown/popover, eso da falsos
// negativos si se lo llama justo después de un click. Esta versión espera
// hasta `timeout` antes de concluir que no está.
async function waitVisible(locator: Locator, timeout = 3000): Promise<boolean> {
  return locator
    .waitFor({ state: "visible", timeout })
    .then(() => true)
    .catch(() => false);
}

function extractMeetingIdFromUrl(url: string): number {
  const match = url.match(/\/meeting\/(\d+)/);
  if (!match) throw new Error(`No se pudo extraer el meeting ID de la URL: ${url}`);
  return Number(match[1]);
}

// El texto de "Copy Invitation" trae todo junto:
//   Join Zoom Meeting
//   https://jworg.zoom.us/j/81954200513?pwd=...
//
//   Meeting ID: 819 5420 0513
//   Passcode: 001914
// Parsearlo de una es más robusto que leer campos sueltos de la UI (que
// cambian de layout más seguido que este texto).
function parseInvitation(text: string): { joinUrl: string; passcode: string | null; meetingId: number } {
  const joinUrlMatch = text.match(/https:\/\/[^\s]*zoom\.us\/j\/\d+[^\s]*/);
  const meetingIdMatch = text.match(/Meeting ID:\s*([\d ]+)/);
  const passcodeMatch = text.match(/Passcode:\s*(\S+)/);

  if (!joinUrlMatch) throw new Error(`No se encontró join_url en la invitación:\n${text}`);
  if (!meetingIdMatch) throw new Error(`No se encontró Meeting ID en la invitación:\n${text}`);

  return {
    joinUrl: joinUrlMatch[0],
    passcode: passcodeMatch ? passcodeMatch[1] : null,
    meetingId: Number(meetingIdMatch[1].replace(/\s/g, "")),
  };
}

// Alternativa a `_shared/zoom/client.ts` (Fase 2, API REST — pausada por
// falta de permisos de cuenta): en vez de llamar a la API de Zoom, maneja
// un navegador real contra la UI web de Zoom, reusando una sesión ya
// logueada a mano (ver `capture-session.ts`). Nunca scriptea el login.
export class ZoomBrowserClient {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  async open(): Promise<void> {
    this.browser = await chromium.launch({ headless: process.env.ZOOM_HEADFUL !== "1" });
    this.context = await this.browser.newContext({ storageState: SESSION_FILE });
  }

  async close(): Promise<void> {
    await this.context?.close();
    await this.browser?.close();
  }

  private async openPage(): Promise<Page> {
    if (!this.context) throw new Error("ZoomBrowserClient.open() no fue llamado todavía");
    return this.context.newPage();
  }

  private async screenshotOnFailure(page: Page, label: string): Promise<void> {
    mkdirSync(FAILURE_DIR, { recursive: true });
    const file = path.join(FAILURE_DIR, `${label}-${Date.now()}.png`);
    try {
      await page.screenshot({ path: file, fullPage: true });
      console.error(`Screenshot de la falla guardada en ${file}`);
    } catch {
      // si ni la captura funciona (browser ya roto), no hay más que hacer acá
    }
  }

  // Navega el date-picker hasta el mes/año deseado si no está ya visible
  // (avanza de a un mes con la flecha "siguiente"), y clickea el día. Con
  // el horizonte de 1 mes del reconciliador, casi siempre alcanza con 0-1
  // clicks de navegación — el límite de 24 es solo una salvaguarda.
  private async setDate(page: Page, date: Date, timezone: string): Promise<void> {
    const label = zoomDateOptionLabel(date, timezone);
    await page.getByRole("combobox", { name: "Choose date" }).click();

    for (let i = 0; i < 24; i++) {
      const dayButton = page.getByRole("button", { name: label });
      if (await waitVisible(dayButton, i === 0 ? 3000 : 1000)) {
        await dayButton.click();
        return;
      }
      // Flecha "mes siguiente" del datepicker — confirmado en la grabación
      // (`.zoom-icon.zoom-inline-chevron-icon`), sin accessible name propio.
      await page.locator(".zoom-icon.zoom-inline-chevron-icon > svg > path").first().click();
    }

    throw new Error(`No se encontró el día "${label}" en el datepicker tras navegar 24 meses`);
  }

  private async setStartTime(page: Page, date: Date, timezone: string): Promise<void> {
    const label = zoomTimeOptionLabel(date, timezone);
    // Es un combobox de texto libre (confirmado contra el DOM real: <input
    // type="text" role="combobox">) — escribir el valor directo es más
    // robusto que clickear una opción de una lista que puede no tener todo
    // renderizado si hay que scrollear lejos del valor por defecto.
    const combobox = page.getByRole("combobox", { name: "Select start time" });
    await combobox.click();
    await combobox.fill(label);
    await combobox.press("Enter");
  }

  private async setDuration(page: Page, durationMinutes: number): Promise<void> {
    const hours = Math.floor(durationMinutes / 60);
    const minutes = durationMinutes % 60;

    await page.getByRole("combobox", { name: "select duration hours" }).click();
    await page.getByRole("option", { name: String(hours), exact: true }).click();
    // Pausa corta: clickear el segundo combobox demasiado rápido después
    // de cerrar el primero (mismo tipo de widget) hace que el segundo click
    // no abra el dropdown todavía — confirmado reproduciendo el fallo real.
    await page.waitForTimeout(300);

    await page.getByRole("combobox", { name: "select duration minutes" }).click();
    // Los minutos pueden mostrarse con o sin cero a la izquierda ("0"/"00")
    // según el build de la UI — probar ambos antes de fallar.
    const minuteOption = page.getByRole("option", { name: String(minutes), exact: true });
    if (await waitVisible(minuteOption, 1500)) {
      await minuteOption.click();
    } else {
      await page.getByRole("option", { name: String(minutes).padStart(2, "0"), exact: true }).click();
    }
  }

  // Abre "Copy Invitation" en la página de detalle de una reunión ya
  // creada y devuelve join_url/passcode/meetingId parseados del texto.
  private async readInvitation(page: Page): Promise<{ joinUrl: string; passcode: string | null; meetingId: number }> {
    await page.getByRole("button", { name: /Copy Invitation/ }).click();
    const box = page.getByRole("textbox", { name: "copy invitation content" });
    const text = (await box.inputValue().catch(() => null)) ?? (await box.textContent()) ?? "";
    await page.keyboard.press("Escape"); // cerrar el diálogo/popover de invitación
    return parseInvitation(text);
  }

  async createMeeting(desired: ZoomMeetingDesired): Promise<ZoomMeetingResult> {
    const page = await this.openPage();
    try {
      // "networkidle" no es confiable en este SPA (websockets/telemetría
      // que nunca terminan) — se espera un elemento concreto en su lugar.
      await page.goto(`${BASE_URL}/meeting#/upcoming`);
      await page.getByRole("button", { name: "Schedule a Meeting" }).click({ timeout: 30_000 });

      await page.getByRole("textbox", { name: "Topic" }).fill(desired.topic);
      await this.setDate(page, desired.startsAt, desired.timezone);
      await this.setStartTime(page, desired.startsAt, desired.timezone);
      await this.setDuration(page, desired.durationMinutes);

      // TODO(codegen): campo de descripción/agenda no aparece en la
      // grabación (el flujo grabado no cargó agenda) — si existe un campo
      // "Description"/"Agenda" en el form, agregarlo acá. Por ahora el
      // agenda no se aplica en la creación (queda para Fase 3, wol-enrich,
      // que hace un PATCH aparte una vez que hay contenido).

      // TODO(codegen): el botón de confirmar no quedó grabado (el codegen
      // saltó directo a la URL resultante) — asumido "Save" por analogía
      // con el flujo de edición, que sí lo grabó. Verificar con
      // ZOOM_HEADFUL=1 antes de confiar en el cron.
      await page.getByRole("button", { name: "Save" }).click();
      await page.waitForURL(/\/meeting\/\d+/, { timeout: 15_000 });

      const zoomMeetingId = extractMeetingIdFromUrl(page.url());
      const { joinUrl, passcode } = await this.readInvitation(page);

      return { zoomMeetingId, joinUrl, passcode };
    } catch (e) {
      await this.screenshotOnFailure(page, "create");
      throw e;
    } finally {
      await page.close();
    }
  }

  // El PATCH de la API conserva join_url; acá el equivalente es no borrar
  // y recrear la reunión, sino editar la misma — confirmado que la UI
  // ofrece "Edit" sobre una reunión existente sin tocar su link.
  async updateMeeting(zoomMeetingId: number, desired: ZoomMeetingDesired): Promise<void> {
    const page = await this.openPage();
    try {
      await page.goto(`${BASE_URL}/meeting/${zoomMeetingId}`);
      await page.getByRole("link", { name: "Edit" }).click({ timeout: 30_000 });

      await page.getByRole("textbox", { name: "Topic" }).fill(desired.topic);
      await this.setDate(page, desired.startsAt, desired.timezone);
      await this.setStartTime(page, desired.startsAt, desired.timezone);
      await this.setDuration(page, desired.durationMinutes);

      await page.getByRole("button", { name: "Save" }).click();
      // La URL de edición ya matchea /meeting/\d+ ANTES de guardar (no hay
      // navegación real a otra URL) — esperar por eso solo no confirma
      // nada. La señal real de que el guardado terminó y se volvió a la
      // vista de detalle es que reaparezca el link "Edit" (confirmado
      // reproduciendo el bug real: sin este wait, el guardado se aborta a
      // mitad de camino porque la página se cierra antes de que la request
      // termine).
      await page.getByRole("link", { name: "Edit" }).waitFor({ state: "visible", timeout: 15_000 });
    } catch (e) {
      await this.screenshotOnFailure(page, "update");
      throw e;
    } finally {
      await page.close();
    }
  }

  async cancelMeeting(zoomMeetingId: number): Promise<void> {
    const page = await this.openPage();
    try {
      await page.goto(`${BASE_URL}/meeting/${zoomMeetingId}`);

      const deleteButton = page.getByRole("button", { name: "Delete" });
      if (!(await waitVisible(deleteButton, 5000))) {
        // Si la reunión ya no existe del lado de Zoom (borrada a mano, o un
        // cancel duplicado tras un corte de red a mitad de apply), el
        // objetivo ("que no exista") ya se cumple — no es un error.
        return;
      }
      await deleteButton.click();
      await page.getByLabel("Delete Meeting").getByRole("button", { name: "Delete" }).click();
      // Igual que en updateMeeting: sin esperar la navegación real post-
      // borrado, cerrar la página acá aborta la request a mitad de camino
      // y la reunión queda sin borrarse pese a que el click "funcionó".
      await page.waitForURL(/#\/upcoming/, { timeout: 15_000 });
    } catch (e) {
      await this.screenshotOnFailure(page, "cancel");
      throw e;
    } finally {
      await page.close();
    }
  }
}
