# Automatización de reuniones Zoom — spec y arquitectura

> Este es el documento de referencia ("por qué") de esta feature. `ROADMAP.md`
> es el checklist de fases ("qué falta"), `PROGRESS.md` es la bitácora
> cronológica ("qué se hizo y qué se encontró"). Leer los tres antes de tocar
> código de esta feature — en ese orden si es la primera vez: este documento
> primero, para entender el razonamiento; después ROADMAP para saber en qué
> fase estamos; después PROGRESS para el detalle reciente.
>
> Varias decisiones acá son contraintuitivas. **El razonamiento importa tanto
> como la regla** — si algo se "mejora" sin entender el porqué, se rompen
> garantías ya pensadas (ver especialmente la sección de PATCH/diff
> posicional y la de transitorio-vs-bloqueado).

> **Estado actual (2026-09-12): Fase 2 (API REST) pausada, reemplazada por
> Fase 2-bis (navegador automatizado).** El reconciliador (Fase 1) funciona
> y está verificado contra el proyecto real; el cliente Zoom + outbox por
> API REST (Fase 2 original) están escritos, testeados y deployados pero
> dormidos — no hay forma de aplicar contra Zoom real porque la cuenta de la
> congregación es una sub-cuenta administrada por "Kingdom Support
> Services, Inc." sin permisos para crear apps de Marketplace. En su lugar
> se está construyendo un worker con Playwright que maneja la UI web de
> Zoom (que sí funciona con el rol "Miembro" de esta cuenta) — ver sección
> "Navegador automatizado (Playwright)" más abajo. El flujo manual
> (`lib/zoom-parser.ts`) sigue siendo el autoritativo hasta que esto último
> esté verificado end-to-end. Ver detalle en ROADMAP.md/PROGRESS.md.

## Contexto del dominio

La Congregación Media Agua tiene dos reuniones semanales fijas por Zoom
(ejemplo real de esta congregación: entresemana jueves, fin de semana
sábado — confirmar horas exactas contra `meeting_schedules` real, no
asumir). Hoy el proceso es 100% manual: alguien entra a Zoom, crea la
reunión, copia los datos y los pega en `my-app` (parseado por
`lib/zoom-parser.ts`). La app propia es la que distribuye el link a todos,
así que el link tiene que pasar sí o sí por ahí.

Requisito de negocio no negociable: **el link tiene que ser distinto en
cada reunión.**

## Principio rector

> **La app propia (esta base de datos) es la fuente de verdad. Zoom es una
> réplica descartable.**

Nada se edita nunca desde la UI de Zoom. Con eso, la sincronización deja de
ser bidireccional y se convierte en un reconciliador en una sola dirección:
estado deseado (Postgres) → estado aplicado (Zoom). Todo lo que sigue
depende de este principio.

---

## Decisión de arquitectura: por qué no es Fastify + pg-boss

El spec funcional original (con el que arrancó esta feature) asumía un
backend Fastify + PostgreSQL + cron de sistema + pg-boss. **Ese backend no
existe en este repo.** `my-app` es un Next.js 14 con `output: 'export'`
servido estático desde GitHub Pages — no hay proceso propio corriendo
nunca, solo el browser hablando directo con Supabase (Auth + Postgres +
RLS) con la anon key. Se detectó el conflicto explorando el repo antes de
escribir nada (ver `AGENTS.md`), se lo señaló al usuario en vez de
resolverlo por cuenta propia, y se preguntó cómo resolver la falta de
backend/lugar seguro para secretos. Respuesta del usuario: **la opción más
gratis posible** — sin hosting nuevo, sin costo nuevo, en fases, con
`ROADMAP.md`/`PROGRESS.md` actualizados en cada fase.

Arquitectura resultante — todo el backend nuevo vive *dentro* del mismo
proyecto Supabase que ya usa `meetings`:

| Spec original | Reemplazo Supabase-native | Por qué |
|---|---|---|
| Servidor Fastify | **Supabase Edge Functions** (Deno) | No hay proceso propio para correr Fastify; Edge Functions son gratis hasta 500K invocaciones/mes y no requieren hosting nuevo |
| Cron de sistema | **pg_cron** (extensión Postgres) + **pg_net** disparando las Edge Functions | pg_cron/pg_net son extensiones habilitables en el mismo proyecto Supabase, sin infra nueva — **verificado end-to-end contra el proyecto real** en Fase 0 (ver PROGRESS.md) |
| Cola pg-boss | Tabla `zoom_outbox` + función `SECURITY DEFINER` con `FOR UPDATE SKIP LOCKED` | Mismo Postgres, sin dependencia nueva |
| Servidor Postgres propio | El mismo Postgres de Supabase que ya usa `meetings` | Cero costo adicional |

El volumen real es ~2 reuniones/semana — incluso sondeando la cola cada 2
minutos, el uso queda muy por debajo del límite free-tier. GitHub Pages
sigue gratis para el frontend, sin cambios de hosting.

**Todo lo demás de este documento (modelo de datos, reglas del
reconciliador, WOL, título derivado) es la misma lógica de negocio del spec
original — no cambió por el swap de infra, solo cambió dónde corre.**

