# Arquitectura — my-app (Congregación Media Agua)

> Creado 2026-07-05. Describe el estado real del sistema a esa fecha, no un
> diseño aspiracional. Si algo de acá queda desactualizado, corregirlo en vez
> de dejarlo — es la referencia de "cómo funciona esto de verdad".

## Qué es

PWA para que una congregación acceda a los datos de Zoom (link, ID,
contraseña) de sus reuniones semanales, y para que un admin las cargue/edite.
Nombre npm: `zoom-links`. Sin backend propio: es una SPA estática (Next.js
`output: export`) que habla directo con Supabase.

## Stack

- **Next.js 14** (App Router), **React 18**, TypeScript estricto.
- **Tailwind CSS** + **Framer Motion** para animaciones.
- **Supabase**: Postgres (tabla `meetings`, con RLS) + Auth (magic link/OTP).
- **Vitest** (unitarios + integración + componentes con React Testing
  Library) y **Playwright** (E2E) para tests.
- Deploy estático en **GitHub Pages**, servido desde `/my-app`.

No hay servidor propio, no hay API routes de Next en uso real: toda la
lógica de datos de `meetings` vive en `lib/` hablando con el cliente de
Supabase (`@supabase/supabase-js`) desde el navegador.

**Excepción, en construcción (2026-09-12 en adelante):** la automatización
de reuniones Zoom agrega lógica de servidor real, pero no como parte de
Next.js — vive en `supabase/` (Supabase Edge Functions + Postgres, mismo
proyecto que ya usa `meetings`) **y** en `zoom-automation/` (script Node +
Playwright standalone, fuera de Next y de Deno — ver más abajo). Ver
`ZOOM_AUTOMATION.md` (spec y arquitectura completa), `ROADMAP.md` (fases) y
`PROGRESS.md` (bitácora). Esta sección de arriba sigue describiendo
correctamente el frontend estático y el flujo de `meetings` — no se
reescribe hasta que esa feature esté completa y pase a ser el sistema
autoritativo (Fase 5 del roadmap).

**Fase 4 (2026-09-13): `app/dashboard/automatizacion/page.tsx`**
(admin-only) + `lib/automation.ts` — vista de mes sobre `meeting_schedules`/
`meeting_occurrences`/`reconcile_runs`, mismo patrón de `lib/meetings.ts`
(funciones async sobre el cliente Supabase del browser). Gate de admin
nuevo (`supabase/functions/_shared/admin-auth.ts#requireAdmin`, valida el
JWT de sesión + `ADMIN_EMAILS` server-side — distinto del token interno
estático que usan `reconcile`/`zoom-apply`) habilitó las primeras dos
escrituras: botón "Sincronizar ahora" (`zoom-apply-dispatch`, dispara
`zoom-apply-browser.yml` vía la API de GitHub) y el editor de horario
(`schedule-write` + `components/schedule-editor-dialog.tsx`, día/hora/
duración con preview obligatorio antes de guardar). Ver `ZOOM_AUTOMATION.md`
sección "Interfaz" para el detalle y el resto de la estructura de carpetas
de esta feature.

**`zoom-automation/` (Fase 2-bis, 2026-09-12): la cuenta Zoom real de la
congregación resultó ser una sub-cuenta administrada por una organización
externa, sin permisos para crear apps en su Marketplace — la API REST de
Zoom (Fase 2, `supabase/functions/zoom-apply`) quedó pausada por eso.**
En su lugar, `zoom-automation/` maneja la UI web de Zoom con Playwright
(que sí funciona con el rol de esta cuenta), corriendo vía
`.github/workflows/zoom-apply-browser.yml` — **sin `schedule:` propio a
propósito** (Playwright+Chromium contra una cola vacía sería gasto de
minutos de CI), disparado por el botón "Sincronizar ahora" o por
`reconcile` al terminar (ver Fase 5 abajo). Consume el mismo
`zoom_outbox`/`dequeue_zoom_jobs`/`complete_zoom_job` que la Edge Function
pausada. Verificado de punta a punta contra la cuenta real. Detalle de los
selectores/bugs encontrados en `ZOOM_AUTOMATION.md` y `PROGRESS.md`
2026-09-12/13.

