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

// Encontrado 2026-09-14: la cuenta puede mostrar la UI en inglés o en
// español según la sesión capturada (el idioma queda pegado a la cookie/
// localStorage de quien haya logueado a mano, no al locale del runner que
// corre esto) — cualquier selector por texto fijo en un solo idioma es
// frágil a este cambio. `cancelMeeting` lo sufrió en silencio: no
// encontraba "Delete" (estaba "Eliminar"), y una salvaguarda pensada para
// "la reunión ya no existe" lo interpretó como éxito sin borrar nada — ver
// PROGRESS.md 2026-09-14 para el incidente completo. Esta función arma un
// nombre accesible que matchea cualquiera de los dos idiomas a la vez, sin
// depender de cuál esté activo en el momento.
// Sin anclar (sin ^$): mismo criterio de substring que ya usaba
// getByRole con un string plano (sin exact:true) en el resto de este
// archivo — un regex anclado rompería el único selector que ya dependía
// de substring a propósito (`/Copy Invitation/`, por si el texto real
// trae algo más pegado).
function eitherName(en: string, es: string): RegExp {
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${escape(en)}|${escape(es)}`);
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
    // "Elegir fecha" sin confirmar contra el DOM real en español todavía.
    await page.getByRole("combobox", { name: eitherName("Choose date", "Elegir fecha") }).click();

    for (let i = 0; i < 24; i++) {
      const dayButton = page.getByRole("button", { name: label });
      if (await waitVisible(dayButton, i === 0 ? 3000 : 1000)) {
        await dayButton.click();
        return;
      }
      // Flecha "mes siguiente" del datepicker. El selector anterior
      // (`.zoom-icon.zoom-inline-chevron-icon > svg > path`, de la
      // grabación de codegen) resultó ser ambiguo contra el DOM real: esa
      // misma clase la comparten los chevrons de Duration/Time Zone/etc.,
      // y `.first()` agarraba el que aparece antes en el DOM (no
      // necesariamente el del calendario) — encontrado y verificado
      // 2026-09-13 inspeccionando el DOM real de esta cuenta (ver
      // PROGRESS.md). El botón real tiene accessible name propio, sin
      // ambigüedad: `aria-label="Next month"`.
      // "Next month" confirmado contra el DOM real (2026-09-13) — el
      // aria-label de este botón puede quedar en inglés independientemente
      // del idioma visible del resto de la UI (pasó con este mismo botón
      // antes). "Mes siguiente" sumado como red de seguridad, sin confirmar.
      await page.getByRole("button", { name: eitherName("Next month", "Mes siguiente") }).click();
    }

    throw new Error(`No se encontró el día "${label}" en el datepicker tras navegar 24 meses`);
  }

  private async setStartTime(page: Page, date: Date, timezone: string): Promise<void> {
    const label = zoomTimeOptionLabel(date, timezone);
    // `fill()` + `press("Enter")` deja el valor correcto VISIBLE en el
    // input, pero no lo confirma en el estado interno de la app: apenas
    // se toca cualquier otro campo del form (ej. el combobox de
    // duración, que siempre se completa después), el input se re-renderiza
    // con el default original ("18:00", la hora actual redondeada) y el
    // "19:00" tipeado se pierde en silencio — encontrado y verificado
    // 2026-09-13 reproduciendo la secuencia completa contra la cuenta
    // real, causa de que las 10 reuniones de la primera corrida del cron
    // quedaran agendadas a las 18:00 en vez de su horario real. Clickear
    // la opción del dropdown (mismo patrón que ya usa `setDuration`) sí
    // confirma el valor — verificado que sobrevive a elegir la duración
    // después.
    // "Seleccionar hora de inicio" sin confirmar contra el DOM real todavía.
    const combobox = page.getByRole("combobox", { name: eitherName("Select start time", "Seleccionar hora de inicio") });
    await combobox.click();
    await combobox.fill(label);
    await page.getByRole("option", { name: label, exact: true }).click();
  }

  private async setDuration(page: Page, durationMinutes: number): Promise<void> {
    const hours = Math.floor(durationMinutes / 60);
    const minutes = durationMinutes % 60;

    // "seleccionar horas/minutos de duración" sin confirmar contra el DOM
    // real todavía.
    await page.getByRole("combobox", { name: eitherName("select duration hours", "seleccionar horas de duración") }).click();
    await page.getByRole("option", { name: String(hours), exact: true }).click();
    // Pausa corta: clickear el segundo combobox demasiado rápido después
    // de cerrar el primero (mismo tipo de widget) hace que el segundo click
    // no abra el dropdown todavía — confirmado reproduciendo el fallo real.
    await page.waitForTimeout(300);

    await page.getByRole("combobox", { name: eitherName("select duration minutes", "seleccionar minutos de duración") }).click();
    // Los minutos pueden mostrarse con o sin cero a la izquierda ("0"/"00")
    // según el build de la UI — probar ambos antes de fallar.
    const minuteOption = page.getByRole("option", { name: String(minutes), exact: true });
    if (await waitVisible(minuteOption, 1500)) {
      await minuteOption.click();
    } else {
      await page.getByRole("option", { name: String(minutes).padStart(2, "0"), exact: true }).click();
    }
  }

  // Campo real verificado contra el DOM (2026-09-12, sesión Playwright
  // aparte, solo inspección sin guardar): el form arranca con un botón
  // "Add Description" que revela un <textarea aria-label="Add
  // Description" id="agenda"> — no está visible de entrada. Si ya está
  // visible (ej. reunión existente que ya tiene agenda cargada), no hace
  // falta clickear el botón; si el agenda deseado es null, no se toca nada
  // (el desacople creación/contenido: crear sin agenda es válido).
  private async setAgenda(page: Page, agenda: string | null): Promise<void> {
    if (agenda === null) return;

    // "Agregar descripción" sin confirmar contra el DOM real todavía.
    const addDescriptionName = eitherName("Add Description", "Agregar descripción");
    const textarea = page.getByRole("textbox", { name: addDescriptionName });
    if (!(await waitVisible(textarea, 500))) {
      await page.getByRole("button", { name: addDescriptionName }).click();
      await textarea.waitFor({ state: "visible", timeout: 3000 });
    }
    await textarea.fill(agenda);
  }

  // Abre "Copy Invitation" en la página de detalle de una reunión ya
  // creada y devuelve join_url/passcode/meetingId parseados del texto.
  private async readInvitation(page: Page): Promise<{ joinUrl: string; passcode: string | null; meetingId: number }> {
    // "Copiar invitación"/"copiar contenido de la invitación" sin
    // confirmar contra el DOM real todavía.
    await page.getByRole("button", { name: eitherName("Copy Invitation", "Copiar invitación") }).click();
    const box = page.getByRole("textbox", { name: eitherName("copy invitation content", "copiar contenido de la invitación") });
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
      // "Programar una reunión" confirmado contra el DOM real (captura de
      // pantalla del usuario, 2026-09-14).
      await page
        .getByRole("button", { name: eitherName("Schedule a Meeting", "Programar una reunión") })
        .click({ timeout: 30_000 });

      // "Tema" sin confirmar contra el DOM real todavía.
      await page.getByRole("textbox", { name: eitherName("Topic", "Tema") }).fill(desired.topic);
      await this.setDate(page, desired.startsAt, desired.timezone);
      await this.setStartTime(page, desired.startsAt, desired.timezone);
      await this.setDuration(page, desired.durationMinutes);
      await this.setAgenda(page, desired.agenda);

      // TODO(codegen): el botón de confirmar no quedó grabado (el codegen
      // saltó directo a la URL resultante) — asumido "Save"/"Guardar" por
      // analogía con el flujo de edición, que sí lo grabó. Verificar con
      // ZOOM_HEADFUL=1 antes de confiar en el cron.
      await page.getByRole("button", { name: eitherName("Save", "Guardar") }).click();
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
  // ofrece "Edit"/"Editar" sobre una reunión existente sin tocar su link.
  async updateMeeting(zoomMeetingId: number, desired: ZoomMeetingDesired): Promise<void> {
    const page = await this.openPage();
    try {
      await page.goto(`${BASE_URL}/meeting/${zoomMeetingId}`);
      // "Editar" confirmado contra el DOM real (HTML pegado por el
      // usuario, 2026-09-14) — causa raíz de por qué esto tiraba timeout:
      // la cuenta mostraba la UI en español y este selector solo buscaba
      // "Edit".
      const editName = eitherName("Edit", "Editar");
      await page.getByRole("link", { name: editName }).click({ timeout: 30_000 });

      await page.getByRole("textbox", { name: eitherName("Topic", "Tema") }).fill(desired.topic);
      await this.setDate(page, desired.startsAt, desired.timezone);
      await this.setStartTime(page, desired.startsAt, desired.timezone);
      await this.setDuration(page, desired.durationMinutes);
      await this.setAgenda(page, desired.agenda);

      await page.getByRole("button", { name: eitherName("Save", "Guardar") }).click();
      // La URL de edición ya matchea /meeting/\d+ ANTES de guardar (no hay
      // navegación real a otra URL) — esperar por eso solo no confirma
      // nada. La señal real de que el guardado terminó y se volvió a la
      // vista de detalle es que reaparezca el link "Edit"/"Editar"
      // (confirmado reproduciendo el bug real: sin este wait, el guardado
      // se aborta a mitad de camino porque la página se cierra antes de
      // que la request termine).
      await page.getByRole("link", { name: editName }).waitFor({ state: "visible", timeout: 15_000 });
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

      // "Eliminar" confirmado contra el DOM real (HTML pegado por el
      // usuario, 2026-09-14) — causa raíz del incidente 2026-09-14: la
      // cuenta mostraba la UI en español, este selector solo buscaba
      // "Delete", nunca lo encontraba, y la salvaguarda de abajo (pensada
      // para "la reunión ya no existe") lo tomaba como éxito sin borrar
      // nada — 10 reuniones reales quedaron sin cancelar pese a que los 10
      // jobs reportaron "OK". El console.warn es nuevo: ese camino no
      // dejaba ningún rastro en los logs, así que una futura recaída
      // (con o sin relación al idioma) al menos va a quedar visible.
      const deleteName = eitherName("Delete", "Eliminar");
      const deleteButton = page.getByRole("button", { name: deleteName });
      if (!(await waitVisible(deleteButton, 5000))) {
        console.warn(
          `cancelMeeting(${zoomMeetingId}): no se encontró el botón de borrar — asumiendo que la reunión ya no existe del lado de Zoom.`,
        );
        return;
      }
      await deleteButton.click();

      // Segundo bug real, encontrado 2026-09-14 después de arreglar el
      // idioma: el diálogo de confirmación EN LA PÁGINA DE DETALLE no
      // tiene aria-label ni aria-labelledby (verificado contra el DOM
      // real que pegó el usuario — a diferencia del diálogo equivalente
      // en la lista, que sí lo tiene). `getByLabel(...)` nunca encontraba
      // nada, y el `.click()` encadenado sobre ese locator vacío no
      // tiraba la excepción esperada — el job reportaba "OK" sin haber
      // clickeado ningún botón real. Se ancla por rol "dialog" + el
      // título real, visible como texto ("Eliminar reunión"/"Delete
      // Meeting"), no por atributos de accesibilidad que este diálogo no
      // tiene.
      const confirmDialog = page.getByRole("dialog").filter({ hasText: eitherName("Delete Meeting", "Eliminar reunión") });
      await confirmDialog.getByRole("button", { name: deleteName }).click();
      // Igual que en updateMeeting: sin esperar la navegación real post-
      // borrado, cerrar la página acá aborta la request a mitad de camino
      // y la reunión queda sin borrarse pese a que el click "funcionó".
      await page.waitForURL(/#\/upcoming/, { timeout: 15_000 });

      // Verificación dura, nueva desde el incidente 2026-09-14: ya nos
      // "mintió" dos veces seguidas — primero un click sin excepción que
      // no borraba nada de verdad, después esta misma verificación dando
      // un falso positivo de éxito. La causa del segundo: acá abajo hacía
      // un `page.goto()` (recarga fría) y esperaba solo 3s — esta cuenta
      // carga un montón de scripts de terceros pesados en esa página
      // (GTM, Amplitude, widgets de monetización, chat), así que la lista
      // todavía no había terminado de pedir/renderizar sus filas dentro
      // de esos 3s, y "no lo encontré todavía" se confundió con "ya no
      // existe". Fix: no recargar en frío — después de `waitForURL` ya
      // estamos en la misma SPA con la ruta #/upcoming (navegación de
      // Vue Router, no un reload), así que se espera a que la lista
      // misma haya renderizado algo (o se confirme que está vacía) antes
      // de buscar la ausencia, con un timeout bastante más generoso.
      await page
        .locator(".fixed-time-item, .meeting-item")
        .first()
        .waitFor({ state: "visible", timeout: 15_000 })
        .catch(() => {}); // lista genuinamente vacía es un resultado válido, no un error

      const stillListed = page.locator(`a[href="/s/${zoomMeetingId}"]`);
      if (await waitVisible(stillListed, 8000)) {
        throw new Error(
          `cancelMeeting(${zoomMeetingId}): se completó el flujo de borrado sin error, pero la reunión sigue apareciendo en "Próximas".`,
        );
      }
    } catch (e) {
      await this.screenshotOnFailure(page, "cancel");
      throw e;
    } finally {
      await page.close();
    }
  }
}
