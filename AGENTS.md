# AGENTS.md — my-app

> Creado 2026-07-05. Para el "qué es y cómo está armado" ver `ARCHITECTURE.md`.
> Este doc es sobre **cómo trabajar** en el repo: comandos, verificación,
> convenciones y trampas conocidas.

## Antes de tocar código

Leer, en este orden, lo que sea relevante a la tarea:
1. `README.md` — setup, comandos, flujo de auth, cómo agregar un test.
2. `ARCHITECTURE.md` — estructura real del sistema y gotchas.
3. `GITHUB_PAGES.md` — si la tarea toca deploy/CI.
4. `ICONS_README.md` — si la tarea toca PWA/manifest/iconos.
5. `ZOOM_AUTOMATION.md` + `ROADMAP.md` + `PROGRESS.md` (en ese orden) — si
   la tarea toca la automatización de reuniones Zoom (`supabase/`). El
   primero es el spec y el razonamiento (por qué), el segundo el checklist
   de fases (qué falta), el tercero la bitácora cronológica (qué se hizo).
   Vive en el **mismo** proyecto Supabase que ya usa la tabla `meetings`
   (no uno separado), pero con un modelo de RLS distinto y más estricto —
   no asumir que las convenciones de `lib/meetings.ts` aplican acá.

No asumir nada sobre el flujo de deploy o de auth sin confirmarlo en estos
docs primero — los tres tuvieron cambios importantes de arquitectura (mayo:
migración a Supabase Auth; julio: suite de tests + CI gate) y una versión
vieja en la cabeza lleva a arreglar el problema equivocado.

## Comandos

```bash
npm run dev            # Next.js dev server, puerto 3000
npm run build           # build de producción (output: export) → dist/
npm run lint             # ESLint (next/core-web-vitals)
npm test                 # Vitest, modo watch
npm run test:run         # Vitest, una pasada (el que corre en CI)
npm run test:ui          # Vitest con interfaz visual
npx playwright test       # E2E (una vez: `npx playwright install chromium`)
npx playwright test --ui   # E2E paso a paso
npx tsc --noEmit           # chequeo de tipos sin build completo

# Automatización de Zoom por navegador (Fase 2-bis, ver ARCHITECTURE.md/ZOOM_AUTOMATION.md)
npm run zoom:capture-session   # captura la sesión de Zoom a mano (correr localmente, nunca en CI)
npm run zoom:upload-session    # sube la sesión recapturada a los 13 secrets de GitHub (evita hacerlo a mano)
npm run zoom:apply             # drena zoom_outbox contra Zoom real vía Playwright (ZOOM_HEADFUL=1 para ver el navegador)
npm run zoom:check-session     # chequeo liviano de sesión (mismo que dispara el botón "Verificar sesión")
npm run zoom:drift-check       # compara Zoom real vs. meeting_occurrences, nunca corrige (botón "Chequear divergencias")
npx tsc --noEmit -p zoom-automation/tsconfig.json   # typecheck de zoom-automation/ (excluido del tsconfig raíz)
```

No hay setup local especial más allá de `npm install` — `.env.local` ya
tiene lo necesario (Supabase URL/anon key, emails autorizados/admin). No hay
rewrites locales que restaurar después de un `git pull` (a diferencia de
otros proyectos del usuario, como Pay Alert).

## Verificar antes de dar un cambio por terminado

Correr como mínimo, y confirmar que todo pasa (no asumir):

```bash
npm run lint
npm run build
npm run test:run
```

Si el cambio tocó login, dashboard, o cualquier componente compartido
(`Navbar`, `ThemeToggle`, `AuthGuard`), sumar `npx playwright test` y —si es
un cambio de UI visible— probarlo en el navegador (Puppeteer o `npm run dev`)
antes de darlo por bueno. Los tests no reemplazan ver el flujo andar en
pantalla.

**No pushear si algo de esto falla.** Arreglar primero.

## Convenciones del repo

- Componentes con `"use client"` explícito donde corresponde (casi todo
  tiene estado/efectos — no hay Server Components reales en uso).
- **`/dashboard` y `/dashboard/automatizacion` leen `meeting_occurrences`
  vía `lib/automation.ts`** (no `lib/meetings.ts`/tabla `meetings` — eso es
  el flujo manual viejo, fallback sin uso real desde 2026-09-17, ver
  ARCHITECTURE.md). No agregar UI nueva que dependa de `lib/meetings.ts`
  sin confirmar antes que realmente hace falta el flujo manual.