**Fase 5 (2026-09-13, cutover real 2026-09-17): el sistema es ahora el
autoritativo.** `pg_cron` dispara `reconcile` **cada 10hs** (bajado desde
"cada 2 días" el 2026-09-17, ver Gotchas — el repo es público, así que los
minutos de GitHub Actions que dispara son gratis sin límite) para cada
`meeting_schedules` activo; si la corrida no es dry-run, `reconcile`
dispara `zoom-apply-browser` fire-and-forget al terminar (mismo mecanismo
que "Sincronizar ahora", llamado directo — sin pasar por la Edge Function
gateada para JWT de browser).

**`/dashboard` (lo que usa toda la congregación) pasó a leer
`meeting_occurrences`/`lib/automation.ts` en vez de la tabla vieja
`meetings`** (2026-09-17) — `components/occurrence-meeting-card.tsx` (solo
lectura, reusa `OccurrenceWhatsAppShare`) reemplaza a `MeetingCard` en esa
página, filtrando a `status==='synced'` con el mismo margen de 2h
post-inicio que ya usaba `getUpcomingMeetings`. Los botones de admin del
flujo manual (Nueva Reunión/Importar CSV/Pegar desde Zoom) se sacaron de
`/dashboard` — la gestión de admin es 100% `/dashboard/automatizacion`
desde ahora. `lib/meetings.ts`/`lib/zoom-parser.ts`/
`components/{meeting-form,csv-import,zoom-import-dialog}.tsx` **no se
borraron** (fallback documentado, ver ROADMAP.md), pero ya no están
enganchados a ninguna UI — no asumir que siguen siendo el camino real para
nada nuevo.

## Estructura de carpetas

