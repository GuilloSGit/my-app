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
lógica de datos vive en `lib/` hablando con el cliente de Supabase
(`@supabase/supabase-js`) desde el navegador.

## Estructura de carpetas

```
app/
  page.tsx            Landing pública (sin auth)
  layout.tsx           Root layout: fuentes, metadata/OG, manifest, ThemeProvider
  login/page.tsx       Login por magic link
  dashboard/page.tsx   Dashboard de reuniones (requiere sesión, AuthGuard)

components/
  auth-guard.tsx        Redirige a /login si no hay sesión
  navbar.tsx             Nav + logout + theme toggle
  theme-provider.tsx     Wrapper de next-themes (attribute="class", defaultTheme="system")
  theme-toggle.tsx       Botón light/dark (usa resolvedTheme, no theme — ver Gotchas)
  meeting-card.tsx       Card de una reunión: expand, editar, eliminar, compartir
  meeting-form.tsx       Form de alta/edición (validado con lib/meetings.validateMeeting)
  whatsapp-share.tsx     Compartir por WhatsApp: un botón, envío directo (sin editor)
  csv-import.tsx         Alta masiva de reuniones desde CSV (papaparse)
  zoom-import-dialog.tsx Pegar una invitación de Zoom y parsearla (lib/zoom-parser)
  service-worker-register.tsx  Registra el SW solo en prod, lo desregistra en dev
  copy-button.tsx, tooltip.tsx, calendar-logo.tsx, contact-buttons.tsx  UI de soporte

lib/
  supabase.ts            Cliente Supabase (con seam para E2E, ver Testing)
  auth.ts                Hook useAuth: sesión + sendMagicLink + logout
  admin.ts                isAdmin(user) contra NEXT_PUBLIC_ADMIN_EMAIL
  authorized-emails.ts    isAuthorizedEmail(email) contra NEXT_PUBLIC_AUTHORIZED_EMAILS
  meetings.ts             CRUD de reuniones + validateMeeting + formatMeetingDate/Time
  zoom-parser.ts          Parsea el texto de invitación de Zoom (regex, es-AR)

__tests__/                Vitest: unit, integration, components (RTL)
e2e/                       Playwright: specs + helpers/mock-supabase.ts
.github/workflows/deploy.yml   CI: test → build → deploy
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

- **Vitest 4 requiere Node ≥20.** El workflow de CI está en Node 20 en los
  tres jobs — no bajarlo, rompe con un `SyntaxError` sobre `node:util`'s
  `styleText`.
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