---

## Modelo de datos

```sql
create table meeting_schedules (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('midweek','weekend')),
  weekday smallint not null,              -- 0 = domingo (Date#getDay())
  local_time time not null,
  timezone text not null default 'America/Argentina/San_Juan',
  duration_minutes int not null,
  active boolean not null default true
);

create table meeting_occurrences (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references meeting_schedules(id),
  starts_at timestamptz not null,
  duration_minutes int not null,
  topic text not null,
  agenda text,
  wol_week text,                          -- '2026/38'
  zoom_meeting_id bigint,
  join_url text,
  passcode text,
  status text not null default 'pending'
    check (status in ('pending','synced','cancelled','blocked')),
  blocked_reason text,
  origin text not null default 'schedule'
    check (origin in ('schedule','manual')),
  pinned boolean not null default false,
  unique (schedule_id, starts_at)
);

create table schedule_exceptions (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('assembly','special_event','no_meeting')),
  label text not null,
  venue text,
  event_days date[] not null,             -- {2026-10-17} o {2026-10-16,17,18}
  suppresses text[] not null,             -- {'weekend'} o {'midweek','weekend'}
  creates_zoom boolean not null default false,
  note text,
  created_at timestamptz default now()
);

create table wol_week_cache (
  week text primary key,                  -- '2026/38'
  midweek_title text, midweek_url text,
  weekend_title text, weekend_url text,
  fetched_at timestamptz not null default now()
);

create table reconcile_runs (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid references meeting_schedules(id),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  issues jsonb not null default '[]'
);

-- Reemplaza a pg-boss (ver arriba).
create table zoom_outbox (
  id bigint generated always as identity primary key,
  occurrence_id uuid not null references meeting_occurrences(id),
  action text not null check (action in ('create','update','cancel','enrich_agenda')),
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','processing','done','failed')),
  attempts int not null default 0,
  last_error text,
  available_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Notas de diseño:

- `unique (schedule_id, starts_at)` es lo que da idempotencia a los upserts
  del reconciliador diario.
- `pinned` es la válvula de escape para mover **una** reunión puntual sin
  que el reconciliador la pise en la próxima corrida. Sin esto, cualquier
  excepción manual se borra sola y nadie entiende por qué. Debe excluirse
  también de `expand()` (ver más abajo) o se genera un slot duplicado.
- `origin = 'manual'` es para reuniones de fecha irregular (Conmemoración,
  corrimiento de horario por visita del superintendente). El reconciliador
  las ignora una vez creadas; el worker de Zoom las trata igual que a
  cualquier otra.
- **RLS — decisión deliberada, distinta a la de `meetings`**: hoy
  `meetings` permite insert/update/delete a cualquier `authenticated` (el
  admin-gating es solo de UX, no de RLS — ver `ARCHITECTURE.md`). Para
  **todas** estas tablas nuevas (incluidas `meeting_occurrences` y
  `reconcile_runs`, extendiendo el criterio más allá de lo que decía el
  plan original para `meeting_schedules`/`schedule_exceptions`/
  `zoom_outbox`) no hay ningún grant de insert/update/delete para
  `authenticated`. El blast radius de una escritura mala acá es mayor
  (quemar el cupo de 100 req/día de Zoom, cancelar un link ya repartido) que
  en `meetings`. Todas las escrituras pasan por Edge Functions admin-gated
  que usan `service_role`. Las lecturas necesarias para la vista de mes sí
  quedan abiertas. `wol_week_cache` y `zoom_outbox` son de uso puramente
  interno — RLS habilitada sin ninguna policy (deny-all para anon/authenticated).

---

## Integración con Zoom (Fase 2, todavía no implementada)

### Autenticación

App Server-to-Server OAuth de Zoom App Marketplace. Variables de entorno
— **como Supabase secret de Edge Functions, nunca como env var de
Next.js** (ver el incidente de `.env` en `PROGRESS.md` 2026-09-12 sobre por
qué esto importa tanto):

```
ZOOM_ACCOUNT_ID
ZOOM_CLIENT_ID
ZOOM_CLIENT_SECRET
```

Scope: `meeting:write:admin` (o granular equivalente) + `meeting:read:admin`
para el `drift-check`. Token vía `POST
https://zoom.us/oauth/token?grant_type=account_credentials&account_id=...`
con Basic auth, dura 1 hora. **Pendiente de verificar en Fase 2**: si el
caché en memoria del token sobrevive entre invocaciones de una Edge
Function (probablemente no, al ser serverless) — si no, cachear en una
tabla chica o aceptar un fetch por invocación (volumen bajo).

### Crear reunión

`POST https://api.zoom.us/v2/users/me/meetings`

```ts
{
  topic: string,            // máx 200 chars
  type: 2,                  // scheduled, ocurrencia única — NUNCA 8 (recurrente)
  start_time: string,       // '2026-09-17T19:00:00' SIN sufijo Z
  timezone: 'America/Argentina/San_Juan',
  duration: number,
  agenda: string,           // máx 2000 chars
  settings: {
    use_pmi: false,         // CRÍTICO
    join_before_host: true,
    waiting_room: false,
    approval_type: 2,
    mute_upon_entry: true,
    participant_video: false,
  }
}
```