```
app/
  page.tsx            Landing pública (sin auth)
  layout.tsx           Root layout: fuentes, metadata/OG, manifest, ThemeProvider
  login/page.tsx       Login por magic link
  dashboard/page.tsx   Dashboard de reuniones (requiere sesión, AuthGuard)
  dashboard/automatizacion/page.tsx   Vista de mes de la automatización de
                        Zoom (admin-only, ver más abajo y ZOOM_AUTOMATION.md)

components/
  auth-guard.tsx        Redirige a /login si no hay sesión
  navbar.tsx             Nav + logout + theme toggle
  theme-provider.tsx     Wrapper de next-themes (attribute="class", defaultTheme="system")
  theme-toggle.tsx       Botón light/dark (usa resolvedTheme, no theme — ver Gotchas)
  occurrence-meeting-card.tsx  Card de solo lectura para /dashboard (meeting_occurrences,
                        reusa OccurrenceWhatsAppShare) — reemplaza a MeetingCard ahí
  meeting-card.tsx       Card del flujo manual viejo: expand, editar, eliminar, compartir
                        (sin uso real desde 2026-09-17, fallback — ver ROADMAP.md)
  meeting-form.tsx       Form de alta/edición del flujo manual (fallback, sin uso real)
  whatsapp-share.tsx     Compartir por WhatsApp del flujo manual (fallback, sin uso real)
  occurrence-whatsapp-share.tsx  Compartir por WhatsApp real (buildOccurrenceShareMessage,
                        agenda de WOL sin URLs) — usado en /dashboard y /dashboard/automatizacion
  csv-import.tsx         Alta masiva de reuniones desde CSV (fallback, sin uso real)
  zoom-import-dialog.tsx Pegar una invitación de Zoom y parsearla (fallback, sin uso real)
  service-worker-register.tsx  Registra el SW solo en prod, lo desregistra en dev
  copy-button.tsx, tooltip.tsx, calendar-logo.tsx, contact-buttons.tsx  UI de soporte

lib/
  supabase.ts            Cliente Supabase (con seam para E2E, ver Testing)
  auth.ts                Hook useAuth: sesión + sendMagicLink + logout
  admin.ts                isAdmin(user) contra NEXT_PUBLIC_ADMIN_EMAIL
  authorized-emails.ts    isAuthorizedEmail(email) contra NEXT_PUBLIC_AUTHORIZED_EMAILS
  meetings.ts             CRUD de reuniones sobre la tabla vieja `meetings` (fallback,
                          sin uso real desde 2026-09-17) + formatMeetingDate/Time,
                          reusado por el sistema real (buildOccurrenceShareMessage, etc.)
  zoom-parser.ts          Parsea el texto de invitación de Zoom (fallback, sin uso real)
  automation.ts           Fuente real de /dashboard y /dashboard/automatizacion —
                          meeting_schedules/meeting_occurrences/reconcile_runs/
                          zoom_session_checks, buildOccurrenceShareMessage (WhatsApp
                          con agenda real de WOL, sin URLs), triggerZoomSync,
                          triggerZoomSessionCheck, writeSchedule, occurrenceAction, etc.

__tests__/                Vitest: unit, integration, components (RTL)
e2e/                       Playwright: specs + helpers/mock-supabase.ts
.github/workflows/deploy.yml   CI: test → build → deploy

supabase/functions/        Edge Functions (Deno) de la automatización de Zoom
  reconcile                 Cron (pg_cron, cada 10hs): escanea 1 mes, trae
                             contenido real de WOL, encola zoom_outbox, dispara
                             zoom-apply-browser al terminar
  zoom-apply                Cliente Zoom vía API REST (Fase 2, dormido — ver
                             ARCHITECTURE.md arriba y ZOOM_AUTOMATION.md)
  zoom-apply-dispatch        Dispara zoom-apply-browser.yml vía API de GitHub
                             (botón "Sincronizar ahora", gate requireAdmin)
  zoom-session-check-dispatch  Dispara zoom-session-check.yml vía API de GitHub
                             (botón "Verificar sesión de Zoom", gate requireAdmin)
  exception-create, occurrence-action, schedule-write   Escrituras del admin
                             (gate requireAdmin), UI en components/*-dialog.tsx.
                             **schedule-write NO trae contenido de WOL** — una
                             ocurrencia nueva creada desde el editor de horario
                             queda con `agenda: null` hasta que `reconcile`
                             vuelva a correr sobre esa semana (máx. 10hs).
  _shared/reconciler/        Lógica pura: expand, diff, parser WOL (wol.ts,
                             incluye parseTreasuresTitle/parseWeekendTheme),
                             buildAgenda (por kind, sin URLs), topic
  _shared/zoom/               Cliente Zoom (Fase 2, dormido)
  _shared/admin-auth.ts        requireAdmin(jwt) — valida sesión + ADMIN_EMAILS
  _shared/github/dispatch-workflow.ts   dispatchWorkflow(config, workflowFile)
                             genérico — dispatchZoomApplyWorkflow es un wrapper
                             de compatibilidad sobre él

zoom-automation/            Script standalone (Node + Playwright, fuera de
                             Next/Deno) que reemplaza a zoom-apply (Fase 2-bis)
  capture-session.ts          Captura de sesión a mano (nunca en CI)
  upload-session.ts            Sube la sesión recapturada a los 13 secrets de
                               GitHub (`npm run zoom:upload-session`) — evita
                               repetir a mano el base64+split+gh secret set
  apply.ts                    Loop dequeue → ZoomBrowserClient → complete
                               (el 'update' pasa el passcode fijo a completeJob,
                               si no la base nunca se entera del valor real)
  check-session.ts             Chequeo liviano (sin tocar el outbox): navega y
                               guarda el resultado en zoom_session_checks
  debug-cancel.ts, debug-cancel-batch.ts   Herramientas de diagnóstico/limpieza
                               puntual contra la cuenta real (cancelar una o
                               varias reuniones a mano), guardadas a propósito
  lib/zoom-browser.ts          ZoomBrowserClient: create/update/cancelMeeting.
                               Fuerza el mismo passcode fijo (FIXED_PASSCODE)
                               en toda reunión — ver Gotchas
  lib/outbox.ts                Mismo contrato RPC que usa zoom-apply
.github/workflows/zoom-apply-browser.yml   Sin schedule: propio a propósito,
                             solo workflow_dispatch (ver Fase 5 arriba)
.github/workflows/zoom-session-check.yml   Ídem, para el chequeo de sesión
```

## Modelo de datos

Tabla `meetings` en Supabase (Postgres), una fila por reunión:

```ts
interface Meeting {
  id: string;
  date: string;      // ISO
  title: string;
  zoomLink: string;  // columna zoom_link
  zoomId: string;    // columna zoom_id
  passcode: string;
}
```

`lib/meetings.ts` traduce entre el shape de la app (camelCase) y las columnas
de Postgres (snake_case). Las reuniones pasadas se limpian solas
(`cleanPastMeetings`, corte de 2 horas después del inicio — así una reunión
sigue visible un rato después de empezar).

## Autenticación y autorización

- **Login**: magic link/OTP de Supabase Auth (`lib/auth.ts` →
  `supabase.auth.signInWithOtp`). No hay contraseñas.
- **Allowlist de acceso**: `isAuthorizedEmail()` (`lib/authorized-emails.ts`)
  contra `NEXT_PUBLIC_AUTHORIZED_EMAILS` — se chequea **antes** de llamar a
  Supabase, así un email no autorizado nunca dispara un envío real ni expone
  nada del backend (el mensaje de error es genérico a propósito).
- **Rol admin**: `isAdmin()` (`lib/admin.ts`) contra `NEXT_PUBLIC_ADMIN_EMAIL`
  — determina si se ven las acciones de alta/edición/borrado en el dashboard.
- **Seguridad real de los datos**: no es el allowlist de arriba (eso es solo
  UX/gate de la UI) — son las **RLS policies de Postgres en Supabase**, que
  bloquean el acceso a `meetings` sin una sesión JWT válida, sin importar
  qué llame a la API.
- `AuthGuard` (`components/auth-guard.tsx`) redirige a `/login` si no hay
  sesión; se usa envolviendo `DashboardPage`.

## CI/CD

```
push a master/main
  → job "test"   (Vitest + Playwright — ver Testing)
  → job "build"  (next build, needs: test)
  → job "deploy" (actions/deploy-pages, needs: build)
```

Si `test` falla, no se llega a `build` ni a `deploy` — el pipeline no publica
código que no pasó la suite. Detalle completo en `GITHUB_PAGES.md`.

## Testing

Tres capas (detalle de cómo correrlas/agregar tests nuevos en el `README.md`,
sección `## Tests`):

1. **Unit/integración** (Vitest, mock de Supabase a nivel de módulo
   `vi.mock("@/lib/supabase")`) — funciones puras y CRUD.
2. **Componentes** (Vitest + React Testing Library) — clicks reales sobre
   `LoginPage`/`DashboardPage`, mismo mock de módulo.
3. **E2E** (Playwright, navegador real) — mismos flujos, pero mockeando
   Supabase en el **boundary del cliente**, no el módulo: `lib/supabase.ts`
   expone un seam,

   ```ts
   export const supabase =
     (typeof window !== "undefined" && (window as any).__E2E_SUPABASE__) ||
     createClient(supabaseUrl, supabaseAnonKey);
   ```

   y `e2e/helpers/mock-supabase.ts` inyecta un cliente falso ahí vía
   `page.addInitScript` antes de cualquier navegación. Ningún test E2E toca
   el Supabase real ni manda magic links de verdad — y aunque algo se
   escapara del mock, `playwright.config.ts` le pasa al dev server URLs de
   Supabase placeholder inválidas (`*.invalid`) a propósito, para que
   cualquier llamada real falle ruidosamente en vez de pegarle a producción.

## Gotchas conocidos

- **Vitest 4 requiere Node ≥20.** El workflow de CI está en Node 22 en los
  tres jobs (subido desde 20 en 2026-09-13) — no bajarlo de 20, rompe con
  un `SyntaxError` sobre `node:util`'s `styleText`.
- **Supabase free tier se pausa solo** tras ~7 días de inactividad (dominio
  `*.supabase.co` da NXDOMAIN). Si el login falla con "Failed to fetch",
  chequear primero el estado del proyecto en supabase.com/dashboard antes de
  sospechar del código.
- **`theme-toggle.tsx` usa `resolvedTheme`, no `theme`.** `next-themes` con
  `defaultTheme="system"` deja `theme==="system"` hasta que el usuario elige
  explícitamente — comparar contra `theme` hace que el primer click ignore el
  modo realmente aplicado. Cualquier componente nuevo que necesite saber
  "¿estoy en dark ahora?" debe usar `resolvedTheme`.