- CRUD del flujo manual (fallback) sigue pasando por `lib/meetings.ts` (no
  llamar a `supabase.from("meetings")` directo desde un componente).
- Cualquier chequeo de acceso (`isAuthorizedEmail`, `isAdmin`) es un gate de
  **UX**, no de seguridad — la seguridad real son las RLS policies de
  Supabase (ver `ARCHITECTURE.md`).
- Mensajes de error de cara al usuario no deben filtrar detalles de
  arquitectura (nombre de la tabla, "Supabase", stack de la DB, etc.) — el
  mensaje de email-no-autorizado es un ejemplo del tono correcto.
- Tests nuevos van en `__tests__/` (Vitest, recogidos automáticamente por
  patrón `*.test.ts(x)`) o `e2e/` (Playwright, patrón `*.spec.ts`). No hace
  falta registrar nada en ningún config.
- Para tests de componentes que mockean `@/lib/meetings` con
  `importOriginal`, acordarse de stubear también `@/lib/supabase` (ver
  `__tests__/components/dashboard-meetings.test.tsx`) — si no, intenta
  crear un cliente Supabase real con env vars ausentes en el entorno de test.

## Gotchas (repetido de ARCHITECTURE.md, porque importan al codear)

- CI necesita **Node ≥20** (Vitest 4). `deploy.yml` está en Node 22 (subido
  desde 20 en 2026-09-13 para sacar el warning de deprecación de GitHub
  Actions, mismo valor que ya usaba `zoom-apply-browser.yml`) — no bajarlo
  de 20.
- `theme-toggle.tsx` debe usar `resolvedTheme`, no `theme`, de `next-themes`.
- Los `<label>` de `MeetingForm` no tienen `htmlFor`/`id` — ubicar inputs por
  `placeholder` en tests, no por label.
- `public/site.webmanifest` es un archivo muerto, no tocarlo pensando que es
  el manifest real (ese es `public/manifest.json`).
- El seam `window.__E2E_SUPABASE__` en `lib/supabase.ts` es exclusivamente
  para Playwright — no es un flag de feature ni algo para usar en código de
  producción.
- En `zoom-automation/lib/zoom-browser.ts`, nunca confirmar un valor de
  combobox con `fill()+press("Enter")` — queda visible pero no confirmado
  en el estado interno, y un paso siguiente lo pisa con el default sin
  error visible (pasó con `setStartTime`, reuniones reales quedaron a la
  hora equivocada). Clickear la opción del dropdown, mismo patrón que
  `setDuration`. Tampoco usar una clase CSS interna como selector si hay
  alternativa por rol/nombre accesible — varios elementos no relacionados
  de esa UI comparten clase (ver ARCHITECTURE.md para el detalle de ambos).
- Para seleccionar todo el texto de un input antes de tipear, usar
  `locator.selectText()` de Playwright — `press("Control+A")` no
  selecciona todo en Mac (hace falta `Meta+A`) y puede mezclar el valor
  viejo con el nuevo en vez de reemplazarlo (ver ARCHITECTURE.md).
- Toda acción de `apply.ts` que llame a `completeJob` tiene que pasar
  explícitamente todos los campos que cambiaron (incluido `passcode` en
  `'update'`) — `complete_zoom_job` hace `coalesce(valor nuevo, valor
  viejo)`, así que omitir un campo dejaba Zoom bien pero la base con el
  valor viejo para siempre.

## Memoria de proyecto (fuera del repo)

Hay memoria persistida en
`~/.claude/projects/-Users-guillermoandrada-my-app/memory/`
(`project_my_app.md`, `feedback_verify_before_push.md`) con contexto de
sesiones anteriores — incidentes, decisiones tomadas, por qué. Consultarla si
está disponible; no es parte del repo así que no se pushea. (El repo se movió
de `.../Projects/my-app` a `.../my-app` en 2026-09 — la memoria vieja quedó
en `~/.claude/projects/-Users-guillermoandrada-Projects-my-app/memory/`, ya
migrada acá.)

## Cierre de sesión

Este repo tiene un comando `/cierre` local (`.claude/commands/cierre.md`)
con el checklist de cierre específico de este proyecto (git status, memoria,
docs, verificación, push, prompt para la próxima sesión). Usarlo en vez del
`/cierre` global (que está armado para otro proyecto, Pay Alert).