**Por qué `type: 2` y no `type: 8`:** una reunión recurrente comparte el
mismo `join_url` en todas sus ocurrencias — el requisito es que el link
varíe, así que se crea una reunión independiente por ocurrencia.

**Por qué `use_pmi: false`:** con PMI activo todas las reuniones reusan el
ID personal del host y el link se repite — mismo requisito por otra vía.

**`start_time` sin `Z` y con `timezone` aparte:** Zoom lo interpreta en esa
zona. Evita bugs de offset.

### Actualizar reunión — la decisión central de todo el diseño

`PATCH https://api.zoom.us/v2/meetings/{id}` → 204 No Content.

**`PATCH` conserva el `join_url`.** Se puede mover una reunión de sábado
18:00 a domingo 19:00 y el link ya repartido sigue sirviendo. Por lo tanto,
ante un cambio de horario se **actualizan** las ocurrencias futuras, no se
recrean. Recrear solo cuando faltan o sobran slots (ver diff posicional
más abajo).

### Límites y dirty-check

100 requests de create/update por día por usuario (ventana UTC). Con dos
reuniones semanales sobra, pero los `PATCH` comen del mismo cupo. El diff
compara campo por campo antes de encolar: si nada cambió, no se llama a la
API. **Guardar el formulario cinco veces sin modificar nada no debe
disparar ni una sola request.** Esto ya está resuelto a nivel de Postgres
en Fase 1: las funciones `reconciler_*` (ver `PROGRESS.md`) tienen guarda
`on conflict do update ... where <cambió algo>` — si el contenido es
idéntico, ni siquiera se toca `status`, así que Fase 2 nunca ve una fila
"para sincronizar" que en realidad no cambió.

`start_url` (link del host) expira en ~2 horas — **nunca se persiste**. Se
regenera con `GET /v2/meetings/{id}` on-demand (función `zoom-host-link`).

---

## Navegador automatizado (Playwright) — Fase 2-bis, reemplaza a la API REST

> Decidido con el usuario el 2026-09-12, después de descubrir que la cuenta
> Zoom de la congregación es una sub-cuenta administrada por "Kingdom
> Support Services, Inc." sin permisos para crear apps de Marketplace (ver
> más arriba y PROGRESS.md). El rol "Miembro" de esta cuenta sí puede usar
> la UI web de Zoom normalmente (es lo que se hace a mano hoy) — la
> automatización pasa a manejar esa misma UI con Playwright en vez de
> llamar a la API REST.

### Por qué no se scriptea el login

Automatizar usuario/contraseña (o el SSO que use esta cuenta) contra una
cuenta gestionada por una organización es lo más frágil de todo el enfoque:
Zoom puede pedir verificación "¿sos vos?" por email, CAPTCHA, o bloquear el
intento por parecer un bot — y eso rompería la ejecución desatendida en el
peor momento. En cambio: **la sesión se captura una sola vez a mano**
(`zoom-automation/capture-session.ts`, corrido localmente por el usuario,
nunca en CI) y se reutiliza. Esto significa que **no es "para siempre"**:
la sesión guardada va a expirar en algún momento (no documentado por Zoom,
probablemente semanas/meses) y hay que repetir la captura a mano cuando
pase — el único síntoma va a ser que el worker automatizado empiece a
fallar porque la sesión lo redirige al login.

### Piezas

- `zoom-automation/capture-session.ts` — script de un solo uso, corrido a
  mano: abre un Chromium visible, el usuario se loguea con sus propias
  credenciales (el script nunca las ve), y al presionar Enter en la
  terminal guarda `context.storageState()` en
  `zoom-automation/.session/zoom-storage-state.json` (gitignored, nunca se
  commitea).
- `zoom-automation/lib/outbox.ts` — mismo contrato RPC que ya usa la Edge
  Function `zoom-apply` (`dequeue_zoom_jobs`/`complete_zoom_job`,
  `SUPABASE_SERVICE_ROLE_KEY`) — el outbox no distingue si el consumidor
  corre en Deno o en Node, solo que sea `service_role`.
- `zoom-automation/lib/zoom-browser.ts` (`ZoomBrowserClient`) — abre un
  contexto de Playwright reusando la sesión capturada, con
  `createMeeting`/`updateMeeting`/`cancelMeeting`. **Pendiente**: el cuerpo
  de estos tres métodos todavía tira "selectores no grabados" a propósito
  — no se adivinaron selectores de la UI de Zoom a ciegas para algo que
  crea reuniones reales. Hay que grabarlos con
  `npx playwright codegen https://zoom.us` (logueado como la cuenta de la
  congregación) haciendo el flujo real de programar/editar/cancelar una
  reunión, y trasladar los selectores reales a este archivo.
- `zoom-automation/apply.ts` — el loop: dequeue → `ZoomBrowserClient` →
  `complete_zoom_job`, con captura de screenshot en cualquier falla
  (`zoom-automation/.session/failures/`, subida como artifact de GitHub
  Actions cuando el workflow falla).
