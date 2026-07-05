# Congregación Media Agua — Reuniones

Plataforma web para gestionar y compartir los enlaces de Zoom de las reuniones de la Congregación Media Agua. Acceso restringido a miembros autorizados, con panel de administración para gestionar reuniones.

## Características

- **Autenticación por Magic Link**: los miembros autorizados ingresan con su correo y reciben un enlace seguro por email — sin contraseñas
- **Dashboard protegido**: lista de próximas reuniones ordenadas por fecha
- **Panel de administración**: crear, editar y eliminar reuniones (solo admins)
- **Importar desde Zoom**: pegar la invitación de Zoom para extraer datos automáticamente
- **Importar CSV**: carga masiva de reuniones desde planilla
- **Compartir por WhatsApp**: enviar detalles de reunión con un clic
- **PWA**: instalable en móviles, funciona como app nativa
- **Tema claro/oscuro**

## Stack

| Capa | Tecnología |
|---|---|
| Framework | Next.js 14 (App Router, static export) |
| Estilos | Tailwind CSS |
| Animaciones | Framer Motion |
| Autenticación | Supabase Auth (OTP magic link) |
| Base de datos | Supabase (PostgreSQL + RLS) |
| Deploy | GitHub Pages / Vercel |
| Tests | Vitest |

## Requisitos

