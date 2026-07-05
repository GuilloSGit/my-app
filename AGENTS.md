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
- CRUD de reuniones siempre pasa por `lib/meetings.ts` (no llamar a
  `supabase.from("meetings")` directo desde un componente).
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

- CI necesita **Node ≥20** (Vitest 4). No tocar `node-version` en
  `.github/workflows/deploy.yml` sin saber esto.
- `theme-toggle.tsx` debe usar `resolvedTheme`, no `theme`, de `next-themes`.
- Los `<label>` de `MeetingForm` no tienen `htmlFor`/`id` — ubicar inputs por
  `placeholder` en tests, no por label.
- `public/site.webmanifest` es un archivo muerto, no tocarlo pensando que es
  el manifest real (ese es `public/manifest.json`).
- El seam `window.__E2E_SUPABASE__` en `lib/supabase.ts` es exclusivamente
  para Playwright — no es un flag de feature ni algo para usar en código de
  producción.

## Memoria de proyecto (fuera del repo)

Hay memoria persistida en
`~/.claude/projects/-Users-guillermoandrada-Projects-my-app/memory/`
(`project_my_app.md`, `feedback_verify_before_push.md`) con contexto de
sesiones anteriores — incidentes, decisiones tomadas, por qué. Consultarla si
está disponible; no es parte del repo así que no se pushea.

## Cierre de sesión

Este repo tiene un comando `/cierre` local (`.claude/commands/cierre.md`)
con el checklist de cierre específico de este proyecto (git status, memoria,
docs, verificación, push, prompt para la próxima sesión). Usarlo en vez del
`/cierre` global (que está armado para otro proyecto, Pay Alert).