- `.github/workflows/zoom-apply-browser.yml` — cron cada 10 minutos +
  `workflow_dispatch`. Restaura la sesión concatenando los secrets
  `ZOOM_SESSION_STATE_B64_1`+`ZOOM_SESSION_STATE_B64_2` (base64 del archivo
  de `capture-session.ts`, partido en dos — un solo secret de GitHub no
  alcanza, límite 64 KB, y el archivo en base64 pesa ~100 KB incluso
  filtrado a solo cookies de `*.zoom.us`), corre `npm run zoom:apply` con
  `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` como secrets del repo, y sube
  capturas de pantalla si algo falla.

### Trade-off aceptado a propósito: dónde vive `SUPABASE_SERVICE_ROLE_KEY` ahora

Hasta acá, esa clave nunca salía de Supabase (se inyecta sola en toda Edge
Function, nunca pasó por un archivo del repo ni por una sesión de trabajo —
ver "Por qué no hay una contraseña de Postgres en ningún lado" más arriba).
Este worker corre fuera de Supabase (necesita un navegador real, que Deno
Edge Functions no soporta), así que la misma clave con privilegios de
`service_role` tiene que vivir también como secret de GitHub Actions.
GitHub cifra los secrets en reposo y los redacta de los logs, pero es
honesto reconocer que esto amplía la superficie donde vive esa clave —
antes un solo lugar (Supabase), ahora dos (Supabase + GitHub). Decisión
aceptada conscientemente por el usuario al elegir este camino en vez de
quedarse bloqueados por el permiso de cuenta.

### Estado: `ZoomBrowserClient` verificado de punta a punta (2026-09-25)

Con autorización explícita del usuario para acciones sobre el sistema real,
se probaron `createMeeting`/`updateMeeting`/`cancelMeeting` contra la cuenta
real de Zoom (reuniones de prueba, tema "TEST ... - borrar", limpiadas
después). Hallazgos y fixes durante la verificación:

- **`networkidle` no es confiable en este SPA** (websockets/telemetría que
  nunca terminan) — todas las navegaciones se cambiaron a esperar un
  elemento concreto en vez de "toda la red en silencio".
- **El date-picker real usa `aria-label="{Día},{Mes} {núm},{Año} not
  selected"`** (con sufijo de estado) — el match por substring ya
  funcionaba bien una vez corregido el problema de arriba; lo que fallaba
  era una carrera de timing (`isVisible()` sin esperar, contra un dropdown
  recién abierto), resuelto con un helper `waitVisible()` que sí espera.
- **El campo de hora es un combobox de texto libre en formato 24hs**
  ("19:00", no "7:00 PM" como se había asumido sin verlo) — mejor aún,
  sugerencia del usuario: escribirlo directo con `.fill()` en vez de
  clickear una opción de una lista que puede no estar completamente
  renderizada.
- **Clickear dos comboboxes de duración (horas → minutos) demasiado rápido
  hace que el segundo no abra** — el fix fue una pausa corta de 300ms entre
  ambos, reproducido y confirmado el problema antes de "arreglarlo a
  ciegas".
- **El bug más importante**: tanto `updateMeeting` como `cancelMeeting`
  reportaban éxito (el click no tiraba error) pero la reunión **no
  cambiaba ni se borraba de verdad** — se cerraba la página inmediatamente
  después del click de confirmación, abortando la request al servidor a
  mitad de camino. Además, `waitForURL(/\/meeting\/\d+/)` tras guardar una
  edición era un no-op: la URL de edición YA matcheaba ese patrón antes de
  guardar (no hay navegación real), así que nunca esperaba nada. Fix:
  esperar una señal real de que la operación terminó — que reapareciera el
  link "Edit" (visto en modo detalle, no en modo edición) para `update`, y
  que la URL cambiara a `#/upcoming` para `cancel`. Verificado con un ciclo
  completo crear→editar→cancelar, confirmando cada paso releyendo la
  página de detalle desde una sesión aparte (no solo confiando en que el
  click no tirara excepción).
- El campo de agenda/descripción quedó pendiente en Fase 2-bis a propósito
  (ver nota revisada más arriba) — se implementó y verificó en Fase 3: el
  form tiene un botón "Add Description" que revela un
  `<textarea id="agenda">`, usado en `createMeeting`/`updateMeeting`.

### Pendiente para activar el cron desatendido

1. Cargar `ZOOM_SESSION_STATE_B64_1`/`ZOOM_SESSION_STATE_B64_2` (base64 de
   `zoom-automation/.session/zoom-storage-state.json` partido en dos —
   un solo secret no alcanza, ver "Gotcha: límite de tamaño" en
   PROGRESS.md 2026-09-12), `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`
   como **Secrets** del repo en GitHub (pestaña "Secrets", no "Variables"
   — son cosas distintas, "Variables" no cifra nada) — el usuario lo hace
   él mismo desde GitHub, nunca pegando esos valores en el chat.
2. Activar el cron de `.github/workflows/zoom-apply-browser.yml`.
3. Monitorear las primeras corridas reales (contra el outbox real, no
   reuniones de prueba) antes de confiar en que corra sola indefinidamente.

---

## Título derivado (implementado, Fase 1)

