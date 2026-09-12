import "dotenv/config";
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";

// Script de un solo uso, corrido A MANO en tu máquina — NUNCA en CI. Abre un
// navegador real y visible para que te loguees vos mismo en Zoom con tus
// propias credenciales: este script nunca las ve ni las toca, solo espera a
// que termines de loguearte y guarda la sesión ya autenticada (cookies) en
// un archivo local. El worker automatizado (`apply.ts`) reutiliza esa
// sesión sin volver a loguearse — evita scriptear el login, que es lo más
// frágil contra una cuenta gestionada por una organización (riesgo de
// CAPTCHA/verificación "¿sos vos?").
//
// Repetir este paso a mano cuando la sesión guardada expire. Zoom no
// documenta cada cuánto pasa eso — lo vamos a descubrir empíricamente
// (probablemente semanas/meses). El único síntoma va a ser que `zoom:apply`
// empiece a fallar porque la sesión lo redirige a la pantalla de login.

const SESSION_DIR = path.join(__dirname, ".session");
const SESSION_FILE = path.join(SESSION_DIR, "zoom-storage-state.json");

async function main() {
  mkdirSync(SESSION_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("https://zoom.us/signin");

  console.log("\nSe abrió un navegador. Logueate ahí con la cuenta de la");
  console.log("congregación (Congregacion Media Agua), como lo harías normalmente.");
  console.log("Cuando veas tu perfil/dashboard de Zoom ya logueado, volvé a esta");
  console.log("terminal y apretá ENTER.\n");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await rl.question("Presioná ENTER cuando ya estés logueado en Zoom... ");
  rl.close();

  await context.storageState({ path: SESSION_FILE });
  console.log(`\nSesión guardada en ${SESSION_FILE}.`);
  console.log("Ese archivo NUNCA se commitea (ya está en .gitignore).");
  console.log("Para usarlo en GitHub Actions, hay que codificarlo en base64 y");
  console.log("guardarlo como secret del repo — ver ZOOM_AUTOMATION.md.");

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