- **`public/site.webmanifest` no se usa.** Es un artefacto abandonado; el
  manifest real es `public/manifest.json` (ver `ICONS_README.md`).
- Los `<label>` de `MeetingForm` no usan `htmlFor`/`id` — los tests
  (RTL/Playwright) ubican los inputs por `placeholder`, no por label.
- **La fuente de GitHub Pages tiene que ser `"workflow"`, no `"legacy"`.**
  Si alguna vez `gh api repos/GuilloSGit/my-app/pages -q '{build_type}'`
  devuelve `"legacy"`, GitHub publica el sitio con su propio Jekyll automático
  (renderiza `README.md` como home) en paralelo a nuestro workflow, y rutas
  como `/login`/`/dashboard` dan 404 aunque el deploy nuestro haya sido
  exitoso. Pasó el 2026-07-05 — fix y detalle en `GITHUB_PAGES.md`.
- **`public/sw.js` es network-first**, no cache-first (se cambió el
  2026-07-05, antes cacheaba todo para siempre bajo un `CACHE_NAME` fijo). Si
  un fix no se refleja en el navegador aunque el deploy haya dado verde,
  sospechar primero del Service Worker (probar en incógnito) antes que del
  código o del deploy.
- **El header de `MeetingCard` es clickeable** (togglea expand/collapse).
  Cualquier botón/link dentro de ese header (quick actions) necesita
  `e.stopPropagation()` en su `onClick`, o el click también dispara el
  toggle del header como efecto colateral — pasó con el botón de WhatsApp
  compacto, que sin `stopPropagation` parecía "abrir edición" en vez de
  solo compartir.
- **Al limpiar "Variables" tras mover algo a "Secrets", cuidado con nombres
  parecidos.** El 2026-09-12, al mover `SUPABASE_URL` (nueva, para
  `zoom-automation/`) de Variables a Secrets, se borró por error también
  `NEXT_PUBLIC_SUPABASE_URL` (la que sí necesita el build de producción,
  usada en `.github/workflows/deploy.yml` vía `${{ vars.NEXT_PUBLIC_SUPABASE_URL }}`)
  — nombres parecidos, variable equivocada borrada. El deploy siguiente
  falló en el build con `Error: supabaseUrl is required.` al prerenderizar
  `/`, `/login` y `/dashboard`. Fix: recrear la Variable
  (`gh variable set NEXT_PUBLIC_SUPABASE_URL --body "..."`, valor en
  `.env` local) y re-correr el workflow (`gh workflow run deploy.yml`).
  **Después de tocar Variables/Secrets por cualquier motivo, correr
  `gh variable list` y comparar contra lo esperado antes de asumir que
  solo se tocó lo que se quería.**
- **"Variables" y "Secrets" de GitHub Actions no son lo mismo.** En
  Settings → Secrets and variables → Actions hay dos pestañas separadas:
  "Variables" guarda texto plano sin cifrar (siempre visible en esa
  pantalla) y "Secrets" cifra el valor (no se vuelve a mostrar). Pasó el
  2026-09-12: `SUPABASE_SERVICE_ROLE_KEY` se cargó por error en
  "Variables" y quedó legible hasta que se movió a "Secrets". Cualquier
  valor sensible (`service_role`, tokens, sesiones) va siempre en
  "Secrets".
- **Un secret de GitHub Actions tiene un límite de tamaño más chico de lo
  que sugiere la documentación** ("64 KB" documentado; en la práctica, un
  valor de ~50 KB ya dio "too large"). Si hace falta guardar un blob
  grande (ej. una sesión de browser serializada), partirlo en varios
  secrets de ~20 KB y concatenarlos en el workflow antes de usarlos — ver
  `.github/workflows/zoom-apply-browser.yml`.
- **En `zoom-automation/lib/zoom-browser.ts`, `combobox.fill(label) +
  press("Enter")` deja el valor visible en el input pero no lo confirma en
  el estado interno de la app** (componente controlado que no escucha ese
  evento en este widget puntual) — un paso siguiente que dispare un
  re-render (ej. seleccionar la duración) pisa el valor con el default sin
  ningún error visible. Pasó con `setStartTime`: las 12 ocurrencias de la
  primera corrida real del cron quedaron todas a las 18:00 en vez del
  horario real. Fix/patrón correcto: clickear la opción del dropdown
  (`getByRole("option", { name: label, exact: true })`), igual que ya hace
  `setDuration`. Ver PROGRESS.md 2026-09-13.