```ts
// supabase/functions/_shared/reconciler/topic.ts
buildTopic(kind, startsAt, timezone)
// "Reunión de entresemana - Jueves 17/09"
```

Función pura, nunca editable a mano. Si `starts_at` cambia, el título
cambia solo y el diff lo detecta como parte del mismo update — el link se
mantiene.

## Contenido desde wol.jw.org (parser implementado en Fase 1; enriquecimiento real es Fase 3)

URL: `https://wol.jw.org/es/wol/meetings/r4/lp-s/{añoISO}/{semanaISO}`. El
número de la URL es la semana ISO — **verificado contra la fecha real**
(semana 2026/38 = lunes 2026-09-14, confirmado con `date.fromisocalendar`
de Python antes de escribir el código, no asumido). Jueves y sábado caen en
la misma semana ISO, un solo fetch cubre las dos reuniones.

Anclar por texto de los `h2` (`Vida y Ministerio`, `Estudio de La
Atalaya`), **nunca por posición** — las semanas de asamblea o de la
Conmemoración reordenan/omiten secciones, y un índice posicional metería la
publicación equivocada en el agenda sin fallar ruidosamente, el peor modo
de falla posible. El selector `.cardLine1` (con fallback a `a.text()`) fue
**verificado contra el DOM real** en Fase 0 — no es una suposición sin
chequear, ver `PROGRESS.md` y el fixture `__tests__/fixtures/wol-2026-38.html`.

**Desacople de agenda — revisado 2026-09-12**: el diseño original preveía
un job aparte (`wol-enrich`) que completara el `agenda` por `PATCH` cuando
el contenido apareciera después de crear la reunión solo con el título. Se
verificó contra wol.jw.org real (semanas 2026/38 a 2026/52, ~3.5 meses de
anticipación) que el contenido está publicado muy por delante del
horizonte de 1 mes de `reconcile` — no hay lag de publicación que resolver.
El desacople real ya lo da gratis `reconciler_upsert_occurrence` (Fase 1/2):
si la ocurrencia ya está sincronizada (tiene `zoom_meeting_id`) y el
contenido cambia, encola `update` en vez de `create` — mismo efecto que un
PATCH de agenda, preservando `join_url`, sin necesitar una Edge Function
nueva. `wol_unreachable` tampoco necesita un job dedicado: esas semanas
nunca se cachean, así que la próxima corrida de `reconcile` reintenta sola.
**No hay `wol-enrich` como función separada** — ver también el cuadro de
"Jobs" más abajo, actualizado.

Cachear por semana en `wol_week_cache` — **solo fetches exitosos**, nunca
un "no se pudo conectar" (eso es transitorio, se reintenta siempre en la
próxima corrida, nunca se recuerda como fallo).

---

## El reconciliador (implementado en Fase 1, lógica pura + adaptador real)

Un único punto de entrada (`reconcileWeek`/`reconcileMonth` en
`supabase/functions/_shared/reconciler/reconcile.ts`), invocado tanto por
el cron (Fase 5) como por el endpoint de edición de horario (Fase 4).
Horizonte: 1 mes. Aislamiento: aporta a una fila a la vez, ver más abajo
"límite real del advisory lock".

### Regla de seguridad que atraviesa todo

> **Solo una excepción explícita cancela una reunión. La falta de datos
> nunca cancela: bloquea (si la sección de WOL genuinamente falta) o no
> toca nada (si WOL fue inalcanzable, transitorio).**

`wol_unreachable` (warning, no toca nada) y `wol_section_missing` (blocked,
requiere revisión humana) son **caminos separados, nunca el mismo catch** —
mezclarlos pierde exactamente la información que sirve. Esto está
implementado y testeado explícitamente (`__tests__/reconciler/reconcile.test.ts`,
caso "nunca el mismo catch").

Si ya existía una reunión sincronizada y ahora WOL no trae contenido, no se
borra — queda como está y se marca. El único camino a `cancelled` es una
fila de `schedule_exceptions`.

### Dos mecanismos separados — no confundirlos

1. **Reconciliación de contenido** (`reconcileWeek`, corre a diario):
   para una fecha fija derivada de (schedule, semana ISO) vía
   `occurrenceDateForWeek()`, decide cancelar/bloquear/upsertear. No usa el
   diff posicional — la fecha natural del schedule no cambia día a día, así
   que un upsert por clave única (`schedule_id`, `starts_at`) alcanza.
2. **Diff de cambio de horario** (`expand()` + `diffOccurrences()`, corre
   solo cuando se edita `meeting_schedules`, Fase 4): empareja ocurrencias
   futuras existentes (sin `cancelled` ni `pinned`) contra las nuevas
   deseadas **por orden cronológico, no por `starts_at`** — el truco
   central: si se empareja por `starts_at`, cambiar la hora produce N
   cancels + N creates (links nuevos para todos). Emparejando por posición,
   la primera existente se aparea con la primera deseada y sale un
   `update` que preserva el link. Extra en deseadas → `create`; extra en
   existentes → `cancel`. Las `pinned`/`origin='manual'` quedan fuera del
   matching **y** hay que excluir su semana del `expand()`, o se genera un
   slot duplicado.