- Node.js 18+
- Cuenta en [Supabase](https://supabase.com) (gratis)

## Configuración inicial

### 1. Clonar e instalar

```bash
git clone <url-del-repositorio>
cd my-app
npm install
```

### 2. Crear proyecto en Supabase

1. Crear proyecto en [supabase.com](https://supabase.com)
2. En **SQL Editor**, ejecutar:

```sql
create table meetings (
  id text primary key,
  title text not null,
  date timestamptz not null,
  zoom_link text not null,
  zoom_id text not null,
  passcode text not null,
  created_at timestamptz default now()
);

alter table meetings enable row level security;

create policy "lectura autenticados" on meetings
  for select using (auth.role() = 'authenticated');

create policy "escritura autenticados" on meetings
  for insert with check (auth.role() = 'authenticated');

create policy "update autenticados" on meetings
  for update using (auth.role() = 'authenticated');

create policy "delete autenticados" on meetings
  for delete using (auth.role() = 'authenticated');
```

3. En **Auth → Settings**:
   - **Site URL**: `https://tu-usuario.github.io/my-app` (o tu dominio)
   - **Redirect URLs**: agregar `http://localhost:3000/**` y `https://tu-usuario.github.io/my-app/**`

### 3. Variables de entorno

```bash
cp .env.example .env.local
```

Completar `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...

NEXT_PUBLIC_AUTHORIZED_EMAILS=email1@gmail.com,email2@gmail.com
NEXT_PUBLIC_ADMIN_EMAIL=admin@gmail.com
```

> La `anon key` es pública por diseño — Supabase la expone en la documentación del proyecto. Las políticas RLS controlan el acceso real a los datos.

### 4. Desarrollo local

```bash
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000).

## Flujo de autenticación

```
Usuario ingresa email
       │
       ▼
¿Email en AUTHORIZED_EMAILS?
  No → mensaje de error
  Sí → Supabase envía magic link por email
       │
       ▼
Usuario hace click en el enlace
       │
       ▼
Supabase crea sesión JWT
       │
       ▼
App detecta sesión → redirige al dashboard
```

Solo los emails en `NEXT_PUBLIC_ADMIN_EMAIL` pueden crear, editar y eliminar reuniones. El resto solo puede ver.

## Tests

Hay tres capas de tests. Las dos primeras corren con Vitest y **no abren un
navegador real**; la tercera corre con Playwright y sí.

```bash
# Vitest: unitarios + componentes (rápido, mockea Supabase)
npm test               # modo watch
npm run test:run       # una sola pasada (la que corre en CI)
npm run test:ui        # interfaz visual

# Playwright: E2E en un navegador real
npx playwright test              # una sola pasada
npx playwright test --ui         # modo interactivo, paso a paso
npx playwright show-report       # ver el último reporte HTML
```

La primera vez que corras Playwright localmente, instalá el navegador:
`npx playwright install chromium`.

Los tests cubren:
- `__tests__/lib/zoom-parser.test.ts` — parsing de invitaciones Zoom
- `__tests__/lib/admin.test.ts` — lógica de roles
- `__tests__/lib/authorized-emails.test.ts` — lista de acceso
- `__tests__/lib/meetings.test.ts` — todas las operaciones CRUD (con mock de Supabase)
- `__tests__/integration/meetings.integration.test.ts` — flujo completo con store en memoria
- `__tests__/components/login.test.tsx` — login con clicks reales (React Testing
  Library): email no autorizado, email autorizado, error de Supabase, redirect
  si ya hay sesión
- `__tests__/components/dashboard-meetings.test.tsx` — CRUD de reuniones desde
  la UI (crear/editar/eliminar, camino feliz y bordes) y control de acceso
  admin/no-admin
- `e2e/login.spec.ts` y `e2e/dashboard.spec.ts` — los mismos flujos, pero en un
  navegador real contra el dev server. `e2e/helpers/mock-supabase.ts` inyecta
  un Supabase falso en `window` (ver el seam en `lib/supabase.ts`) para no
  depender ni pegarle nunca al proyecto real.

**El deploy está gateado por los tests**: en `.github/workflows/deploy.yml`, el
job `build` (y por lo tanto `deploy`) tiene `needs: test`. Si `npm run test:run`
o `npm run test:e2e` fallan, no se llega a construir ni publicar el sitio.

### Cómo agregar un test nuevo

- **Unitario** (una función pura en `lib/`): copiá el patrón de
  `__tests__/lib/admin.test.ts` — `describe`/`it`, sin mocks si la función no
  toca Supabase.
- **De componente** (un flujo de UI con clicks): copiá el patrón de
  `__tests__/components/dashboard-meetings.test.tsx` — mockeá `@/lib/auth` y
  `@/lib/meetings` (o `@/lib/supabase` directamente, como en `login.test.tsx`),
  `render(<Componente />)`, y usá `userEvent` para simular clicks/tipeo.
- **E2E** (mismo flujo pero en un navegador real): agregá un `test(...)` en
  `e2e/`, llamá `installMockSupabase(page, { session, meetings })` antes de
  `page.goto(...)`, y usá los locators de Playwright (`getByRole`,
  `getByPlaceholder`, `getByTitle`) para interactuar.

Cualquier archivo `*.test.ts`/`*.test.tsx` dentro de `__tests__/` lo recoge
Vitest automáticamente; cualquier `*.spec.ts` dentro de `e2e/` lo recoge
Playwright. No hace falta registrarlos en ningún lado.

## Estructura del proyecto

```
my-app/
├── app/
│   ├── page.tsx            # Landing pública
│   ├── layout.tsx          # Root layout, metadata, Open Graph
│   ├── login/page.tsx      # Login con magic link
│   └── dashboard/page.tsx  # Dashboard de reuniones
├── components/             # Componentes React
├── lib/
│   ├── auth.ts             # Hook useAuth (Supabase Auth)
│   ├── admin.ts            # Verificación de rol admin
│   ├── authorized-emails.ts
│   ├── meetings.ts         # CRUD con Supabase
│   ├── supabase.ts         # Cliente Supabase
│   └── zoom-parser.ts      # Parser de invitaciones Zoom
├── __tests__/              # Tests unitarios, integración y de componentes (Vitest)
├── e2e/                    # Tests E2E en navegador real (Playwright)
├── public/                 # Íconos, manifest, service worker
├── vitest.config.ts
└── playwright.config.ts
```

## Deploy

### GitHub Pages

Las variables de entorno van como **Variables** (no secrets) en:  
**Settings → Secrets and variables → Actions → Variables**

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_AUTHORIZED_EMAILS`
- `NEXT_PUBLIC_ADMIN_EMAIL`

### Vercel

Agregar las mismas variables en **Project Settings → Environment Variables**.

## Seguridad

- La autenticación es real: Supabase verifica la sesión vía JWT firmado
- Las RLS policies en Supabase impiden el acceso a datos sin sesión válida, incluso si alguien llama a la API directamente
- La `anon key` es pública por diseño (como la API key de Firebase); no es un secret
- La `service_role` key **nunca** debe estar en el frontend

## Contacto

**Guillermo David Andrada**  
[GA-Software.dev](https://GA-Software.dev) · [guillermoandrada@gmail.com](mailto:guillermoandrada@gmail.com) · WhatsApp [+54 387 629 5801](https://wa.me/543876295801)

---

Proyecto privado para uso de la Congregación Media Agua.