- **En esa misma UI, una clase CSS puede estar compartida por varios
  elementos no relacionados** (ej. `.zoom-inline-chevron-icon` la
  comparten el chevron del datepicker Y los de los combobox de Duration/
  Time Zone/etc. — 9 matches en la página) — `.first()` sobre un selector
  así agarra el que aparece antes en el DOM, no necesariamente el que se
  quiere, y el click puede quedar interceptado por un elemento sin
  relación (timeout de 30s reintentando). Preferir siempre un selector
  accesible por rol/nombre (`page.getByRole("button", { name:
  "Next month" })`) en vez de una clase CSS interna — mismo patrón que ya
  usa el resto de `zoom-browser.ts`. Ver PROGRESS.md 2026-09-13.
- **El campo "Add Description" de una reunión de Zoom no se muestra en
  ningún lado útil de la cuenta** (verificado creando una reunión de
  prueba real con agenda "Domicilio: Casa de Lorenzo Munizaga" y mirando
  el detalle). El enriquecimiento real de contenido (WOL: "Tesoros de la
  Biblia" + "TEMA" de La Atalaya) va **solo** al mensaje de WhatsApp
  (`buildOccurrenceShareMessage`, `lib/automation.ts`), nunca al campo de
  Zoom — no volver a intentar meter contenido ahí sin recordar esto.
- **`zoom-browser.ts`: `press("Control+A")` NO selecciona todo el texto de
  un input en Mac** (hace falta `Meta+A`) — un intento de "limpiar antes
  de tipear" con `Control+A`+`Backspace` dejó una clave vieja mezclada con
  la nueva ("0019001914") en vez de reemplazarla, y encima bloqueó el
  botón "Save" (formato inválido). Si hace falta seleccionar todo el
  contenido de un campo antes de tipear, usar `locator.selectText()` de
  Playwright (multiplataforma), no un atajo de teclado. Un `.fill()`
  simple sobre el campo de Passcode sí funciona bien (confirmado releyendo
  "Copy Invitation" desde una sesión aparte) — no todos los campos de esta
  UI tienen el bug de `setStartTime` de abajo.
- **`apply.ts` tiene que pasar explícitamente cada campo que cambió a
  `completeJob`, incluido `passcode`, en la acción `'update'`** —
  `complete_zoom_job` hace `coalesce(p_passcode, passcode viejo)`, así que
  omitirlo dejaba Zoom bien pero `meeting_occurrences.passcode` con el
  valor viejo para siempre (encontrado 2026-09-17: el dashboard mostraba
  una clave vieja pese a que la reunión real ya tenía la fija).
- **Todas las reuniones creadas/editadas por `zoom-browser.ts` fuerzan la
  misma clave (`ZoomBrowserClient.FIXED_PASSCODE`, "001914")** — a pedido
  explícito del usuario, no es opcional. No dejar que Zoom genere una
  clave al azar sin pisarla.
- **Nunca prefijar `NEXT_PUBLIC_` a una clave `service_role` u otro secreto
  real.** Cualquier variable `NEXT_PUBLIC_*` se inlinea en el bundle del
  cliente en `next build` — con `output: 'export'` eso significa que queda
  publicada en texto plano en el sitio estático de GitHub Pages. Pasó el
  2026-09-12: un `.env` local tenía `NEXT_PUBLIC_SB_SECRET_KEY` y
  `NEXT_PUBLIC_SB_SERVICE_ROLE_TOKEN` (ambas `service_role`, bypassean RLS).
  Además ese `.env` no estaba en `.gitignore` (solo `.env*.local` lo estaba) —
  ya se agregó `.env` a `.gitignore`. Cualquier secreto real (service_role,
  credenciales de Zoom, etc.) va sin prefijo `NEXT_PUBLIC_` y, para lo que se
  está construyendo en la automatización de Zoom, vive como secret de
  Supabase Edge Functions, nunca como env var de Next.js.