### Concurrencia — límite real aceptado en esta fase

El spec pide `pg_advisory_xact_lock` cubriendo toda la transacción de la
semana. En la implementación real (Edge Function + PostgREST, sin conexión
Postgres directa — ver "por qué no hay contraseña de DB" abajo), el lock
vive dentro de cada función SQL `SECURITY DEFINER` de escritura
(`reconciler_cancel_occurrence`/`reconciler_mark_blocked`/
`reconciler_upsert_occurrence`), cubriendo la escritura en sí (una llamada
RPC = una transacción PostgREST), **no** la secuencia completa de
leer-excepción → leer-WOL → decidir (esa parte vive en TypeScript, sin
transacción propia, porque el fetch HTTP a WOL no puede vivir dentro de una
función SQL sin duplicar el parser en plpgsql). Limitación aceptada
conscientemente: en el peor caso, una corrida de cron y una edición manual
concurrentes deciden sobre un estado levemente desactualizado, pero nunca
corrompen una fila, y el sistema es autocorrectivo (la próxima corrida
diaria arregla cualquier decisión tomada con información vieja).

### Por qué no hay una contraseña de Postgres en ningún lado

Las Edge Functions no abren una conexión Postgres directa (eso requeriría
la contraseña real de la base, un secreto que nunca se le pidió al
usuario). En cambio, usan `@supabase/supabase-js` con el
`SUPABASE_SERVICE_ROLE_KEY` que Supabase inyecta automáticamente en el
entorno de **toda** Edge Function — ni siquiera ese valor pasa nunca por
una sesión de trabajo o un archivo del repo. Las tres escrituras van por
`.rpc(...)` a las funciones `SECURITY DEFINER` de arriba; las lecturas son
`.from(...).select(...)` directas (bypasean RLS por ser `service_role`).
`supabase db push` (migraciones) tampoco necesita esa contraseña — se
autentica con el access token de `supabase login`, no con credenciales de
Postgres.

### Outbox (Fase 2, todavía no implementado)

Dentro de cada escritura se deja el estado deseado
(`starts_at`/`topic`/`agenda`/`status='pending'`); un worker aparte
(`zoom-apply`) consume `zoom_outbox` y hace las llamadas reales a Zoom. Si
Zoom está caído, la fila ya dice a qué hora tiene que estar la reunión y el
job reintenta.

---

## Interfaz (Fase 4) — primer entregable cerrado 2026-09-13

> **Gate de admin nuevo, necesario para todo lo que sigue siendo de solo
> lectura hoy**: `reconcile`/`zoom-apply` se autentican con un token
> interno estático (`RECONCILE_INTERNAL_TOKEN`/`ZOOM_APPLY_INTERNAL_TOKEN`),
> pensado para invocaciones servidor-a-servidor (cron, `gh workflow run`) —
> **no es seguro exponerlo en el browser de un admin** (cualquiera con
> DevTools lo vería). Las próximas Edge Functions de escritura que se
> llamen desde acá (botón "Sincronizar ahora", acciones de fila,
> excepciones, editor de horario) necesitan un gate distinto: validar el
> JWT que `supabase.functions.invoke(...)` ya adjunta solo cuando lo llama
> un cliente autenticado (`supabase.auth.getUser(jwt)`) y chequear el email
> contra la misma lista de `ADMIN_EMAILS` que ya usa `lib/admin.ts`
> client-side — del lado server como una env var más de Supabase (no
> secreta, ya es pública vía `NEXT_PUBLIC_ADMIN_EMAIL`). Acordado, todavía
> sin implementar.

- **Vista de mes — implementada, de solo lectura**: `/dashboard/automatizacion`
  (`app/dashboard/automatizacion/page.tsx`, admin-only vía `isAdmin()`,
  redirige a `/dashboard` si no lo es), agrupada por schedule con chip de
  estado (`components/occurrence-status-badge.tsx`), motivo cuando está
  `blocked`, `join_url` con `CopyButton`. Datos vía `lib/automation.ts`
  (mismo patrón que `lib/meetings.ts`: funciones async sobre el cliente
  Supabase del browser, sin server actions — RLS de lectura ya lo permite,
  no hace falta el gate de admin de arriba para esto). Sin ningún botón de
  escritura todavía — eso espera al gate.
- **`meeting_schedules` con el horario real cargado** (migración
  `20260912210000_seed_real_schedules.sql` +
  `20260912210500_fix_schedule_timezone.sql`): jueves 19:00 y sábado 18:00,
  2hs cada una, `America/Argentina/Buenos_Aires` — antes vacía en
  producción, así que `reconcile` no tenía nada que calcular. **Stopgap
  explícito**, pedido así por el usuario: el editor de horario (más abajo)
  va a reemplazar esta carga manual por una UI editable para cuando el
  horario cambie.
- **Acciones de un clic sobre filas bloqueadas** (pendiente, necesita el gate): Marcar Asamblea (abre
  form de excepción), Marcar Conmemoración (`origin='manual'`), Crear igual
  sin contenido, Cancelar esta reunión, **Mover a otro día** (caso "Visita
  del Superintendente de Circuito": no es una cancelación, es un
  corrimiento — se resuelve con una excepción `suppresses=['midweek']` +
  una ocurrencia `origin='manual'` en la fecha nueva; la UI hace ambos
  pasos atrás de escena).
- **Form de excepción** (pendiente, necesita el gate) — defaults ya acordados con el usuario (no
  volver a preguntar):
  - **Asamblea** (cualquier tipo — circuito o regional): suprime **siempre
    ambas** reuniones de esa semana. `creates_zoom` fijo en `false` (no
    editable) — no hay link, solo la info de lugar/día(s) cargada, o si no
    hay lugar, un texto tipo `Asamblea (semana {lunes dd/mm} al {domingo
    dd/mm})`.
  - **Acontecimiento especial** (genérico): se pre-marca como sugerencia
    editable el checkbox de la reunión cuyo día caiga en `event_days`, pero
    queda abierto a edición manual — no es una regla fija.
- **Editor de horario con preview** (pendiente, necesita el gate): antes de guardar un cambio de horario,
  correr el reconciliador en modo `dryRun` (`reconcile` con
  `dryRun:true`, ya implementado y probado en Fase 1) y mostrar el diff en
  texto plano. No opcional — sin el preview, el usuario no confía en el
  botón y vuelve al proceso manual. Reemplaza la carga manual de
  `meeting_schedules` de arriba.
- **`reconcile_runs.finished_at` siempre visible — implementado**, aunque
  no haya nada pendiente (mismo entregable que la vista de mes) — un
  tablero que dice "todo bien" y uno con "última corrida hace 9 días" se
  ven igual si no se muestra la fecha.

---

## Jobs (Fase 5, todavía no implementado) — revisado 2026-09-12 tras el pivot a Fase 2-bis

El spec original asumía que `zoom-apply` era una Edge Function (barata de
llamar seguido, cron cada 2 minutos con sentido). Con el pivot a
Playwright (Fase 2-bis), "aplicar" corre en GitHub Actions con un
runner completo + Chromium — un cron cada 2 minutos ahí sería un
desperdicio real de minutos de CI (ya pasó una vez: se activó de más
contra una cola vacía, ver PROGRESS.md 2026-09-12, y el usuario
preguntó "¿cron cada 10 min para qué?"). Plan revisado, propuesto por el
usuario:

| Job | Dónde corre | Horario | Qué hace |
|---|---|---|---|
| `reconcile` | Supabase (pg_cron) | cada 2 días (no diario) | escaneo de 1 mes, encola create/update/cancel en `zoom_outbox` (el `update` cubre el caso de "agenda que cambió", ver Fase 3) |
| `zoom-apply-browser` | GitHub Actions | **sin cron propio** | drena el outbox manejando el navegador |
| `drift-check` | Supabase (pg_cron) | semanal | reporta divergencias Zoom real vs. DB, nunca corrige |

**Sin `wol-enrich` como job aparte** (revisado 2026-09-12, ver "Contenido
desde wol.jw.org" arriba): el propio `reconcile` ya retoma `wol_unreachable`
en su próxima corrida y ya emite `update` cuando el contenido de una
ocurrencia sincronizada cambia — agregar una función diaria extra solo para
esto no se justificaba frente al costo de mantenerla, dado que el contenido
de WOL está disponible casi siempre dentro del horizonte de 1 mes.

**Aislamiento entre schedules — pendiente de diseño para cuando se active
el cron real (Fase 5)**: `reconcile` (la Edge Function) procesa un solo
`scheduleId` por invocación; todavía no existe el driver que la dispare una
vez por cada `meeting_schedules` activo (hoy son 2: entresemana y fin de
semana). Cuando se implemente ese driver, tiene que disparar un
`net.http_post` independiente por schedule (mismo patrón fire-and-forget
verificado en el spike de pg_cron→pg_net de Fase 0) para que la falla de
uno no bloquee al otro — nunca esperar la respuesta de un schedule antes de
disparar el siguiente. Dentro de una misma invocación (un schedule, varias
semanas del mes) esto ya está resuelto: `reconcileMonth` aísla cada semana
en su propio `try/catch`.

**Cómo se dispara `zoom-apply-browser` sin cron propio** (dos caminos,
mismo principio que ya regía en el spec original — "el caso común se
aplica en segundos, el backstop de baja frecuencia cubre el resto" — solo
que el backstop ahora es cada 2 días, no cada 2 minutos, porque correrlo
más seguido ya no es gratis):

1. **Botón "Sincronizar ahora" en el admin UI (Fase 4)**: llama a una
   Edge Function nueva y chica (`zoom-apply-dispatch`) que dispara el
   workflow de GitHub Actions vía la API REST de GitHub
   (`POST /repos/{owner}/{repo}/actions/workflows/zoom-apply-browser.yml/dispatches`),
   usando un GitHub Personal Access Token (scope `workflow`) guardado como
   secret de Supabase — **nunca en el frontend ni pedido por el chat**, el
   usuario lo genera y lo carga él mismo (`supabase secrets set
   GITHUB_PAT=...`), mismo patrón que toda credencial real de este
   proyecto. Da sync casi instantáneo cuando el admin edita algo.
2. **Backstop automático cada 2 días**: al terminar su corrida, el propio
   `reconcile` dispara el mismo `zoom-apply-dispatch` (fire-and-forget,
   igual que el spec original preveía para la Edge Function `zoom-apply`
   pausada) — así lo que quedó pendiente sin que nadie apretara el botón
   igual se aplica, sin necesitar un cron de GitHub Actions corriendo
   seguido.

`drift-check` es barato y avisa temprano de que la regla "no se toca desde
Zoom" se rompió — no corrige automáticamente, reporta.

---

## Preguntas que estaban abiertas — ya resueltas, no volver a preguntar

1. **Qué suprime cada tipo de excepción por defecto** — resuelto con el
   usuario, ver arriba (sección Form de excepción) y `ROADMAP.md`.
2. **Selector `.cardLine1` de wol.jw.org** — verificado contra el DOM real
   en Fase 0, confirmado correcto, no hizo falta el fallback.

## Criterios de aceptación (del spec original, vigentes sin cambios)

- [x] Crear un schedule jueves 19:00 genera 4-5 ocurrencias con `join_url`
      distintos — **verificado en dry-run** contra el proyecto real (Fase 1)
- [ ] Cambiar solo la hora a 20:00 → todos los `join_url` se mantienen (Fase 2, necesita Zoom real)
- [ ] Cambiar solo el día a miércoles → todos los `join_url` se mantienen (Fase 2)
- [x] Guardar el form sin cambios → cero requests a la API de Zoom — **guarda de dirty-check ya implementada** en las funciones SQL (Fase 1); falta Fase 2 para que haya una API de Zoom real a la que no llamar
- [ ] Marcar Semana de Asamblea → la reunión de esa semana queda `cancelled`, aparece el lugar, el resto del mes intacto (Fase 4)
- [x] Semana sin sección en WOL → queda `blocked`, aparece en issues, el mes termina de ejecutarse — **testeado y verificado**
- [x] WOL inalcanzable → `warning`, ninguna ocurrencia modificada, reintento en la corrida siguiente — **testeado y verificado**
- [ ] Ocurrencia `pinned` sobrevive a un cambio de horario del schedule (Fase 4, diff de schedule-write)
- [ ] Ocurrencia `origin='manual'` se crea en Zoom, el reconciliador no la toca (Fase 2/4)
- [ ] Cortar la red hacia Zoom a mitad del apply → la corrida siguiente completa sin duplicar (Fase 2)
- [ ] Dry-run del editor de horario describe correctamente updates/creates/cancels/pinned (Fase 4 UI; el mecanismo de dry-run en sí ya existe y fue probado a nivel de `reconcile`)

## Tests mínimos (del spec original)

- [x] `buildTopic` — varias fechas y zonas
- [x] `expand()` — semanas ISO, bordes de mes, borde de año (2026 tiene semana 53, verificado)
- [x] Diff con `desired.length > actual.length`, `<`, `==`, con `pinned` intercalados
- [x] `reconcileWeek` con los tres resultados de WOL: ok / `null` / sección faltante
- [x] Idempotencia: correr `reconcileMonth` dos veces no produce cambios en la segunda (a nivel de lógica pura Y verificado contra la base real — y en Fase 2 se re-verificó también a nivel del outbox: la segunda corrida no encoló jobs nuevos)
- [x] Cliente de Zoom con fetch stubbeado, nunca contra la API real en CI (Fase 2, `__tests__/zoom/client.test.ts` + `apply.test.ts`)

## Fase 2 — verificado contra el proyecto real (2026-09-12), luego PAUSADA

- [x] `reconciler_upsert_occurrence`/`reconciler_cancel_occurrence` encolan en `zoom_outbox` solo cuando el dirty-check de Fase 1 realmente aplica un cambio — probado con un schedule throwaway (6 ocurrencias → 6 jobs `create`, segunda corrida sin cambios → sigue en 6)
- [x] `dequeue_zoom_jobs` respeta el límite de lote (`for update skip locked`) y `complete_zoom_job` hace backoff exponencial con `last_error` — probado invocando `zoom-apply` sin credenciales de Zoom todavía (falla real de OAuth `400 invalid_client`, las 5 filas del lote volvieron a `pending` con `attempts: 1` y `available_at` corrido, la sexta (fuera de lote) quedó intacta)
- [ ] Verificación con una cuenta de Zoom real (crear/actualizar/cancelar de verdad) — **bloqueada, no pendiente**: la cuenta Zoom de la congregación es una sub-cuenta de "Kingdom Support Services, Inc." (Zoom institucional de las congregaciones); el usuario tiene rol "Miembro", sin acceso para crear apps de Marketplace (eso requiere owner/admin de la cuenta completa). **Fase 2 pausada indefinidamente por decisión del usuario (2026-09-12)** — se sigue con el flujo manual (`lib/zoom-parser.ts`). El código de Fase 2 queda escrito/testeado/deployado pero dormido (sin cron que lo dispare), retomable sin rehacer nada si se resuelve el permiso o se decide otra cuenta. Ver `ROADMAP.md`/`PROGRESS.md` 2026-09-12.
