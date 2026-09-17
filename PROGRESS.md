# PROGRESS — Automatización de reuniones Zoom

> Bitácora de la implementación, en orden cronológico. Ver `ROADMAP.md` para
> el checklist de fases. Una entrada por sesión/hito relevante, fechada.

## 2026-09-12 — Fase 0: spikes iniciales

- **Conflicto de arquitectura detectado y resuelto con el usuario**: el spec
  funcional original asumía un backend Fastify + PostgreSQL + pg-boss, que no
  existe en este repo (Next.js estático en GitHub Pages, sin servidor propio,
  solo Supabase hablado directo desde el browser). Se decidió: todo el
  backend nuevo vive dentro del mismo proyecto Supabase — Edge Functions en
  vez de Fastify, pg_cron/pg_net en vez de cron de sistema, tabla
  `zoom_outbox` en vez de pg-boss. Motivo del usuario: costo cero, sin
  hosting nuevo.
- **Defaults de excepciones resueltos con el usuario**: Asamblea (cualquier
  tipo) suprime siempre ambas reuniones sin crear Zoom. Acontecimiento
  especial pre-marca por `event_days`, editable. Caso "Visita del
  Superintendente de Circuito" (jueves→martes) no es una cancelación sino un
  corrimiento — se resuelve combinando una excepción `suppresses=['midweek']`
  con una ocurrencia `origin='manual'` en la fecha nueva, expuesto en la UI
  (Fase 4) como una acción "Mover a otro día".
- **Spike WOL — selector `.cardLine1` verificado contra el DOM real**
  (`https://wol.jw.org/es/wol/meetings/r4/lp-s/2026/38`, HTML server-rendered,
  sin JS necesario): los tres `h2` (`Vida y Ministerio`, `Estudio de La
  Atalaya`, `Otras publicaciones`) existen tal cual el spec espera, y
  `.cardLine1` existe en el DOM real dentro del primer `<li><a>` de cada
  sección — confirmado con contenido real: midweek devuelve el rango de
  fechas de esa semana (`"14-20 de septiembre"`, correcto — el workbook no
  tiene título propio por semana), weekend devuelve el título del artículo de
  estudio (`"El libro de Isaías nos consuela"`). El fallback a `.text()` del
  spec queda como red de seguridad pero no hizo falta.
- **Spike ISO-week↔URL confirmado**: el número de semana en la URL de WOL es
  efectivamente la semana ISO — `2026/38` corresponde al lunes 2026-09-14,
  que coincide exactamente con el rango mostrado en la página
  (`date.fromisocalendar(2026, 38, 1)` → `2026-09-14`).
- **Supabase CLI**: instalado vía Homebrew (`brew install
  supabase/tap/supabase`, v2.117.0). `supabase init` corrido en la raíz del
  repo → scaffold `supabase/config.toml`, `supabase/migrations/`,
  `supabase/functions/_shared/`.
- **Hallazgo de seguridad — `.env` con secretos como `NEXT_PUBLIC_*`**: al
  buscar el project ref de Supabase apareció un `.env` (sin trackear) con
  `NEXT_PUBLIC_SB_SECRET_KEY` y `NEXT_PUBLIC_SB_SERVICE_ROLE_TOKEN` — ambos
  claves de `service_role` (bypassean RLS) con prefijo `NEXT_PUBLIC_`, que
  Next.js inlinea en el bundle del cliente en cualquier build. Si este repo
  se hubiera buildeado con esos valores, el `service_role` habría quedado
  público en el sitio estático de GitHub Pages. Además `.env` **no estaba en
  `.gitignore`** (que solo cubría `.env*.local`) — un `git add` amplio lo
  hubiera commiteado. Arreglado: `.env` sumado a `.gitignore`
  (`.env`, dejando `.env*.local` como estaba). **Pendiente del lado del
  usuario** (no bloqueante para seguir con esta feature, pero real): renombrar
  esas dos variables sacándoles el prefijo `NEXT_PUBLIC_` (ej.
  `SUPABASE_SERVICE_ROLE_KEY`) — ese valor va a vivir como secret de Supabase
  Edge Functions (Fase 2), nunca como env var de Next.js. Se verificó también
  `jwt_token.json` (aparecido junto al `.env`): es el JWKS público del
  proyecto (solo clave de verificación, `key_ops: ["verify"]`, sin material
  privado) — no es un secreto, no requiere acción.
- **Proyecto Supabase real linkeado**: el usuario corrió `supabase login` en
  su propia terminal; el link (`supabase link --project-ref
  lwucctdliysrsscmjxsh`) se corrió desde la sesión ya autenticada — no
  requiere secretos, solo el ref (no sensible). Proyecto: `Reuniones-Media-
  Agua` (ref `lwucctdliysrsscmjxsh`, región `sa-east-1`, `ACTIVE_HEALTHY`) —
  es el mismo proyecto que ya usa la tabla `meetings` hoy, confirmado por
  nombre y por coincidir con el `NEXT_PUBLIC_SUPABASE_PROJECT_ID` del `.env`.
- **`supabase db push` no pidió contraseña de Postgres**: contrario a lo
  esperado, con el CLI 2.x y el proyecto linkeado por `supabase login`, `db
  push` se autentica con el access token de la sesión (no con la contraseña
  directa de la base) — no hizo falta pedirle esa credencial al usuario.
- **Docker local, no confiable en esta red hoy**: tanto `supabase start`
  como el bundling por Docker de `functions deploy` se quedaron trabados
  ~50 minutos en capas grandes de imágenes (`supabase/edge-runtime` y las de
  Postgres local), incluso corriendo una sola pull a la vez — se descartó
  contención de ancho de banda como causa (una imagen chica, `hello-world`,
  bajó en 10s sin problema). Solución: `supabase functions deploy` tiene un
  flag `--use-api` que bundlea del lado del servidor sin Docker — deploy
  instantáneo con eso. El chequeo de paridad local (`supabase start`) queda
  pendiente/de baja prioridad hasta que se resuelva lo que sea que traba las
  capas grandes en Docker en esta red (no es bloqueante para nada de las
  fases siguientes, que no dependen de Postgres local).
- **Spike crítico confirmado: pg_cron → pg_net → Edge Function end-to-end,
  contra el proyecto real.** Se desplegó una función `ping` throwaway
  (`--use-api --no-verify-jwt`, sin necesitar ningún secreto — JWT
  verification apagado a propósito solo para esta función descartable), se
  programó un cron de prueba cada minuto con `net.http_post` sin headers de
  auth, y la función escribió una fila en una tabla throwaway usando su
  `SUPABASE_SERVICE_ROLE_KEY` inyectada automáticamente por el runtime (el
  secreto nunca pasó por la sesión ni por un archivo). Resultado leído via
  REST con la anon key: tres filas, dos de ellas exactamente un minuto
  aparte (`15:32:01` y `15:33:02`), confirmando el disparo automático del
  cron. Todo el objeto throwaway (tabla, cron job, función) se borró
  inmediatamente después de confirmar — no queda rastro en el proyecto real
  salvo la migración de limpieza documentando qué se probó.
- **Pendiente para continuar Fase 0**: verificación del caché del token Zoom
  entre invocaciones de una Edge Function, y límite de tiempo de ejecución
  de una función free-tier — ambos se verifican recién en Fase 2 cuando haya
  credenciales de Zoom (no bloquean el resto de Fase 0).

## 2026-09-12 — Fase 1: schema + reconciliador puro (dry-run)

- **`.env` corregido**: `NEXT_PUBLIC_SB_SECRET_KEY`/`NEXT_PUBLIC_SB_SERVICE_ROLE_TOKEN`
  renombrados a `SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_SERVICE_ROLE_JWT` (sin
  prefijo `NEXT_PUBLIC_`), agrupados bajo un comentario explícito de "nunca
  van al bundle del cliente". De paso, `NEXT_PUBLIC_SUPABASE_URL` (estaba
  vacía) se completó con la URL real del proyecto — de otro modo
  `lib/supabase.ts` rompe en runtime. También se encontró y arregló
  `NEXT_PUBLIC_SITE_URL={modificar segun contexto}` (placeholder sin
  completar, ya presente antes de esta sesión) — rompía `npm run build`
  (`new URL()` con un string inválido en `app/layout.tsx`); se completó con
  `http://localhost:3000` para desarrollo local, sin relación con la
  automatización de Zoom pero bloqueaba verificar el build.
- **Schema de las 6 tablas aplicado al proyecto real** (migración
  `20260912155057_zoom_automation_schema.sql`): `meeting_schedules`,
  `meeting_occurrences`, `schedule_exceptions`, `wol_week_cache`,
  `reconcile_runs`, `zoom_outbox`, tal cual el modelo del plan. RLS: se
  extendió la política de "sin insert/update/delete para `authenticated`"
  (que el plan pedía para `meeting_schedules`/`schedule_exceptions`/
  `zoom_outbox`) también a **`meeting_occurrences`** y **`reconcile_runs`**
  — no estaba explícito en el plan pero es la misma lógica: esas filas
  tienen `zoom_meeting_id`/`join_url`/`status`, mutarlas desde el browser
  tendría el mismo blast radius que las otras. `wol_week_cache` queda sin
  ninguna policy (deny-all para anon/authenticated, solo accesible via
  service_role) por ser cache 100% interno que la UI no necesita leer
  directo (lee `occurrence.agenda`, ya resuelto).
- **Dependencias nuevas**: `date-fns@4.4.0`, `date-fns-tz@3.2.0`, `cheerio@1.2.0`
  como `dependencies` de Next (para Vitest/Node), más
  `supabase/functions/import_map.json` mapeando los mismos paquetes a
  specifiers `npm:` para que el **mismo import sin extensión** (`from
  "date-fns-tz"`) funcione igual en Deno — es el mecanismo real (no solo la
  intención) para que la lógica pura se comparta entre Vitest y las Edge
  Functions sin duplicar código ni tests.
- **Módulos puros escritos y testeados** en
  `supabase/functions/_shared/reconciler/`: `types.ts`, `topic.ts`
  (`buildTopic`), `expand.ts` (genera ocurrencias deseadas de un schedule,
  usado por el diff de cambio de horario), `occurrence-date.ts`
  (`occurrenceDateForWeek`, la inversa — dado un schedule + semana ISO, la
  fecha exacta; usado por el reconciliador diario), `diff.ts`
  (`diffOccurrences`, el emparejamiento posicional), `wol.ts`
  (`parseWolHtml`/`fetchWol`), `iso-week.ts` (`isoWeekKeyFromCalendarDate`,
  `isoWeekKeyForInstant`, `isoWeeksBetween`), `reconcile.ts`
  (`reconcileWeek`/`reconcileMonth`, puertos inyectados — mismo patrón de
  fake-en-memoria que ya usa `__tests__/integration/meetings.integration.test.ts`,
  sin depender de Postgres real para testear la lógica de decisión).
- **Nota de diseño importante**: `reconcileWeek`/`reconcileMonth` del spec
  operan por fecha fija derivada de (schedule, semana ISO) — el
  emparejamiento posicional (`diffOccurrences`/`expand()`) es un mecanismo
  **separado**, usado solo cuando se edita el horario del schedule (Fase 4,
  función `schedule-write`), no en cada corrida diaria. Se implementaron
  ambos caminos como módulos independientes, no uno hecho a partir del otro.
- **37 tests nuevos, 106 en total, todos verdes** — incluye el caso de borde
  de año pedido explícitamente por el spec: 2026 tiene semana ISO 53
  (verificado con `datetime.isocalendar()` de Python antes de escribir el
  test, no adivinado), y el parser de WOL se testeó contra el **HTML real**
  guardado como fixture en `__tests__/fixtures/wol-2026-38.html` (el mismo
  fetch verificado en la Fase 0), no contra HTML inventado.
- **Ajustes de tooling**: `supabase/functions/**` excluido del `tsc` de
  Next (usa `Deno.serve`, specifiers `npm:`, imports con extensión `.ts`
  que Deno exige y Node no); se sumó `allowImportingTsExtensions: true` al
  `tsconfig.json` raíz porque los módulos compartidos igual se importan
  transitivamente desde los tests de Vitest (`exclude` de tsc no alcanza
  para parar el chequeo transitivo). Se instaló **Deno CLI** (Homebrew, sin
  Docker, instalación rápida) y se corrió `deno check` contra los mismos
  módulos para confirmar que tipan bien también en ese runtime, no solo en
  Node — sin esto, un uso de API de Node por accidente pasaría desapercibido
  hasta el deploy real de la función.
- **Adaptador de puertos contra Postgres real** (`db-ports.ts`,
  `makeDbPorts`): implementa `ReconcilePorts` con lecturas directas
  (`meeting_schedules`, `schedule_exceptions`, `wol_week_cache`) y las tres
  escrituras vía RPC a funciones SQL nuevas (migración
  `20260912165322_reconciler_write_functions.sql`):
  `reconciler_cancel_occurrence`, `reconciler_mark_blocked`,
  `reconciler_upsert_occurrence`. Cada una es `SECURITY DEFINER`, toma
  `pg_advisory_xact_lock(hashtextextended(schedule_id, 0))` antes de
  escribir, y tiene guarda de "no tocar nada si el contenido no cambió" en
  el `on conflict do update ... where` — necesario en serio, no cosmético:
  sin esto, correr el reconciliador todos los días volvería a poner
  `status='pending'` en ocurrencias ya sincronizadas aunque nada haya
  cambiado, lo que en Fase 2 dispararía una request a Zoom de más por día
  por cada reunión, violando el límite de 100 req/día del mismo modo que el
  spec pedía evitar en el form.
- **Decisión de diseño sobre el alcance real del advisory lock**: el lock
  cubre la escritura (una llamada RPC = una transacción PostgREST), no la
  secuencia completa de "leer excepción → leer WOL → decidir → escribir"
  (esa parte vive en TypeScript, sin transacción propia, porque el fetch a
  WOL no puede vivir dentro de una función SQL sin duplicar el parser en
  plpgsql). Es una limitación aceptada conscientemente para esta fase: una
  corrida de cron y una edición manual concurrentes podrían, en el peor
  caso, decidir sobre un estado levemente desactualizado, pero nunca corromper
  una fila (el lock sí protege la escritura en sí), y el sistema es
  autocorrectivo — la próxima corrida diaria arregla cualquier decisión
  tomada con información vieja. Si esto se vuelve un problema real en
  producción, la solución sería mover la decisión completa a una función SQL
  con `pg_net` en modo síncrono o aceptar una arquitectura con conexión
  directa a Postgres (con contraseña real, hoy evitado a propósito).
- **Sin exponer nunca un secreto real por esta sesión**: para poder invocar
  y probar la función `reconcile` sin pedirle al usuario ninguna credencial
  de Supabase, se generó (esta sesión, con `openssl rand -hex 32`) un token
  interno nuevo (`RECONCILE_INTERNAL_TOKEN`) exclusivo para autenticar
  llamadas a esta función — no es un secreto del usuario, es infraestructura
  nueva creada para este propósito. La función lo compara contra el header
  `Authorization` a mano; se deployó con `--no-verify-jwt` porque el gate de
  la plataforma (que exige un JWT válido de Supabase) es innecesario acá —
  el gate real es interno. Este mismo token es el que Fase 5 va a guardar en
  Supabase Vault para que el cron lo use.
- **Edge Function `reconcile` deployada y probada de punta a punta contra
  el proyecto real**: se insertó un `meeting_schedules` throwaway (jueves
  19:00) vía migración, se corrió en `dryRun:true` (devolvió 6 semanas de
  updates previstos, con contenido real de WOL recién fetcheado — "7-13 de
  septiembre", "14-20 de septiembre", etc., hasta mediados de octubre 2026),
  y dos veces en modo real seguido — ambas devolvieron `issues: []` sin
  error, consistente con la idempotencia ya probada a nivel de lógica pura.
  Se limpió todo el schedule/ocurrencias throwaway después (migración de
  cleanup); `wol_week_cache` se dejó intacto porque es contenido real
  reutilizable, no un artefacto de prueba.
- **`supabase db dump` necesita Docker** (a diferencia de `db push`, que no)
  — se intentó como verificación extra y falló porque Docker no estaba
  corriendo en ese momento. No se insistió: la evidencia de las dos corridas
  reales sin error, sumada a los 39 tests del reconciliador (incluida
  idempotencia a nivel de lógica pura), se consideró suficiente para cerrar
  la fase sin necesitar esa inspección extra.
- **Verificación final**: `deno check` limpio, `npx tsc --noEmit` limpio
  (tuvo que arreglarse un test que llamaba `getSchedule()` sin el argumento
  que pide la interfaz), `npm run lint` limpio, `npm run test:run` con
  108 tests verdes (39 del reconciliador).

## Fase 1 — cerrada (2026-09-12)

## 2026-09-12 — Fase 2: cliente Zoom real + outbox

- **Spike previo resuelto sin necesitar credenciales de Zoom**: se desplegó
  una función throwaway (`spike-cache-check`, `--use-api --no-verify-jwt`)
  con un contador `let` a nivel de módulo. Tres invocaciones seguidas y dos
  más 15s después devolvieron cada una un `bootId` distinto y `counter: 1`
  — confirma que una Edge Function **no** reutiliza estado de módulo entre
  invocaciones (cada una arranca un isolate nuevo). Conclusión: cachear el
  token OAuth de Zoom a nivel de módulo no serviría de nada; el caché se
  implementó en cambio dentro del *closure* de `makeZoomClient` (sirve
  dentro de una misma invocación de `zoom-apply`, que procesa varios jobs
  del outbox de una vez). Función borrada inmediatamente después.
- **Cliente Zoom** (`supabase/functions/_shared/zoom/client.ts`,
  `makeZoomClient(credentials, fetchImpl)`, `fetch` inyectable para poder
  testear con Vitest sin pegarle nunca a la API real): `createMeeting`
  (`type: 2`, `use_pmi: false`), `updateMeeting` (PATCH, no reenvía
  `settings` para no resetear configuración no relacionada), `cancelMeeting`
  (DELETE, trata 404 como éxito — ya no existe del lado de Zoom, nada que
  reintentar), `getStartUrl` (GET on-demand, nunca persistido). `start_time`
  se arma con `formatInTimeZone` (mismo paquete que ya usa `topic.ts`) sin
  sufijo `Z`, con `timezone` aparte.
- **Outbox real** (migración `20260912190000_zoom_outbox_apply.sql`):
  `reconciler_upsert_occurrence` (que ahora también recibe `p_timezone`,
  necesario para que el payload del job sea autosuficiente) y
  `reconciler_cancel_occurrence` encolan en `zoom_outbox` **dentro de la
  misma guarda `where` de dirty-check** que ya tenían desde Fase 1 —
  `v_id`/`v_zoom_meeting_id` se leen del `returning` del `insert ... on
  conflict do update`, que solo devuelve fila si el `where` de arriba
  realmente aplicó el cambio. `reconciler_mark_blocked` no se tocó: bloquear
  nunca toca Zoom (regla ya establecida en Fase 1). `dequeue_zoom_jobs`
  (`for update skip locked`, lote configurable) y `complete_zoom_job`
  (marca `done` y sincroniza `zoom_meeting_id`/`join_url`/`passcode` en
  éxito; backoff exponencial con techo de 5 intentos y pasa a `failed` en
  error) completan el ciclo.
- **Edge Function `zoom-apply`** (mismo patrón de auth por token interno que
  `reconcile`, token propio `ZOOM_APPLY_INTERNAL_TOKEN` — no reutiliza
  `RECONCILE_INTERNAL_TOKEN`): dequeue de a 5, un solo `ZoomClient` por
  invocación (un solo token OAuth para todo el lote), `applyZoomJob`
  (`_shared/zoom/apply.ts`) traduce cada job a la llamada de cliente
  correspondiente y devuelve `{ok, error}` sin propagar la excepción —
  `enrich_agenda` falla a propósito (`throw`) por no estar implementado
  todavía (Fase 3), para no aplicarse mal ni quedar colgado en `pending`
  para siempre si apareciera antes de tiempo.
- **Gotcha redescubierto** (ya aplicaba en Fase 1 pero se volvió a pisar
  esta sesión): cada Edge Function se bundlea de forma independiente —
  cambiar un archivo de `_shared/` no alcanza, hay que redeployar **cada**
  función que lo importe. Se editó `db-ports.ts` (agregado `p_timezone`) y
  la primera invocación de prueba de `reconcile` falló con "Could not find
  the function... in schema cache" hasta redeployar `reconcile` también.
- **Verificado de punta a punta contra el proyecto real, sin pedirle nada
  al usuario**: schedule throwaway nuevo (`...002`, jueves 19:00, migración
  + cleanup igual que en Fase 1) — `reconcile` en modo real generó 6
  ocurrencias y **6 filas `zoom_outbox` action=`create`** con el payload
  esperado (topic/agenda/timezone/starts_at/duration/zoom_meeting_id=null).
  Correr `reconcile` una segunda vez con las mismas 6 ocurrencias sin
  cambios **no agregó filas nuevas al outbox** (6 antes, 6 después) —
  confirma que la guarda de dirty-check de Fase 1 también previene
  duplicar jobs, no solo tocar `status`. Se rotaron
  `RECONCILE_INTERNAL_TOKEN`/`ZOOM_APPLY_INTERNAL_TOKEN` (los de Fase 1
  eran de una sesión anterior sin el valor real disponible acá — se
  regeneraron con `openssl rand -hex 32`, mismo patrón, ninguno es un
  secreto del usuario).
- **`zoom-apply` probado contra el fallo real de OAuth** (sin credenciales
  de Zoom seteadas todavía — `ZOOM_ACCOUNT_ID`/`ZOOM_CLIENT_ID`/
  `ZOOM_CLIENT_SECRET` no existen como secret): invocado con las 6 filas
  `pending`, dequeueó 5 (respeta el límite de lote), la sexta quedó
  intacta. Las 5 pegaron contra el endpoint real de OAuth de Zoom, que
  devolvió `400 invalid_client` (esperable sin credenciales) — las 5
  volvieron a `pending` con `attempts: 1`, `last_error` con el mensaje de
  Zoom, y `available_at` corrido ~2 minutos (backoff exponencial). Confirma
  el circuito completo dequeue → llamada real → fallo → backoff sin
  necesitar todavía una cuenta de Zoom real. Se limpiaron después
  `zoom_outbox`/`meeting_occurrences`/`meeting_schedules` del throwaway
  (migración de cleanup) y se borró la función de inspección
  (`spike-inspect-outbox`, throwaway, usada porque `zoom_outbox` es
  deny-all para anon/authenticated — no hay forma de leerla desde afuera de
  una Edge Function).
- **Verificación final**: `npx tsc --noEmit` limpio, `deno check` limpio
  sobre `_shared/reconciler/*.ts` + `_shared/zoom/*.ts` + `reconcile/index.ts`
  + `zoom-apply/index.ts`, `npm run lint` limpio, `npm run test:run` con
  **120 tests verdes** (12 nuevos: cliente de Zoom con `fetch` stubbeado,
  dispatch de `applyZoomJob`).
- **Fase 2 PAUSADA — bloqueante real de cuenta, no un permiso menor**:
  al intentar crear la app Server-to-Server OAuth, las tres opciones de
  Zoom Marketplace (General/Server-to-Server/Webhook) aparecían con los
  radio buttons deshabilitados. Investigado con el usuario paso a paso
  (capturas de pantalla) antes de asumir causa:
  - Descartado plan Basic/free y dominio de email genérico (`gmail.com`)
    como causa raíz — son restricciones reales de Zoom en otros casos, pero
    no la de acá.
  - Búsqueda en foros oficiales de Zoom (community.zoom.com, devforum.zoom.us)
    confirmó que la causa típica de las tres opciones deshabilitadas es un
    permiso de rol ("User Rights"/"Advanced Features" en Role Management),
    ajustable por el owner de la cuenta — no por plan ni por dominio de
    email.
  - **Causa real encontrada en `zoom.us/account`**: la cuenta de la
    congregación es una **sub-cuenta gestionada centralmente** por
    **"Kingdom Support Services, Inc."** (propietario `no-reply-zoom@jw.org`
    — la organización que administra el Zoom institucional de las
    congregaciones), y el usuario de la congregación tiene rol
    **"Miembro"**, sin ningún acceso de administración de cuenta. Crear una
    app de Marketplace requiere permisos de owner/admin de la cuenta
    completa, algo que la congregación individual no tiene ni puede
    otorgarse a sí misma — no es un toggle que se pueda prender desde acá.
  - **Decisión del usuario (2026-09-12)**: pausar Fase 2 (API REST)
    indefinidamente. Todo el código ya escrito, testeado y deployado
    (cliente Zoom, outbox real, `zoom-apply`) queda **dormido** — nada lo
    dispara automáticamente (no hay cron, Fase 5 nunca se activó) —
    retomable sin rehacer nada si en el futuro se resuelve el permiso a
    nivel organización o se decide otra cuenta.

## 2026-09-12 — Fase 2-bis: navegador automatizado (Playwright)

- **Pivot decidido con el usuario en la misma sesión**: en vez de quedarse
  bloqueados o volver 100% al flujo manual, el usuario propuso automatizar
  la UI web de Zoom con Playwright/Puppeteer (la idea venía de una charla
  previa en claude.ai, antes de esta sesión de Claude Code) — la UI web sí
  funciona con el rol "Miembro" de esta cuenta, a diferencia de la API REST.
  Dos decisiones tomadas con el usuario antes de escribir código:
  - **Playwright sobre Puppeteer**: mejor soporte de CI (imágenes oficiales
    para GitHub Actions), locators con auto-wait, y trazas/video al fallar
    — importante para diagnosticar algo que corre desatendido.
  - **Sesión capturada a mano, nunca login scripteado**: automatizar
    usuario/contraseña (o el SSO que use esta cuenta) contra una cuenta
    gestionada por una organización arriesga CAPTCHA o verificación
    "¿sos vos?" que rompería la ejecución desatendida. En cambio, el
    usuario se loguea una sola vez con un Chromium real y visible, y esa
    sesión (cookies) se guarda y reutiliza. Trade-off aceptado: no es
    "para siempre" — la sesión va a expirar en algún momento no
    documentado por Zoom, y hay que recapturarla a mano cuando pase.
- **Scaffolding nuevo** (`zoom-automation/`, fuera de `app/`/`supabase/
  functions/` — Playwright no corre ni en Next (no hace falta) ni en Deno
  Edge Functions (sin Chromium), así que es un contexto Node standalone
  con su propio `tsconfig.json`, excluido del `tsc`/lint de Next igual que
  ya se excluye `supabase/functions`):
  - `capture-session.ts` — abre un Chromium visible, espera a que el
    usuario se loguee a mano, guarda `storageState()` en
    `.session/zoom-storage-state.json` (gitignored).
  - `lib/outbox.ts` — mismo contrato RPC que ya usa la Edge Function
    `zoom-apply` (`dequeue_zoom_jobs`/`complete_zoom_job`) — el outbox no
    distingue si el consumidor corre en Deno o en Node, solo que use
    `service_role`.
  - `lib/zoom-browser.ts` (`ZoomBrowserClient`) — abre el contexto de
    Playwright reusando la sesión capturada; `createMeeting`/
    `updateMeeting`/`cancelMeeting` **tiran error a propósito** ("selectores
    no grabados") en vez de selectores adivinados a ciegas — para algo que
    crea reuniones reales de una congregación, adivinar la UI de Zoom sin
    verla es del mismo tipo de riesgo que ya se evitó antes con el diff
    posicional/PATCH. Quedan marcados con `TODO(codegen)`: hay que grabar
    los flujos reales con `npx playwright codegen https://zoom.us` y
    trasladar los selectores.
  - `apply.ts` — el loop dequeue → `ZoomBrowserClient` → `complete_zoom_job`,
    con captura de screenshot en cualquier falla.
  - `.github/workflows/zoom-apply-browser.yml` — cron cada 10 min +
    `workflow_dispatch`, restaura la sesión desde un secret en base64, sube
    capturas de pantalla como artifact si falla.
  - Nuevas deps (`playwright`, `tsx`, `dotenv` como devDependencies — el
    repo ya tenía `@playwright/test` para e2e, esto es la misma familia
    pero para un script standalone, no un test runner) y dos scripts npm
    (`zoom:capture-session`, `zoom:apply`).
- **Trade-off documentado en `ZOOM_AUTOMATION.md`**: `SUPABASE_SERVICE_ROLE_KEY`
  hasta ahora vivía solo dentro de Supabase (inyectada sola en toda Edge
  Function). Este worker corre fuera de Supabase, así que esa misma clave
  también tiene que vivir como secret de GitHub Actions — una superficie
  más donde existe esa clave, aceptado a propósito por el usuario al elegir
  este camino.
- **Verificación**: `npx tsc --noEmit -p zoom-automation/tsconfig.json`
  limpio, `npx tsc --noEmit` (raíz, confirma que `zoom-automation` queda
  excluido de Next) limpio, `npm run lint` limpio, `npm run test:run` sigue
  en 120/120 (nada de esto tiene tests propios todavía — son scripts que
  manejan un navegador real, se van a probar de punta a punta a mano,
  no con Vitest).
- **Pendiente, bloqueado en el usuario** (no se le pide nada por chat):
  1. Correr `npm run zoom:capture-session` localmente y loguearse una vez.
  2. Cargar `ZOOM_SESSION_STATE_B64` (base64 del archivo de sesión) +
     `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` como secrets del repo en
     GitHub, él mismo.
  3. Grabar con `npx playwright codegen` los flujos de crear/editar/
     cancelar una reunión y pasarme los selectores reales para completar
     `zoom-browser.ts`.
  4. Recién después de eso, probar `zoom:apply` a mano y activar el cron.

## 2026-09-12 (continuación) — Fase 2-bis verificada de punta a punta

- **Sesión capturada y verificada**: el primer intento de
  `capture-session.ts` guardó una sesión que **no estaba autenticada**
  (probablemente Enter apretado antes de que el login terminara del todo)
  — detectado navegando a `zoom.us/profile` con esa sesión y viendo que
  redirigía a `/signin`, tanto en modo headless como visible (para
  descartar que fuera detección de bot y no el login en sí). Segundo
  intento sí quedó autenticado (confirmado: `zoom.us/profile` carga
  directo, sin redirect).
- **Incidente de seguridad menor**: el usuario compartió su contraseña real
  de Zoom dos veces — una vez en una captura de pantalla de un gestor de
  contraseñas, y otra vez en texto plano dentro del código generado por
  `playwright codegen`. Nunca se usó para nada (se sigue con sesión
  capturada, nunca login scripteado); se le recomendó cambiarla como buena
  práctica.
- **Selectores reales obtenidos de `playwright codegen`** (grabado por el
  usuario, logueado en la cuenta real): confirmó el vanity domain real
  `jworg.zoom.us` (no `zoom.us` genérico), que `/meeting/{id}` es
  navegable directo para ver detalle, que "Copy Invitation" + el textbox
  `copy invitation content` da todo el texto de la invitación de una
  (mejor que leer campos sueltos), y los flujos de Edit/Delete.
- **Autorización explícita del usuario** para que esta sesión ejecute
  acciones reales contra la cuenta de Zoom (el harness había bloqueado un
  intento inicial por ser una "transacción del mundo real" — correctamente,
  ya que crear una reunión real no es una acción de solo lectura). Con esa
  autorización se hicieron pruebas reales, no simuladas, iterando sobre
  errores y capturas de pantalla reales en vez de pedirle al usuario que
  probara a ciegas.
- **Bugs encontrados y arreglados, todos reproducidos primero, no
  adivinados**:
  1. `waitUntil: "networkidle"` cuelga o es poco confiable en este SPA
     (websockets/telemetría que nunca terminan) — reemplazado por esperar
     un elemento concreto en cada navegación.
  2. El accessible name real del datepicker es `"{Día},{Mes}
     {núm},{Año} not selected"` (con sufijo de estado) — el match por
     substring ya alcanzaba, lo que fallaba era `isVisible()` sin esperar
     contra un dropdown recién abierto (falso negativo por timing). Fix:
     helper `waitVisible()` que sí espera antes de concluir ausencia.
  3. El campo de hora es un combobox de **texto libre en formato 24hs**
     ("19:00"), no un listado de opciones "7:00 PM" como se había asumido
     sin verlo — el usuario sugirió escribirlo directo con `.fill()` en
     vez de clickear una opción, más robusto (evita depender de que la
     lista esté completamente renderizada).
  4. Clickear el combobox de minutos de duración inmediatamente después de
     seleccionar el de horas fallaba (el segundo no llegaba a abrirse) —
     confirmado con un script de diagnóstico que probó el mismo combobox
     de forma aislada (funcionó solo) vs. en secuencia (falló) antes de
     agregar una pausa de 300ms entre ambos.
  5. **El bug más serio**: `updateMeeting` y `cancelMeeting` reportaban
     éxito (ningún click tiraba error) pero la reunión real **no cambiaba
     ni se borraba** — se cerraba la página inmediatamente después del
     click de confirmación, abortando la request al servidor a mitad de
     camino. Encima, `waitForURL(/\/meeting\/\d+/)` tras guardar una
     edición era un no-op silencioso: la URL de edición ya matcheaba ese
     patrón antes de guardar, nunca hubo navegación real que esperar. Se
     detectó releyendo la página de detalle en una sesión aparte después
     de cada operación (no confiando en que "el click no tiró error"
     significara "la operación se aplicó") — mismo principio que ya regía
     el diseño del reconciliador (verificar contra el estado real, no
     contra la ausencia de excepciones). Fix: esperar una señal real de
     finalización — reaparición del link "Edit" (modo detalle) para
     `update`, redirección a `#/upcoming` para `cancel`.
- **Verificado con un ciclo completo real**: crear → editar → cancelar
  sobre la misma reunión de prueba, confirmando cada paso releyendo
  `/meeting/{id}` desde una sesión Playwright aparte (no la misma que hizo
  la acción) — tema y horario reflejaban la edición, y la reunión
  desapareció (sin botón "Delete") después de cancelar. Sin rastro de
  reuniones de prueba en la cuenta al terminar.
- **Verificación de código**: `npx tsc --noEmit -p zoom-automation/tsconfig.json`
  limpio, `npx tsc --noEmit` (raíz) limpio, `npm run lint` limpio,
  `npm run test:run` en 120/120 (sin tests nuevos — este código maneja un
  navegador real contra un servicio externo, se verifica de punta a punta
  a mano, no con Vitest).
- **Commit armado** (`851cdce`) con Fase 2 + Fase 2-bis, sin línea
  Co-Authored-By (pedido explícito del usuario, ver
  `feedback_no_coauthor_line`). No se hizo push.

## 2026-09-12 (continuación 2) — cargando los secrets: dos gotchas reales

- **Gotcha 1 — "Variables" no es "Secrets"**: el usuario cargó
  `SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_URL`/`ZOOM_SESSION_STATE_B64` en
  la pestaña **"Variables"** de GitHub Actions en vez de **"Secrets"** —
  son dos cosas distintas; "Variables" guarda texto plano sin cifrar y
  visible siempre en la UI de settings, "Secrets" cifra el valor y no lo
  vuelve a mostrar. Detectado por una captura de pantalla del usuario
  mostrando `SUPABASE_SERVICE_ROLE_KEY` completamente legible en la tabla.
  Corregido: se le indicó mover los tres a la pestaña "Secrets" y borrar
  las filas de "Variables". Riesgo real bajo (repo privado, expuesto pocos
  minutos), se ofreció rotar la key desde Supabase como precaución
  opcional, no obligatoria.
- **Gotcha 2 — límite de tamaño de un secret de GitHub Actions (64 KB)**:
  al cargar `ZOOM_SESSION_STATE_B64` como Secret, GitHub rechazó el valor
  por "too large". La sesión capturada sin filtrar pesaba 90.612 bytes
  (≈118 KB en base64). Se filtró `capture-session.ts` (y el archivo ya
  capturado, sin pedirle al usuario loguearse de nuevo) para guardar solo
  cookies/localStorage de dominios `*.zoom.us` — filtrado seguro porque
  las cookies son estrictamente scoped por dominio, así que todo lo que no
  sea `*.zoom.us` (Amazon Ads, Bing, LinkedIn, DoubleClick, StackAdapt,
  etc., capturado sin querer por scripts de marketing corriendo en la
  misma sesión de browser) nunca se manda igual en un request a Zoom —
  sacarlo no puede romper la sesión. Bajó de 127 a 75 cookies, pero el
  archivo resultante (75.040 bytes, ~100 KB en base64) **igual superaba el
  límite de 64 KB** — filtrar más agresivo por nombre de cookie individual
  se descartó por ser adivinar cuáles son necesarias para la autenticación
  (riesgo real de romper una sesión ya validada, sin forma barata de
  probarlo sin re-loguearse). Solución: partir el base64 en dos secrets
  (`ZOOM_SESSION_STATE_B64_1`/`_2`, ~50 KB cada uno) y concatenarlos en el
  workflow antes de decodificar (`printf '%s%s' "$secret1" "$secret2" |
  base64 -d`) — estándar para este límite conocido de GitHub, sin
  necesidad de adivinar nada sobre el contenido de las cookies.
- **Pendiente real**: el usuario tiene que mover los tres secrets ya
  cargados de "Variables" a "Secrets", cargar
  `ZOOM_SESSION_STATE_B64_1`/`_2` (dos secrets nuevos, ya generados y
  listos), y recién ahí el cron queda activo.
- **Los 7 secrets quedaron cargados y confirmados** (`gh secret list`):
  `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`,
  `ZOOM_SESSION_STATE_B64_1..5`.

## 2026-09-12 (cierre) — incidente real durante el cierre: deploy roto

Al cerrar la sesión, el primer push post-Fase-2/2-bis rompió el deploy de
producción: `test` pasó pero `build` falló con `Error: supabaseUrl is
required.` al prerenderizar `/`, `/login` y `/dashboard`. Causa: al mover
`SUPABASE_URL` (la nueva, sin prefijo, para `zoom-automation/`) de
"Variables" a "Secrets", se borró por error también
**`NEXT_PUBLIC_SUPABASE_URL`** (nombre parecido, variable equivocada —
esa sí la necesita el build de producción, `.github/workflows/deploy.yml`
la lee como `${{ vars.NEXT_PUBLIC_SUPABASE_URL }}`). Detectado corriendo
`gh variable list` y comparando contra lo esperado, no asumiendo que "ya
está" solo porque el commit y el push habían salido bien. Fix: recreada la
Variable con `gh variable set` (valor tomado del `.env` local, no
sensible), y re-disparado el deploy con `gh workflow run deploy.yml` —
segunda corrida en verde (`test` ✓, `build` ✓, `deploy` ✓). Detalle
completo (y la regla general: correr `gh variable list` después de tocar
Variables/Secrets, no asumir que solo se tocó lo que se quería) en
`ARCHITECTURE.md`.

Estado final de la sesión: Fase 2 pausada, Fase 2-bis verificada e
implementada, sitio en producción restaurado y funcionando.

## 2026-09-12 (cierre, continuación) — workflow verificado, cron automático DESACTIVADO a propósito

Corrida manual (`gh workflow run zoom-apply-browser.yml`) — encontró un
segundo bug real, no relacionado con Zoom: `@supabase/supabase-js`
necesita WebSocket nativo para inicializar su `RealtimeClient` (aunque
este script no use realtime), y falla con `Error: Node.js 20 detected
without native WebSocket support` en Node 20. El workflow pedía
`node-version: "20"` (copiado sin pensar del patrón de `deploy.yml`, que
sí necesita exactamente eso por Vitest 4 — pero `zoom-apply-browser.yml`
es un workflow completamente aparte, sin esa restricción). Fix: bump a
Node 22. Segunda corrida manual, verde de punta a punta: sesión
restaurada, conexión a Supabase OK, **"Sin jobs pendientes en
zoom_outbox"** (correcto — todavía no hay ningún `meeting_schedules` real
cargado, eso es Fase 4).

**El usuario preguntó, con razón, "¿cron cada 10 min para qué?"** — el
workflow había quedado con `schedule: cron: "*/10 * * * *"` activo desde
que se escribió, pero no hay ningún productor real (ni `meeting_schedules`
cargado a mano, ni cron de `reconcile`) que llene `zoom_outbox` — dejarlo
así era correr un runner completo con Playwright+Chromium cada 10 minutos
(144 veces/día) contra una cola que siempre está vacía, puro gasto de
minutos de GitHub Actions sin ningún trabajo real. **Corregido**: se sacó
el trigger `schedule:`, el workflow queda solo con `workflow_dispatch`
(a demanda) hasta Fase 5, que activa este cron **junto con** el de
`reconcile` (el que realmente produce jobs) — activarlos por separado no
tiene sentido. **Lección**: no activar un cron de "consumidor" antes de
que exista el "productor" que lo alimente, aunque el consumidor en sí
funcione perfecto.

**Propuesta del usuario, adoptada como el plan de Fase 4/5**: en vez de
un cron de `zoom-apply-browser` corriendo seguido (caro en minutos de CI),
`reconcile` pasa a cada 2 días (no diario) y se agrega un botón
"Sincronizar ahora" en el admin UI (Fase 4) que dispara el apply casi al
instante — la cadencia de 2 días queda como backstop de baja frecuencia,
no como el único disparador. Encaja con el principio que ya tenía el spec
original ("el caso común se aplica en segundos, el cron es solo
backstop"), adaptado al hecho de que ahora "aplicar" corre en GitHub
Actions (Playwright/Chromium), no en una Edge Function barata de invocar
seguido. Requiere una Edge Function nueva (`zoom-apply-dispatch`) que
llama a la API de GitHub Actions con un PAT guardado como secret de
Supabase — diseño capturado en `ZOOM_AUTOMATION.md`/`ROADMAP.md`, todavía
no implementado (es trabajo de Fase 4/5, la UI no existe todavía).

## 2026-09-12 (nueva sesión) — Fase 3: revisión de diseño y limpieza, sin job nuevo

- **Verificación real antes de diseñar** (mismo principio que ya regía en
  Fase 0): se hizo `curl` contra wol.jw.org para las semanas ISO 2026/38 a
  2026/52 (~3.5 meses de anticipación desde hoy) y se parseó cada HTML con
  la misma lógica de `parseWolHtml` — las ocho semanas devolvieron HTTP 200
  con títulos reales y distintos (ej. semana 44: "Valoremos el privilegio
  de darle a Jehová 'servicio sagrado sin temor'"). Conclusión: wol.jw.org
  publica muy por delante del horizonte de 1 mes de `reconcile` — no hay
  lag de publicación que un job `wol-enrich` diario tuviera que compensar.
- **Decisión con el usuario**: en vez del job `wol-enrich` separado que
  preveía el spec original, reusar `reconcile` (cada 2 días, Fase 5) para
  todo. Justificación: `reconciler_upsert_occurrence` (Fase 1/2) ya emite
  `update` en vez de `create` cuando una ocurrencia ya sincronizada cambia
  de contenido (preserva `join_url`) — es exactamente el "PATCH de agenda
  desacoplado" que pedía el spec, sin código nuevo. Y `wol_unreachable`
  nunca se cachea, así que la próxima corrida de `reconcile` reintenta sola.
  El beneficio de una corrida diaria extra frente a cada 2 días es marginal
  dado el hallazgo de arriba, no justificaba mantener una función más.
- **El usuario planteó, sin saber que ya estaba resuelto, dos requisitos
  que ya cumplía el diseño de Fase 1/2** — se le confirmó con la traza real
  del código en vez de asumir:
  1. *"Que la ausencia de una reunión no frene la otra"*: ya cubierto
     **dentro** de una invocación de `reconcile` (`reconcileMonth` aísla
     cada semana en su propio `try/catch`, seguí con las demás si una
     falla). **Gap real encontrado**: `reconcile` (la Edge Function) toma
     un solo `scheduleId` por llamada — no existe todavía el driver que la
     dispare una vez por cada schedule activo (hoy 2: entresemana/fin de
     semana), porque eso es trabajo de Fase 5 (cron real), no implementado
     aún. Documentado en `ZOOM_AUTOMATION.md` para resolverlo ahí con
     `net.http_post` independientes por schedule (mismo patrón fire-and-
     forget del spike de Fase 0), no bloquea Fase 3.
  2. *"Que el contenido de WOL ya obtenido no se pierda si falla aplicar a
     Zoom"*: ya cubierto — el contenido se cachea en `wol_week_cache` y se
     persiste en el `payload` JSON de la fila de `zoom_outbox` en el mismo
     paso que se decide (`reconciler_upsert_occurrence`); si `zoom-apply`
     falla, `complete_zoom_job` reintenta con backoff sin volver a tocar
     WOL, reaplicando el mismo payload ya resuelto.
- **Limpieza de código muerto**: se sacó la acción `enrich_agenda` de
  `zoom_outbox` — estaba en el schema (constraint), en los tipos
  (`ZoomOutboxJob`, `ZoomOutboxRow`) y en el `switch` de tres lugares
  (`_shared/zoom/apply.ts`, `zoom-apply/index.ts`, `zoom-automation/
  apply.ts`, `zoom-automation/lib/outbox.ts`) pero **nunca tuvo productor
  real** — `reconciler_upsert_occurrence` solo emite `create`/`update`.
  Migración `20260912200000_drop_enrich_agenda_action.sql` (constraint),
  aplicada al proyecto real con `supabase db push`; `zoom-apply` redeployada
  con `--use-api` para reflejar el cambio (recordando el gotcha ya conocido:
  cambiar `_shared/` no alcanza, hay que redeployar cada función que lo
  importa). Test correspondiente en `apply.test.ts` eliminado (119/119
  verdes, antes 120/120).
- **Campo de agenda implementado, con autorización explícita del usuario
  para inspeccionar la cuenta real** (solo lectura, sin guardar nada):
  reusando la sesión ya capturada horas antes, se abrió el form real de
  "Schedule a Meeting" y se encontró que el campo no está visible de
  entrada — hay un botón **"Add Description"** que revela un
  `<textarea aria-label="Add Description" id="agenda">`. Implementado como
  `setAgenda()` en `zoom-browser.ts`, usado en `createMeeting` y
  `updateMeeting` (si ya está visible —ej. reunión con agenda previa—, no
  hace falta clickear el botón; si `agenda` es `null`, no se toca nada).
- **Primer intento de verificación end-to-end BLOQUEADO por expiración de
  sesión**: con autorización explícita del usuario, el intento de
  `createMeeting` falló al primer paso (`Schedule a Meeting` nunca
  apareció, la captura mostró la pantalla de login) — la misma
  `zoom-storage-state.json` que minutos antes cargó `/profile` sin
  problema pasó a redirigir a `/signin`. **Gotcha nuevo**: la sesión puede
  invalidarse en minutos, no solo "en algún momento no documentado" como
  ya se sabía — no asumir que sigue viva solo porque funcionó hace poco en
  la misma sesión de trabajo.
- **Recaptura de sesión con un problema real de tooling, resuelto**: el
  usuario corrió `npm run zoom:capture-session` backgroundeándolo él mismo
  desde una interfaz sin terminal interactiva — el proceso quedó con
  `stdin` apuntando a `/dev/null` (visible en `ps aux`, `< /dev/null` en el
  comando), así que el `readline.question()` que espera el ENTER nunca iba
  a poder recibirlo, quedando colgado para siempre. Se mató el proceso y se
  relanzó manejando el `stdin` con un FIFO propio (`mkfifo`, `exec
  3<>fifo`, stdin del script apuntado a ese fd) para poder mandarle el
  ENTER (`echo "" > fifo`) recién después de que el usuario confirmara el
  login real en el Chromium visible — evita el bloqueo de abrir un FIFO en
  modo solo-lectura (bloquearía el arranque del proceso hasta que alguien
  escriba) y el problema original de `/dev/null` a la vez. Sesión nueva
  guardada con éxito.
- **Verificación end-to-end CONFIRMADA con la sesión nueva**: ciclo real
  crear (con agenda) → releer desde una sesión Playwright aparte → cancelar
  → confirmar que ya no existe, sobre la cuenta real. El texto de la
  agenda ("TEST AGENDA — verificación Fase 3") apareció en el detalle real
  de la reunión creada, confirmando que `setAgenda()` (el botón "Add
  Description" + el `<textarea id="agenda">`) funciona de punta a punta. La
  reunión de prueba se canceló y se confirmó su desaparición (sin link
  "Edit", sin rastro del texto) antes de cerrar. Sin reuniones de prueba
  quedando en la cuenta al terminar.
- **Verificación de código de esta sesión**: `npx tsc --noEmit` (raíz)
  limpio, `npx tsc --noEmit -p zoom-automation/tsconfig.json` limpio,
  `deno check` limpio sobre todos los módulos de `_shared/reconciler` y
  `_shared/zoom` + `reconcile/index.ts` + `zoom-apply/index.ts`, `npm run
  lint` limpio, `npm run test:run` en 119/119, `npm run build` limpio.

## 2026-09-12 (misma fecha, nueva sesión) — Fase 4: primer entregable, vista de mes de solo lectura

- **Se usó `/EnterPlanMode` antes de codear**, dado el tamaño de Fase 4 (6
  partes + una pieza de infraestructura nueva). Se acordó con el usuario
  arrancar por la parte de menor riesgo: una vista de solo lectura, sin
  ningún botón de escritura, en una ruta nueva separada del `/dashboard`
  actual (que sigue siendo el flujo manual autoritativo). Plan completo en
  `~/.claude/plans/iridescent-bubbling-pinwheel.md`.
- **Nuevo `lib/automation.ts`**: `getActiveSchedules`, `getUpcomingOccurrences`
  (35 días, con embed de `meeting_schedules(kind)` vía el FK que ya existe
  — PostgREST puede devolver el embed como objeto o como array de 1 según
  versión, normalizado en `rowToOccurrence`), `getLatestReconcileRuns`
  (última fila por `schedule_id`, filtrada en JS sobre las últimas 20 —
  volumen bajísimo, no justifica una función SQL de agregación). Mismo
  patrón que `lib/meetings.ts` (funciones async sobre el cliente Supabase
  del browser, sin server actions — el sitio es export estático).
- **Nueva ruta `/dashboard/automatizacion`** (`app/dashboard/automatizacion/page.tsx`):
  admin-only (mismo `isAdmin` de `lib/admin.ts`, redirige a `/dashboard`
  si no lo es), agrupa ocurrencias por schedule con chip de estado
  (`components/occurrence-status-badge.tsx`), motivo cuando está
  `blocked`, `join_url` con el `CopyButton` ya existente, y
  "Última corrida" de `reconcile_runs` siempre visible (punto 6 del
  checklist de Fase 4, cerrado de paso por ser de solo lectura). Link
  nuevo desde el panel de admin de `/dashboard` para poder llegar a la
  pantalla (si no, quedaba sin ninguna forma de navegar ahí).
- **Tests nuevos**: `__tests__/lib/automation.test.ts` (mapeo de filas,
  embed como objeto/array/ausente, dedupe de reconcile_runs por schedule)
  y `__tests__/components/automatizacion-page.test.tsx` (admin ve la
  tabla, no-admin redirigido, estado vacío, ocurrencia bloqueada muestra
  el motivo) — mismo patrón de mock que ya usa
  `__tests__/lib/meetings.test.ts`/`dashboard-meetings.test.tsx`.
  132/132 tests verdes, `npx tsc --noEmit` limpio, `npm run lint` limpio,
  `npm run build` genera la ruta nueva (`/dashboard/automatizacion`,
  5.71 kB) sin errores.
- **Horario real cargado**: `meeting_schedules` estaba vacía en
  producción (nunca se cargó nada real, solo throwaways de fases
  anteriores, todos limpiados) — sin esto la vista de mes solo podía
  mostrar el estado vacío. El usuario confirmó jueves 19:00 (entresemana)
  y sábado 18:00 (fin de semana), 2hs cada una. Primero se cargó con
  timezone `America/Argentina/San_Juan` (el default histórico del schema
  y de todos los fixtures/ejemplos de fases anteriores), pero el usuario
  pidió cambiarlo a `America/Argentina/Buenos_Aires` — se verificó con
  `Intl.DateTimeFormat` que ambos dan el mismo offset real (GMT-3, sin
  DST en ninguno de los dos) antes de aplicar el cambio, así que no
  mueve ningún horario. Como la primera migración ya se había aplicado
  (`supabase db push`), el fix se hizo con una migración `update`
  aparte en vez de editar la ya aplicada (los migrations tracking de
  Supabase no re-corren un archivo ya registrado aunque se le cambie el
  contenido). **Es un stopgap explícito**: el editor de horario (Fase 4,
  último punto) va a reemplazar esta carga manual por una UI editable,
  para cuando el horario cambie en el futuro no haga falta tocar la base
  de nuevo — el usuario lo pidió así explícitamente ("estaria bueno
  ponerlo en la Interfaz... la necesitamos cambiar cuando cambie ese
  horario").
- **Intento de verificar con ocurrencias reales, bloqueado por el modo de
  permisos**: con los schedules ya reales, `meeting_occurrences` seguía
  vacía porque nunca corrió `reconcile` para ellos (sin cron todavía,
  Fase 5). Para invocarlo a mano hacía falta rotar
  `RECONCILE_INTERNAL_TOKEN` (el valor real no está disponible en esta
  sesión — `supabase secrets list` solo muestra un hash, nunca el
  secreto — mismo patrón ya usado en Fase 2 para rotar tokens sin pedirle
  nada al usuario). El clasificador de modo automático **bloqueó la
  escritura al secret store** (`supabase secrets set`) antes de
  ejecutarse — no se intentó ningún rodeo, se paró ahí y se le devolvió
  la decisión al usuario. **Pendiente real**: la vista de mes hoy muestra
  los 2 schedules reales pero sin ocurrencias (estado "Sin ocurrencias
  calculadas") hasta que `reconcile` corra al menos una vez para cada
  uno, a mano o esperando a Fase 5.
- **Diseño acordado para el gate de admin de la próxima iteración** (no
  implementado todavía, documentado en `ROADMAP.md`): las Edge Functions
  de escritura que se llamen desde el browser de un admin (sincronizar
  ahora, acciones de fila, excepciones, editor de horario) van a validar
  el JWT que `supabase.functions.invoke` adjunta solo desde un cliente ya
  autenticado (`supabase.auth.getUser(jwt)`) y chequear el email contra
  la misma lista de `ADMIN_EMAILS` que ya usa `lib/admin.ts` client-side
  — distinto del token estático que usan `reconcile`/`zoom-apply` hoy
  (pensado para cron/servidor, inseguro para exponer en el browser).

## 2026-09-13 (misma fecha) — Gate de admin implementado + botón "Sincronizar ahora"

- **Gate de admin implementado**: `supabase/functions/_shared/admin-auth.ts`
  (`isAdminEmail` pura + `requireAdmin(req, config)`, config recibida por
  parámetro — no lee `Deno.env` directo porque el módulo también lo importa
  un test de Vitest, donde `Deno` no existe; mismo motivo por el que el
  resto de `_shared/` mantiene `Deno.env.get(...)` solo en el `index.ts` de
  cada función) valida el JWT de sesión (`supabase.auth.getUser(jwt)`
  contra `SUPABASE_URL`/`SUPABASE_ANON_KEY`, ambas ya inyectadas por
  Supabase en toda Edge Function) y el email contra la env var nueva
  `ADMIN_EMAILS` (no secreta, mismo valor que `NEXT_PUBLIC_ADMIN_EMAIL`).
- **Primer consumidor real**: `zoom-apply-dispatch` (Edge Function nueva) +
  `supabase/functions/_shared/github/dispatch-workflow.ts`
  (`dispatchZoomApplyWorkflow`, fetch inyectado, mismo patrón que
  `makeZoomClient`) — dispara `zoom-apply-browser.yml` vía la API de
  GitHub Actions con un `GITHUB_PAT` (secret nuevo, scope `workflow`).
  Botón "Sincronizar ahora" en `/dashboard/automatizacion`
  (`lib/automation.ts#triggerZoomSync`, `supabase.functions.invoke`
  adjunta el JWT solo) — ver "Jobs" en `ZOOM_AUTOMATION.md` para el diseño
  completo, ya acordado antes de esta sesión.
- **A diferencia de `reconcile`/`zoom-apply` (`verify_jwt:false`, pensados
  para el token interno estático de cron/servidor), `zoom-apply-dispatch`
  se deja con `verify_jwt` en su default (`true`)** — el gateway de
  Supabase ya rechaza requests sin un JWT válido antes de que corra
  `requireAdmin`, defensa en profundidad para una función pensada para el
  browser de un admin.
- **Efecto colateral encontrado y arreglado — pedido explícito del usuario
  en el momento ("no vayas a pushear esos mails de admins")**: el test
  nuevo de `admin-auth.ts` quedó con los emails reales de
  `NEXT_PUBLIC_ADMIN_EMAIL` como fixture — se cambiaron a
  `admin@example.com`/`otro-admin@example.com` antes de que hubiera
  cualquier commit (nada se llegó a pushear). De paso, el usuario preguntó
  si esos emails ya estaban expuestos: sí, `lib/admin.ts` los tenía
  hardcodeados como fallback desde el commit `177d247` (16-abr), ya
  pusheado a `origin/master` hace tiempo — no algo nuevo de esta sesión.
- **Se sacó el fallback hardcodeado de `lib/admin.ts` y
  `lib/authorized-emails.ts`** (pedido explícito del usuario tras la
  pregunta de arriba): ambas listas ya viven como GitHub Actions
  Variables (`NEXT_PUBLIC_ADMIN_EMAIL`/`NEXT_PUBLIC_AUTHORIZED_EMAILS`,
  confirmado con `gh variable list` que ya estaban cargadas y que
  `deploy.yml` ya las pasa al build) — el fallback ya no hace falta en
  producción. Se completó el `.env` local (gitignoreado) con los mismos
  valores para no romper el desarrollo local.
  - **Bug de test pre-existente encontrado al sacar el fallback**:
    `__tests__/components/login.test.tsx` importaba `LoginPage` de forma
    estática arriba del archivo — como ESM ejecuta los imports antes que
    cualquier código propio del archivo, `lib/authorized-emails.ts` (y su
    lista `authorizedEmails`, calculada una sola vez al importarse) ya se
    evaluaba con `process.env` vacío antes de que corriera el
    `vi.stubEnv(...)` de cada `beforeEach` — el stub nunca tuvo efecto
    real. El test pasaba antes solo porque el email de prueba
    (`guillermoandrada@gmail.com`) coincidía por casualidad con el
    fallback hardcodeado que se acababa de sacar. Fix: import dinámico de
    `LoginPage` (`await import(...)`) después del stub en cada test,
    mismo patrón que ya usaban `admin.test.ts`/`authorized-emails.test.ts`
    correctamente. **Si aparece un test nuevo que hace `vi.stubEnv` sobre
    una env var que un módulo lee a nivel de módulo (no dentro de una
    función), el import del componente bajo test tiene que ser dinámico y
    posterior al stub — un import estático arriba del archivo lo fija
    antes.**
  - El usuario preguntó separado si el problema histórico (commit
    `6b3707c`, "GitHub Pages no exponía bien las env vars") había sido un
    tema de símbolos/encoding en las listas separadas por comas — no: fue
    otro bug, ya arreglado hace tiempo y sin relación (`admin.ts` en su
    versión original, commit `177d247`, comparaba `user.email === ADMIN_EMAIL`
    contra un único valor, sin `.split(",")` — con una lista de varios
    emails esa igualdad exacta nunca daba `true`; el `.split(",")` que
    arregló eso ya está desde ese commit). El de `6b3707c` fue que en ese
    momento la env var le llegaba vacía del todo en el build de GitHub
    Pages (0 emails, no 1) — motivo real por el que se había agregado el
    fallback que hoy se sacó.
- **Deploy bloqueado por el clasificador de modo automático** (categoría
  "Production Deploy", mismo tipo de bloqueo — no el mismo caso puntual —
  que ya bloqueó `supabase secrets set` en una sesión anterior):
  `supabase functions deploy zoom-apply-dispatch --use-api` no se
  ejecutó desde acá — lo corrió el usuario en su terminal.
- Suite verde: `npm run test:run` (141 tests), `npx tsc --noEmit`, `npm run
  lint`, y `deno check` sobre los archivos nuevos de `supabase/functions/`
  — los cuatro sin errores.
- **El usuario pegó un GitHub PAT real en texto plano en el chat** al
  cargar `GITHUB_PAT` (después de habérsele pedido explícitamente que
  corriera el comando él mismo sin pasar el valor por acá) — señalado en
  el momento, recomendada la rotación. Ver [[feedback-flag-shared-credentials]]
  (memoria nueva de esta sesión, mismo patrón que ya había pasado con una
  contraseña de Zoom en 2026-09-12).
- **Deploy + carga de secrets completados por el usuario.** Primera
  prueba real del botón "Sincronizar ahora" (local, admin real) reveló
  dos bugs nuevos, ambos arreglados y verificados en la misma sesión:
  1. **Redirect prematuro en `/dashboard/automatizacion`**: el componente
     tiene su propio `useAuth()` (estado independiente del que ya
     resolvió `AuthGuard` más arriba) — arranca en `user=null` hasta que
     resuelve su propia sesión, y el `useEffect` de control de acceso no
     esperaba ese `loading`, así que redirigía a `/dashboard` con
     `isAdmin(null)=false` antes de que la sesión real cargara. Bug
     preexistente desde el primer entregable de Fase 4 (2026-09-12), no
     de esta sesión — nunca se había notado porque el test de esa página
     mockea `useAuth` con `loading: false` fijo, sin cubrir el estado de
     carga real. Fix: esperar `authLoading` antes de decidir, mismo
     patrón que `AuthGuard`; se agregó un test que cubre justo este caso.
  2. **CORS faltante en `zoom-apply-dispatch`**: primera Edge Function de
     este proyecto invocada directo desde el browser
     (`supabase.functions.invoke`) — `reconcile`/`zoom-apply` nunca lo
     necesitaron por ser server-to-server. Sin headers CORS ni manejo del
     preflight `OPTIONS`, el browser bloqueaba el POST real
     ("Failed to send a request to the Edge Function", sin llegar a
     ejecutar nada del lado servidor). Fix:
     `supabase/functions/_shared/cors.ts` (`corsHeaders`,
     `handleCorsPreflight`), aplicado en `admin-auth.ts` y en
     `zoom-apply-dispatch/index.ts`. **Reusar este módulo en cualquier
     próxima Edge Function que use `requireAdmin`** — todas se invocan
     igual, desde el browser de un admin.
  - Ambos fixes redeployados por el usuario y **verificados de punta a
    punta contra la cuenta real**: click en el botón → `{"ok":true}` →
    corrida de GitHub Actions disparada (run `34770345918`) → terminó en
    verde (52s) sin capturas de falla. Botón "Sincronizar ahora" cerrado,
    Fase 4 sin pendientes de este entregable.

## 2026-09-13 (misma fecha, nueva sesión) — Editor de horario (`schedule-write`)

Último punto pendiente de Fase 4 (acciones de fila y form de excepción
quedan para más adelante, elegido así por el usuario). Se usó
`/EnterPlanMode` antes de codear — plan en
`~/.claude/plans/eager-sniffing-giraffe.md`.

- **Hallazgo importante, encontrado leyendo el código antes de escribir
  nada**: `expand()` arma cada `DesiredOccurrence` con `agenda: null`
  siempre (es un generador de calendario puro, no sabe nada de WOL). Si
  la función SQL que aplica un `update` de `diffOccurrences` hubiera
  escrito ese `agenda` tal cual, **cualquier edición de horario habría
  borrado la agenda ya sincronizada** de las próximas ocurrencias — y ese
  blank se habría propagado al PATCH real de Zoom vía `zoom_outbox`,
  mismo tipo de bug que ya se había evitado una vez con `join_url` en
  Fase 2. Se resolvió en la función SQL: `schedule_write_update_occurrence`
  nunca recibe `agenda` como parámetro, la relee de la fila recién
  actualizada (`returning agenda`) y la reusa tal cual en el payload del
  outbox. Documentado con un comentario explícito en la migración para que
  nadie lo "simplifique" mal en el futuro.
- **Migración `20260913120000_schedule_write_functions.sql`**: dos
  funciones `SECURITY DEFINER` nuevas,
  `schedule_write_update_occurrence`/`schedule_write_cancel_occurrence` —
  a diferencia de `reconciler_upsert_occurrence`/`reconciler_cancel_occurrence`
  (que escriben por fecha, para el reconciliador diario), estas escriben
  por **`id`** de ocurrencia, porque el emparejamiento posicional de
  `diffOccurrences` ya resuelve qué fila existente corresponde a cada
  cambio — escribir por fecha acá habría dejado duplicados cuando cambia
  el día/hora. `create` reutiliza `reconciler_upsert_occurrence` sin
  cambios (insertar por fecha nueva no tiene el mismo problema).
- **Lógica pura nueva** en
  `supabase/functions/_shared/reconciler/schedule-write.ts`
  (`computeScheduleWriteOps`): wrapper delgado sobre `expand()` +
  `diffOccurrences()` (ya escritos y testeados en Fase 1, sin consumidor
  real hasta ahora), mismo horizonte de 1 mes que `reconcileMonth`. 5
  tests nuevos en `__tests__/reconciler/schedule-write.test.ts` (cambio de
  hora pura sin `previousTopic`, cambio de día con `previousTopic`, actual
  más corto → `create`, actual más largo → `cancel`, sin cambios → `[]`).
- **Edge Function nueva** `supabase/functions/schedule-write/index.ts`,
  mismo esqueleto que `zoom-apply-dispatch` (`requireAdmin` + CORS, ya
  reusables sin cambios). El diff se recalcula **siempre** contra el
  estado real de la base, tanto en preview (`commit:false`) como en el
  guardado (`commit:true`) — nunca confía en un diff mandado por el
  cliente, así no importa cuánto tiempo pase entre "Ver cambios" y
  "Confirmar". `commit:true` aplica cada op con `try/catch` individual
  (una que falla no frena a las demás, mismo principio que
  `reconcileMonth`) y devuelve `errors: []` — el frontend nunca asume
  éxito silencioso.
- **Alcance decidido con el usuario**: solo día/hora/duración son
  editables (zona horaria fija, se muestra pero no se edita; `kind` no se
  toca — no hay alta de schedules nuevos en esta iteración). Guardar
  **no** dispara sync automático a Zoom — el admin sigue usando
  "Sincronizar ahora" por separado, o espera el backstop de 2 días.
- **Frontend**: `components/schedule-editor-dialog.tsx` (nuevo, mismo
  esqueleto de dos pasos que `zoom-import-dialog.tsx`: form → preview en
  texto plano, con líneas "Crear/Mover/Actualizar/Cancelar — fecha"),
  botón "Editar horario" en cada card de `/dashboard/automatizacion`.
  `lib/automation.ts#writeSchedule` (mismo patrón no-throw que
  `triggerZoomSync`) + `WEEKDAY_LABEL` movido ahí desde `page.tsx` para
  reusarlo en el diálogo.
- Suite verde: `npm run lint`, `npm test` (147 tests, +6 nuevos), `npm run
  build` (incluye `tsc`), y `deno check` sobre los dos archivos nuevos de
  `supabase/functions/` — los cuatro sin errores.
- **Deploy real hecho en esta misma sesión** (autorizado explícitamente
  por el usuario, incluida la prueba manual): `supabase db push`
  (migración aplicada) + `supabase functions deploy schedule-write
  --use-api` — a diferencia de sesiones anteriores, esta vez el
  clasificador de modo automático no bloqueó ninguno de los dos comandos.
- **Verificado de punta a punta contra el proyecto real**, con un login
  admin generado server-side (`supabase.auth.admin.generateLink`, service
  role, sin mandar el mail — evita depender del inbox del usuario) sobre
  `npm run dev` local apuntando al Supabase real:
  - **Preview contra datos reales** (`commit:false`, cero escrituras):
    con `meeting_occurrences` todavía vacía en producción (`reconcile`
    real nunca corrió — pendiente ya anotado antes), el editor mostró
    correctamente 4 "Crear" para los próximos jueves. Confirma gate de
    admin + lectura real + `expand()` funcionando en producción.
  - **Caso crítico (preservar `agenda` en un `update`)**: como no hay
    ocurrencias reales para probar un `update` real, se insertaron 4 filas
    sintéticas vía `service_role` (3 idénticas a lo que `expand()` iba a
    generar, para confirmar que el dirty-check no las toca; 1 con
    `duration_minutes` distinto + una `agenda`/`zoom_meeting_id`/`join_url`
    falsos simulando una reunión ya sincronizada con contenido real de
    WOL). El editor mostró exactamente **1 "Actualizar (duración)"** y,
    al confirmar, `schedule_write_update_occurrence` actualizó
    `duration_minutes` a 120 preservando `agenda`/`join_url`/`passcode`/
    `zoom_meeting_id` intactos, y encoló en `zoom_outbox` un job
    `action:"update"` (no `create`, detectó el `zoom_meeting_id`
    existente) con `payload.agenda` igual al texto real preservado — el
    hallazgo de diseño de arriba, confirmado funcionando contra la base
    real. Las 3 filas idénticas no generaron ningún job. `meeting_schedules`
    no se tocó (mismos valores, dirty-check también ahí).
  - Limpieza inmediata después: se borraron las 4 filas sintéticas y su
    job de outbox — `meeting_occurrences`/`zoom_outbox` quedaron en 0,
    igual que antes de la prueba. **No se clickeó "Sincronizar ahora" en
    ningún momento** — la cuenta real de Zoom no se tocó en esta
    verificación.
  - **Pendiente real, ya anotado antes y sin cambios**: `meeting_occurrences`
    sigue vacía en producción — falta correr `reconcile` de verdad al
    menos una vez (bloqueado por el clasificador al rotar
    `RECONCILE_INTERNAL_TOKEN`, tarea aparte de esta).
- Editor de horario (Fase 4) **cerrado**: implementado, deployado y
  verificado.

## 2026-09-13 (misma fecha, nueva sesión) — Acciones de fila (`occurrence-action`)

Siguiente punto de Fase 4: Marcar Asamblea, Marcar Conmemoración, Crear
igual sin contenido, Cancelar esta reunión, Mover a otro día. Se usó
`/EnterPlanMode` — plan en `~/.claude/plans/eager-sniffing-giraffe.md`.

- **Dos decisiones de alcance resueltas con el usuario antes de codear**:
  1. Marcar Conmemoración necesita su propio selector de fecha/hora (cae
     en una fecha del calendario lunar, no el día regular de reunión) y sí
     crea un link de Zoom real, con topic fijo `"Conmemoración"`.
  2. **Se detectó en el momento** que restringir "Mover a otro día" a
     filas `blocked` (como decía el checklist original) lo dejaba
     inutilizable para el caso que lo motivó: una visita del
     Superintendente de Circuito no genera una fila bloqueada (WOL sigue
     teniendo contenido normal esa semana, el reconciliador la trataría
     como una semana cualquiera). Se lo señalé al usuario en el momento en
     vez de seguir con el alcance que él mismo había elegido antes sin
     saber esto — decisión final: el botón queda disponible en
     **cualquier fila** (`blocked`/`pending`/`synced`), no solo
     bloqueadas.
- **Hallazgo de diseño, el más importante de esta pieza**: `reconcileWeek`
  reevalúa cada semana desde cero en cada corrida. Si una acción solo
  cancela una fila (`status='cancelled'`) sin una excepción real en
  `schedule_exceptions`, la guarda de `reconciler_upsert_occurrence`
  (`where status is distinct from 'cancelled'`) la **revive** apenas WOL
  siga teniendo contenido esa fecha. Por eso "Cancelar esta reunión" y
  "Mover a otro día" escriben una excepción real (`kind:'no_meeting'`/
  `'special_event'`), no solo tocan `meeting_occurrences`. "Marcar
  Conmemoración" no tiene este problema (la fila de origen queda
  `blocked`, no `cancelled` — `markBlocked` es idempotente y no la
  revive), así que **no toca la fila bloqueada de origen**, solo agrega
  la ocurrencia manual nueva. "Crear igual sin contenido" sí reusa el
  slot bloqueado, así que en vez de una excepción usa `pinned=true` (la
  válvula ya documentada para esto) — sin el pin, la siguiente corrida
  vuelve a taparlo con el badge "Bloqueada" aunque el link de Zoom ya esté
  creado.
- **Sin migración nueva**: las 4 acciones reusan `schedule_write_cancel_occurrence`
  (Fase 4, editor de horario) y `reconciler_upsert_occurrence` (Fase 1/2)
  para las escrituras reales, más un `insert` directo a
  `schedule_exceptions` y un `update({pinned:true})` — ninguno necesita
  una función SQL nueva.
- **Lógica pura nueva** en
  `supabase/functions/_shared/reconciler/occurrence-actions.ts`:
  `siblingWeekDate` (la fecha del otro schedule en la misma semana ISO,
  para que "Marcar Asamblea" suprima siempre ambas reuniones) y
  `defaultAssemblyLabel` (texto default "Asamblea (semana lunes al
  domingo)" cuando no se carga lugar), ambas reusando `occurrenceDateForWeek`/
  `isoWeekKeyForInstant` ya escritas y testeadas en Fase 1 sin consumidor
  real hasta ahora. 5 tests nuevos en `__tests__/reconciler/occurrence-actions.test.ts`,
  incluido el borde de semana ISO 53 (mismo caso ya cubierto en
  `expand.test.ts`).
- **Edge Function nueva** `supabase/functions/occurrence-action/index.ts`
  (mismo esqueleto `requireAdmin`+CORS que `schedule-write`), sin
  preview/dry-run — son acciones puntuales de una fila, el form del
  diálogo (`components/occurrence-action-dialog.tsx`, nuevo) es la única
  salvaguarda.
- Suite verde: `npm run lint`, `npm test` (152 tests, +5 nuevos), `npm run
  build`, `deno check` sobre `occurrence-action` y de paso sobre
  `schedule-write`/`reconcile`/`zoom-apply-dispatch` (nada roto) — los
  cuatro sin errores.
- **Deploy bloqueado por el clasificador de modo automático** (categoría
  "Production Deploy") — a diferencia del deploy de `schedule-write`, que
  sí había pasado en esta misma sesión un rato antes. El comportamiento
  del clasificador no fue consistente entre ambos deploys. **El usuario
  corrió el deploy él mismo** (`supabase functions deploy occurrence-action
  --use-api`), verde.
- **Verificado de punta a punta contra el proyecto real**, mismo mecanismo
  de login que el editor de horario (`supabase.auth.admin.generateLink`,
  sin mandar mail) + 6 filas sintéticas vía `service_role` (una por
  escenario, incluida una `synced` con `zoom_meeting_id` falso para
  probar "Mover a otro día" fuera de una fila bloqueada). Las 5 acciones
  se probaron **desde el dashboard real**, con verificación en la base
  después de cada una:
  - **Cancelar**: excepción `no_meeting` bien formada, ocurrencia
    `cancelled`. Sin `zoom_meeting_id` no encoló nada en `zoom_outbox`
    (correcto: nunca se había sincronizado).
  - **Marcar Conmemoración**: nueva ocurrencia `origin='schedule'`,
    `topic:"Conmemoración"`, en la fecha propia elegida en el form. La
    fila bloqueada de origen quedó intacta, tal como se diseñó.
  - **Crear igual sin contenido**: la fila pasó de `blocked` a `pending`
    con el topic real, sin tocar el flujo de agenda.
  - **Marcar Asamblea — encontró un bug real, arreglado y reverificado**:
    primer intento tiró `500 {"error":"Invalid time value"}`. Causa: el
    "otro" `meeting_schedules` se leía crudo de Postgres (`local_time`
    snake_case) y se pasaba tal cual a `siblingWeekDate`, que espera el
    tipo `Schedule` puro (`localTime` camelCase) — `occurrenceDateForWeek`
    armaba una fecha con `Tundefined` y explotaba al hacer
    `.toISOString()`. Fix: mapear la fila a `{weekday, localTime:
    local_time, timezone}` antes de pasarla. Redeployado (esta vez sin
    bloqueo del clasificador) y reverificado: canceló ambas fechas de la
    semana (jueves y sábado), encoló el job real de cancelación para la
    que ya tenía Zoom, y la excepción quedó con las dos fechas
    (`event_days`) y el label default correcto
    ("Asamblea (semana 14/09 al 20/09)").
  - **Mover a otro día**, probado justo en el caso que lo motivó (fila
    `synced`, no bloqueada): canceló la fecha original preservando
    `zoom_meeting_id`/`join_url` en la fila (encoló el `cancel` real en
    `zoom_outbox`), escribió la excepción `special_event`, y creó la
    ocurrencia nueva con el topic recalculado para el día real
    ("Reunión de entresemana - Martes 20/10" — el `buildTopic` sigue la
    fecha real, no el weekday del schedule).
  - Limpieza total al final: 0 ocurrencias, 0 excepciones, 0 jobs de
    outbox — igual que antes de la prueba. Nunca se tocó "Sincronizar
    ahora" ni la cuenta real de Zoom.
- Acciones de fila (Fase 4) **cerradas**: implementadas, deployadas y
  verificadas.

## 2026-09-13 (misma fecha, nueva sesión) — Form de excepción genérico (`exception-create`), Fase 4 cerrada

Último punto de Fase 4. Se usó `/EnterPlanMode` — plan en
`~/.claude/plans/eager-sniffing-giraffe.md`.

- **Diferencia clave con lo ya implementado**: "Marcar Asamblea"/
  "Cancelar" (sesión anterior, `occurrence-action`) solo actúan **sobre
  una fila que ya existe**. Este form declara la excepción **de forma
  proactiva**, antes de que el reconciliador haya llegado a calcular esa
  semana — caso real: cargar hoy una asamblea que va a pasar en 2 meses.
- **Dos decisiones confirmadas con el usuario antes de codear**: (1)
  alcance limitado a Asamblea + Acontecimiento especial — "Sin reunión"
  suelto queda afuera, se sigue resolviendo desde la fila real cuando
  llegue el momento; (2) si ya había una fila calculada para alguna fecha
  afectada, se cancela en el mismo submit (mismo comportamiento que
  "Marcar Asamblea"/"Mover a otro día").
- **Lógica pura nueva** en `occurrence-actions.ts` (mismo archivo de la
  sesión anterior): `weekdayOfDateString` (día de semana de un
  "yyyy-MM-dd" en calendario puro, sin huso horario — `event_days` no
  tiene componente de hora) y `matchingOccurrenceDates` (de una lista de
  `event_days`, las que coinciden con el weekday de un schedule,
  convertidas al instante real donde existiría esa ocurrencia). 3 tests
  nuevos, 155 en total.
- **Edge Function nueva** `supabase/functions/exception-create/index.ts`:
  para Asamblea, generaliza el mecanismo de `mark_assembly` (que parte de
  una fila existente) a partir de una fecha suelta — calcula la semana
  ISO con `isoWeekKeyFromCalendarDate` y la fecha real de **cada**
  schedule activo con `occurrenceDateForWeek` (ambas de Fase 1, sin
  hardcodear "2 schedules"). Para Acontecimiento especial, usa
  `matchingOccurrenceDates` por cada schedule tildado en `suppresses`.
  Ambos casos cancelan (mismo RPC `schedule_write_cancel_occurrence`) 
  cualquier ocurrencia ya calculada en esas fechas. Sin preview, mismo
  criterio que `occurrence-action`.
- **Frontend**: `components/exception-create-dialog.tsx` (nuevo,
  selector de tipo + mini-form), botón "Nueva excepción" en el header de
  `/dashboard/automatizacion`. El pre-marcado de los checkboxes "Suprime
  Entresemana/Fin de semana" en Acontecimiento especial se calcula
  **en el cliente** (no hace falta ida y vuelta al servidor: `schedules`
  ya está cargado en la página), recalculado cada vez que cambia la
  lista de fechas.
- Suite verde: `npm run lint`, `npm test` (155 tests), `npm run build`,
  `deno check` sobre los 5 Edge Functions de la feature — todo sin
  errores. Deploy sin bloqueo del clasificador esta vez.
- **Verificado de punta a punta contra el proyecto real**: mismo
  mecanismo de login (`generateLink`, sin mandar mail) + 3 filas
  sintéticas `synced` con `zoom_meeting_id` falso (jueves+sábado de una
  semana para Asamblea, un jueves de otra semana para Acontecimiento
  especial). **Asamblea**: fecha cargada un viernes cualquiera de la
  semana → encontró y canceló las dos filas reales (jueves y sábado),
  excepción con `event_days` de ambas fechas y label default correcto
  ("Asamblea (semana 02/11 al 08/11)"), dos jobs reales de cancelación
  encolados. **Acontecimiento especial**: el checkbox "Entresemana" se
  pre-marcó solo (la fecha cargada era jueves), confirmado sin tocarlo →
  excepción con `suppresses:['midweek']`, la fila existente cancelada,
  job real encolado. Limpieza total al final (0 ocurrencias/excepciones/
  jobs). Nunca se tocó "Sincronizar ahora" ni la cuenta real de Zoom.
- **Fase 4 completa**: vista de mes, gate de admin, botón "Sincronizar
  ahora", editor de horario, acciones de fila y form de excepción — los
  6 entregables implementados, deployados y verificados contra el
  proyecto real. Sigue Fase 5 (cron real + drift-check + retiro del
  flujo manual).

## 2026-09-13 (misma fecha, nueva sesión) — Fase 5: cron real de `reconcile` + auto-disparo a Zoom

Primer punto de Fase 5. Se usó `/EnterPlanMode` — plan en
`~/.claude/plans/eager-sniffing-giraffe.md`. Confirmado con el usuario
antes de codear: `wol-enrich` no se crea (decisión ya tomada en Fase 3,
el checklist de `ROADMAP.md` solo tenía texto desactualizado), el
auto-disparo a Zoom va en el mismo cambio (no por etapas), y `drift-check`
queda afuera de esta ronda (bloqueado por la misma falta de acceso a la
API REST de Zoom que pausó Fase 2 — la única vía viva es Playwright, que
hoy no sabe "listar todo y comparar").

- **`reconcile` ahora dispara el auto-sync al terminar** (solo en
  corridas reales, nunca en `dryRun`): llama `dispatchZoomApplyWorkflow`
  **directo** (la función pura que ya usaba `zoom-apply-dispatch`), no a
  través de esa Edge Function — `zoom-apply-dispatch` usa `requireAdmin`
  (gate de JWT de sesión, pensado para el browser de un admin) y
  `reconcile` es server-to-server, sin JWT de usuario, así que pasar por
  ahí hubiera fallado siempre. Envuelto en `try/catch`, un fallo del
  dispatch no tira abajo la respuesta de `reconcile` (que ya escribió
  todo lo suyo) — se agrega `dispatched: {ok, error?}` a la respuesta.
- **Migración `20260913150000_reconcile_cron.sql`**: `cron.schedule`
  (pg_cron/pg_net ya habilitados desde Fase 0) con un solo
  `select net.http_post(...) from meeting_schedules where active = true`
  — dispara un `net.http_post` **independiente por fila**, el driver que
  faltaba desde Fase 0/2-bis (antes hardcodeaba los 2 IDs, ahora
  generaliza a lo que esté `active`). El token nunca va en la migración
  (secret real) — se lee de Supabase Vault por nombre
  (`reconcile_internal_token`); el usuario lo carga aparte, nunca por
  acá. `'0 6 */2 * *'` es una aproximación aceptada de "cada 2 días"
  (días impares del calendario, puede dar 1 o 3 días de separación en un
  cambio de mes) — es un backstop, no una garantía exacta.
- **Carga del secret de Vault — dos intentos bloqueados, uno exitoso**:
  intenté generar el token y cargarlo yo mismo (`supabase secrets set` +
  `supabase db query` con `vault.create_secret`) — bloqueado por el
  clasificador de modo automático (categoría "Secret-Store Writes"). El
  usuario lo hizo él mismo, pero **pegó el valor generado en el chat dos
  veces** (una vez la salida de `openssl rand -hex 32`, otra vez el
  comando completo `supabase secrets set RECONCILE_INTERNAL_TOKEN=...`)
  pese a que se le pidió explícitamente no hacerlo — señalado las dos
  veces, mismo patrón que ya había pasado antes en esta sesión (ver
  [[feedback-flag-shared-credentials]]). La tercera vez sí lo hizo bien
  (bloque completo en su propia terminal, sin pegar ni el comando ni la
  salida) y confirmó éxito pegando solo el resultado de
  `vault.create_secret` (un UUID, no el secreto).
- **Deploy sin bloqueo esta vez**: `supabase db push` +
  `supabase functions deploy reconcile --use-api`, ambos corridos por mí
  sin que el clasificador interviniera (a diferencia de otros deploys de
  esta sesión, donde sí bloqueó).
- **Verificación real, autorizada explícitamente por el usuario**: en vez
  de esperar hasta 2 días al primer disparo del cron, se disparó una vez
  a mano el mismo `net.http_post` (vía `supabase db query`, corrido por
  el usuario — a mí me bloqueó el clasificador con "Production Deploy").
  Resultado:
  - `reconcile` corrió para los 2 schedules, **0 issues** — creó **12
    ocurrencias reales** (6 entresemana + 6 fin de semana, hasta el
    17/10) con **agenda real de WOL** (títulos y URLs reales de
    wol.jw.org), 12 jobs `create` encolados en `zoom_outbox`. Primera vez
    que `meeting_occurrences` deja de estar vacía en producción —
    pendiente desde Fase 4.
  - El auto-disparo nuevo **funcionó**: las dos llamadas a `reconcile`
    (una por schedule) dispararon, cada una, su propio
    `zoom-apply-browser` — dos corridas de GitHub Actions casi
    simultáneas, ambas terminaron en verde.
  - **Bug real encontrado, sin arreglar todavía**: los 12 jobs quedaron
    `pending` — las dos corridas fallaron **desde el primer job**,
    mismo error en las dos: `locator.click: Timeout 30000ms exceeded`
    esperando `getByRole('button', { name: 'Schedule a Meeting' })`.
    Se descartó la hipótesis de que fuera la concurrencia de las dos
    corridas simultáneas peleando por la misma sesión de Zoom: se
    disparó una **tercera corrida sola** (sin concurrencia) y falló
    exactamente igual, desde el primer job también. **Apunta a que la
    sesión de Zoom capturada expiró** — riesgo ya documentado
    explícitamente desde Fase 2-bis ("la sesión expira en algún momento
    no documentado por Zoom, hay que recapturarla a mano cuando pase").
    No se pudo confirmar visualmente (las capturas de pantalla de falla
    se guardan en el runner pero el step de subirlas como artifact no
    corrió — **gotcha nuevo, sin investigar**: el job de GitHub Actions
    reporta éxito general aunque jobs individuales del outbox fallen
    puertas adentro, así que el `if: failure()` del step de upload nunca
    dispara).
  - Los 12 jobs siguen reintentando solos (backoff exponencial, sin
    causar daño real — no hay riesgo de duplicar nada, `dequeue_zoom_jobs`
    usa `for update skip locked`). **Decisión del usuario: dejarlo
    documentado y no recapturar la sesión en esta sesión** — la cadena
    completa (cron → reconcile → outbox → dispatch → GitHub Actions) está
    verificada y funcionando; lo único pendiente es el último tramo
    (Playwright contra Zoom real), bloqueado por algo ajeno a los cambios
    de hoy.
- Suite verde: `npm run lint`, `npm test` (155 tests, sin cambios — no
  hubo lógica pura nueva), `npm run build`, `deno check` sobre
  `reconcile/index.ts` — sin errores.
## 2026-09-13 (misma fecha, continuación) — Sesión de Zoom recapturada, confirmada funcionando

El usuario recapturó la sesión él mismo (`npm run zoom:capture-session`,
login interactivo — no lo puedo hacer yo, el script existe justamente
para nunca scriptear el login).

- **La sesión nueva pesa más que la vieja**: 187 KB en crudo, ~244 KB en
  base64 — no entraba en los 5 secrets de ~20 KB que usaba el workflow
  hasta ahora (nunca se identificó el motivo del crecimiento; capturas
  futuras podrían volver a crecer). Se partió en **13 chunks** de 20 KB
  (verificado byte a byte que la concatenación reconstruye el archivo
  original antes de subir nada) y se subieron como
  `ZOOM_SESSION_STATE_B64_1`.._`13` — `gh secret set` no fue bloqueado
  por el clasificador (a diferencia de los secrets de Supabase). Se
  actualizó `.github/workflows/zoom-apply-browser.yml` para reconstruir
  de los 13 (antes hardcodeaba 5).
- **De paso, se arregló el `if: failure()` que nunca disparaba** en el
  step de subir capturas de pantalla de fallas (encontrado y anotado sin
  arreglar en la verificación anterior de hoy): `apply.ts` atrapa el
  error de cada job del outbox y sigue con el próximo, así que el step
  "Aplicar jobs pendientes" nunca sale con código de error aunque jobs
  individuales hayan fallado — cambiado a `if: always()`.
- **Verificado con 3 corridas reales** (`gh workflow run` a demanda,
  drenando manualmente los 12 jobs que habían quedado pendientes de la
  corrida real del cron más temprano hoy): **9 de 12 se aplicaron
  bien**, con `zoom_meeting_id`/`join_url` reales — confirma que el
  problema real era la sesión expirada, no el cron/dispatch de hoy.
- **Dos bugs nuevos encontrados, sin arreglar, distintos entre sí y de la
  sesión expirada**:
  1. **Jobs para fechas ya pasadas** (10/09, 12/09 — la primera semana
     que calcula `reconcile` puede caer parcialmente en el pasado si
     "ahora" cae después del día de reunión de esa semana): Zoom
     deshabilita el botón del datepicker para una fecha pasada, no se
     puede agendar — error `getByRole('button', { name: 'Saturday,...'
     })`, botón con `aria-disabled="true"`. No es un bug de Playwright,
     es una consecuencia lógica de intentar crear una reunión en el
     pasado.
  2. **Jobs para fechas futuras (15/10, 17/10) con un error de UI
     distinto**: un ícono de flecha (chevron) no se puede clickear
     — `element intercepts pointer events`, reintentado ~75 veces sin
     éxito. Parece timing/selector de Playwright, no relacionado con la
     sesión.
  Ambos van a terminar en `status:'failed'` solos tras 5 intentos
  (backoff exponencial), sin causar ningún daño — quedan como pendiente
  real para la próxima sesión, junto con `drift-check` (sin diseñar).

## 2026-09-13 (misma fecha, continuación) — Arreglado: fechas ya pasadas

- **Causa raíz confirmada**: `reconcileMonth` arma su horizonte con
  `isoWeeksBetween(now, addMonths(now, 1))`, y la primera semana de esa
  lista es la que **contiene** a `now` — no la que empieza en `now`. Si
  el día de reunión del schedule (ej. jueves) ya pasó dentro de esa
  semana calendario cuando corre `reconcile` (ej. corre un domingo), la
  fecha calculada por `occurrenceDateForWeek` queda en el pasado, y
  `reconcileWeek` la trataba como cualquier otra — creaba/actualizaba la
  ocurrencia igual, y Zoom no puede agendar ahí. **No es un caso raro de
  la primera corrida**: con el cron cada 2 días, va a repetirse cada vez
  que la corrida caiga después del día de reunión de esa semana.
- **Fix**: `reconcileWeek` ahora recibe `now` como parámetro y corta
  antes de tocar excepciones/WOL si `date < now` — no genera ningún
  `Issue` (saltear una semana ya pasada no es un problema a reportar, es
  el comportamiento esperado). `supabase/functions/_shared/reconciler/reconcile.ts`,
  `supabase/functions/reconcile/index.ts` no cambió (ya pasaba `now` a
  `reconcileMonth`, que ahora lo reenvía a `reconcileWeek`).
- **2 tests nuevos** (157 en total): `reconcileWeek` con `now` después
  del día de reunión de esa semana → sin issues, sin tocar WOL/ports;
  `reconcileMonth` reproduciendo el bug real (semana 37 con `now`
  cayendo un domingo, después del jueves de esa semana) → esa semana se
  salta sola, el resto del horizonte se procesa normal. Se actualizaron
  las 6 llamadas existentes a `reconcileWeek` en los tests (nuevo
  parámetro `now` requerido) — todas usaban semanas futuras respecto al
  `now` que ya tenían, sin cambio de comportamiento.
- Suite verde: `npm run lint`, `npm test` (157 tests), `npm run build`,
  `deno check` — sin errores. Deploy de `reconcile` corrido sin bloqueo
  del clasificador.
- **Limpieza de los 2 registros huérfanos en producción**: las
  ocurrencias del 10/09 y 12/09 (creadas antes del fix) se cancelaron
  (`schedule_write_cancel_occurrence`, razón `past_date`) y se borraron
  sus 2 jobs de `zoom_outbox` que venían reintentando sin poder
  aplicarse — nunca hubiera pasado nada malo (Zoom rechazaba la fecha),
  pero hubieran terminado en `status:'failed'` sin necesidad.
## 2026-09-13 (misma fecha, continuación) — Arreglado: chevron del datepicker

- **Causa raíz encontrada por inspección del DOM real** (autorizado
  explícitamente por el usuario — sesión de Playwright aparte contra la
  cuenta real, solo lectura, sin crear ni guardar ninguna reunión): el
  selector `.zoom-icon.zoom-inline-chevron-icon > svg > path` con
  `.first()` era ambiguo — esa misma clase la comparten los chevrons de
  los combobox de Duration, Time Zone, y otros (se encontraron 9
  elementos en la página con esa clase). `.first()` agarraba el que
  aparece antes en el DOM, no el del calendario, y el click terminaba
  interceptado por elementos sin relación (`header_container`, otros
  `<svg>`) — de ahí el timeout de 30s reintentando ~75 veces.
- **El botón real de "mes siguiente" tiene accessible name propio**,
  sin ambigüedad: `aria-label="Next month"` (confirmado volcando el HTML
  real del popup del calendario, ancla en `zoom-date-panel__header`).
  Fix: `page.getByRole("button", { name: "Next month" })` — mismo patrón
  que ya usa el resto de `zoom-browser.ts` (accesible por rol, no por
  clase CSS interna).
- **Verificado en dos pasos, sin usar el flujo real hasta confirmar**:
  primero un click real aislado (fuera de `createMeeting`, sin guardar
  nada) que avanzó el calendario de September 2026 a October 2026 y
  expuso el botón del 15/10 — confirmado antes de deployar. Después,
  deployado y corrido `zoom-apply-browser` contra los 2 jobs reales que
  habían quedado pendientes (26, 27, fechas 15/10 y 17/10): **los 2 se
  aplicaron bien**, reuniones de Zoom reales creadas.
- **Resultado final: las 12 ocurrencias creadas por la primera corrida
  real del cron quedaron completamente resueltas** — 2 canceladas
  (fechas pasadas, fix de la sección anterior) + 10 sincronizadas con
  reuniones de Zoom reales (`zoom_meeting_id`/`join_url` reales). Cadena
  completa verificada de punta a punta: cron → `reconcile` → `zoom_outbox`
  → auto-disparo → `zoom-apply-browser` → Zoom real.
- `zoom-automation/` no tiene suite de tests unitarios (browser
  automation, se verifica empíricamente contra el DOM real, mismo
  criterio que el resto de este módulo) — `npx tsc --noEmit` con su
  propio `tsconfig.json` sí corrido, sin errores.
- **Pendiente real**: `drift-check` sigue sin diseñar (bloqueado por la
  misma falta de acceso a la API REST de Zoom que pausó Fase 2). El
  resto de Fase 5 (retirar el flujo manual, actualizar README/ARCHITECTURE)
  también sigue pendiente.

## 2026-09-13 (misma fecha, continuación) — Arreglado: horario fijo en 18:00 + detección de duplicados

El usuario revisó la cuenta real de Zoom (no la vista de mes del admin)
y encontró dos problemas con capturas de pantalla.

- **Reuniones duplicadas — diagnosticado, no es un bug**: `/dashboard`
  (lo que usa la congregación) lee de la tabla vieja `meetings`
  (`lib/meetings.ts`, flujo manual), no de `meeting_occurrences` — las 10
  reuniones nuevas de la automatización conviven en paralelo con la
  reunión vieja manual, sin pisarla ni reemplazarla. No es caché ni un
  bug — es que el corte de Fase 5 ("retirar zoom-import-dialog/
  zoom-parser, pasar `/dashboard` a `meeting_occurrences`") todavía no
  pasó. Decisión del usuario: **dejar las dos en paralelo por ahora**, no
  improvisar el corte en esta sesión.
- **Horario fijo en 18:00 — bug real, encontrado y arreglado**. Causa
  raíz confirmada reproduciendo la secuencia completa de `createMeeting`
  contra la cuenta real, inspeccionando el valor del combobox de hora en
  cada paso:
  1. `setStartTime` escribe el valor con `combobox.fill(label)` +
     `combobox.press("Enter")` — esto deja el valor **visible en el
     input** ("19:00"), pero **no lo confirma en el estado interno de la
     app** (probablemente un componente controlado que no escucha el
     evento que dispara `press("Enter")` en este widget en particular).
  2. El siguiente paso, `setDuration`, abre y selecciona el combobox de
     horas de duración — esa interacción dispara un re-render del bloque
     de horario que **pisa el input de hora con su valor "real" (el
     default, la hora actual redondeada — "18:00")**, perdiendo el
     "19:00" tipeado sin ningún error visible.
  3. Por eso las 12 ocurrencias de la primera corrida real quedaron
     **todas** a las 18:00 (coincidencia: igual al horario real del
     sábado, por eso solo se notó en las reuniones de jueves).
  - **Fix**: en vez de `press("Enter")`, clickear la opción del dropdown
    (`getByRole("option", { name: label, exact: true })`) — mismo patrón
    que ya usa `setDuration` con éxito, que sí genera un evento que el
    componente escucha. Verificado reproduciendo la secuencia completa de
    nuevo: el valor sobrevive a la selección de duración.
  - `setStartTime` es compartido por `createMeeting` y `updateMeeting`, el
    fix cubre ambos caminos con un solo cambio.
- **Corregidas las 10 reuniones reales ya creadas**: script puntual (no
  commiteado) usando `ZoomBrowserClient.updateMeeting` directo — mismo
  mecanismo que ya usa `apply.ts`, reusando el código real en vez de un
  script ad-hoc — con los valores correctos (`starts_at`/`topic`/`agenda`/
  `duration_minutes`) leídos de `meeting_occurrences`. Las 10 corrieron
  sin error, y se verificó **una por una contra Zoom real** (no solo
  confiar en la ausencia de excepciones, mismo criterio de siempre): las
  10 muestran el horario correcto (jueves 19:00 / sábado 18:00, zona
  "Buenos Aires, Georgetown") y el `join_url` de cada una **no cambió**
  (el mecanismo de "Edit" preservó el link).
- Ambos diagnósticos (chevron ayer, horario hoy) se hicieron con el mismo
  método: reproducir la secuencia real paso a paso contra la cuenta real
  (autorizado, sesión Playwright aparte) e inspeccionar el DOM/valor en
  cada paso hasta encontrar el punto exacto donde diverge — no adivinar
  el selector/interacción a partir del mensaje de error solo.

## 2026-09-13 (misma fecha, continuación) — Docs: README/ARCHITECTURE/AGENTS al día con Fase 5

Ítem de `ROADMAP.md` ("Actualizar README/ARCHITECTURE/AGENTS como sistema
autoritativo"), elegido por el usuario entre los tres pendientes de
Fase 5 (los otros dos, `drift-check` y retirar el flujo manual, quedan
sin tocar — el segundo por decisión explícita de la sesión anterior).

- **`ARCHITECTURE.md`**: agregado un párrafo de Fase 5 (paralelo al de
  Fase 4 que ya existía) dejando explícito que el cron de `reconcile` está
  activo en producción y ya creó reuniones reales sin intervención manual,
  pero que `/dashboard` sigue leyendo la tabla vieja `meetings` — las dos
  conviven a propósito, no es un bug. Sumada la estructura de
  `supabase/functions/` y `zoom-automation/` al árbol de carpetas (no
  estaba, pese a ser ya una parte real y grande del sistema). Sumados dos
  gotchas nuevos a la lista existente: el patrón `fill()+Enter` que no
  confirma estado en combobox de Zoom (causa del bug de horario fijo) y
  selectores por clase CSS ambigüos en esa misma UI (causa del bug del
  chevron) — ambos ya estaban en `ZOOM_AUTOMATION.md`/este archivo, pero no
  en la lista de gotchas que un dev leería antes de tocar código.
- **`README.md`**: la nota sobre la automatización ya no dice "en
  construcción" sin más — ahora aclara que está activa en producción
  (cron real) pero todavía no reemplaza el flujo manual. Sumado
  `zoom-automation/` al árbol de carpetas del repo (faltaba).
- **`AGENTS.md`**: replicados los dos gotchas nuevos de arriba en la
  sección de gotchas de este archivo (que ya se declara "repetido de
  ARCHITECTURE.md, porque importan al codear").
- **De paso, corregidos dos datos ya incorrectos en `ZOOM_AUTOMATION.md`**
  (no era parte del pedido, pero quedaban activamente engañosos en el doc
  que `AGENTS.md` señala como fuente de verdad de esta feature): una fecha
  suelta "2026-09-25" que no correspondía a nada (la verificación real fue
  2026-09-12, confirmado contra este mismo archivo y `ROADMAP.md`), y la
  sección "Piezas" describía `zoom-apply-browser.yml` con "cron cada 10
  minutos" y 2 secrets de sesión — ambos desactualizados desde Fase 5 (sin
  `schedule:` a propósito, 13 secrets tras la recaptura). Reemplazada
  también la sección "Pendiente para activar el cron desatendido" (dada
  por completada, contradecía la decisión real de no activar `schedule:`)
  por una nota de estado actual con referencia cruzada a "Jobs (Fase 5)".
- Verificado `npm run lint` y `npm run build` en verde después de los
  cambios (solo texto de `.md`, ningún archivo de código tocado — la
  verificación es más por costumbre del repo que porque hubiera riesgo
  real).

## 2026-09-17 — Incidente de `cancelMeeting` (2026-09-14) resuelto de punta a punta

**Causa real de la 4ª falla, la que quedó sin diagnosticar el 2026-09-14**:
la sesión local de Playwright estaba vencida (aterrizaba en el login) —
confirmado con `ZOOM_HEADFUL=1 ZOOM_DEBUG_PAUSE=1 npx tsx
zoom-automation/debug-cancel.ts` corrido por el usuario en una terminal
real. Se recapturó la sesión (`npm run zoom:capture-session`) y se
verificó el ciclo completo cancelando de verdad, una por una con
confirmación visual, las 9 reuniones reales que habían quedado colgadas
del incidente (85959338220 y las 8 restantes) — las 9 pasaron la
verificación dura interna de `cancelMeeting` (revisa la lista real
"Próximas", no solo ausencia de excepción).

- Sumados `zoom-automation/debug-cancel.ts` (una reunión) y
  `debug-cancel-batch.ts` (varias en cadena, misma sesión de browser) como
  herramientas reusables para la próxima vez que haga falta diagnosticar
  o limpiar reuniones de prueba — a pedido explícito del usuario, no se
  borran.
- **La sesión de CI (los 13 `ZOOM_SESSION_STATE_B64_N` de GitHub) también
  estaba vieja** (misma edad que la que resultó vencida) — se resubió
  reusando el archivo local recién recapturado (sin loguearse una segunda
  vez). Verificado de punta a punta con un job real de `create` + `cancel`
  encolado a mano en `zoom_outbox` y corrido vía `zoom-apply-browser.yml`
  en CI: reunión real creada (ID 81273228199) y cancelada, ambas
  confirmadas contra Zoom real.
- Filas de prueba (`meeting_occurrences`/`zoom_outbox`) limpiadas después
  de cada prueba — no quedó nada de test en producción.

## 2026-09-17 (misma fecha, continuación) — `/dashboard` pasa a `meeting_occurrences`

Ítem pendiente de Fase 5 cerrado. Detalle en `ROADMAP.md`. Resumen: `app/dashboard/page.tsx`
ahora lee `getUpcomingOccurrences()` (`status==='synced'`, mismo margen de
2h post-inicio que ya usaba `getUpcomingMeetings`) con una card nueva de
solo lectura (`components/occurrence-meeting-card.tsx`, reusa
`OccurrenceWhatsAppShare`). Se sacaron de esta página los botones del
flujo manual viejo (Nueva Reunión/Importar CSV/Pegar desde Zoom) — el
código (`lib/meetings.ts`, `lib/zoom-parser.ts`, `meeting-form.tsx`,
`csv-import.tsx`, `zoom-import-dialog.tsx`) queda intacto como fallback
documentado, sin borrar. `e2e/helpers/mock-supabase.ts` generalizado a
multi-tabla (antes solo mockeaba `meetings`) para poder testear esto.

## 2026-09-17 (continuación) — Mensaje de WhatsApp: "Tesoros de la Biblia" real + "TEMA" de La Atalaya, sin URLs

A pedido del usuario: el enriquecimiento de wol.jw.org en el mensaje de
WhatsApp (no en el campo "Add Description" de Zoom — confirmado que ese
campo ni siquiera se muestra en la UI de Zoom, verificado en la prueba de
la reunión "TEST - creación" con agenda "Domicilio: Casa de Lorenzo
Munizaga") no debía traer URLs ni direcciones sueltas.

- `wol.ts`: nuevos parsers `parseTreasuresTitle` (título real del punto 1
  de "Tesoros de la Biblia", entresemana — ej. "Jehová recompensa a los
  que siempre le obedecen", sacado del mismo fetch que ya se hacía para
  `bibleReading`, sin fetch extra) y `parseWeekendTheme` (caja "TEMA" del
  artículo de estudio, fin de semana — nuevo 2º fetch a `item.url`, mismo
  criterio best-effort que `bibleReading`). Ambos verificados contra los
  fixtures reales ya existentes en el repo.
- `buildAgenda` (`reconcile.ts`) ahora recibe `kind` y arma contenido
  distinto por tipo, **sin URL en ningún caso**: entresemana es
  "Tesoros de la Biblia: {título}" + "Lectura de la Biblia: {cita}" (cae al
  título genérico si el scrape nuevo falla); fin de semana es título +
  tema + edición.
- `wol_week_cache`: columnas nuevas `midweek_treasures_title`/
  `weekend_theme` (migración `20260917190000`).
- `lib/automation.ts`: `buildOccurrenceShareMessage` usa un título corto
  por `scheduleKind` ("Reunión de entresemana"/"Reunión de fin de semana",
  sin fecha — `occurrence.topic` no cambia en el resto de la UI) y `>` en
  vez de `->`. `stripLinksFromAgenda` queda como defensa en profundidad.
- Deployado: `supabase db push` + `supabase functions deploy reconcile
  --use-api`. Verificado con un script descartable que arma los dos
  mensajes reales (entresemana/fin de semana) contra los fixtures —
  coinciden exactamente con lo pedido.

## 2026-09-17 (continuación) — Botón "Verificar sesión de Zoom" + `zoom:upload-session`

A pedido del usuario ("que no tenga obstáculo de arrancar y trabajar sin
problema" la próxima vez que la sesión de Zoom se venza sin aviso):

- `zoom-automation/check-session.ts` (nuevo): chequeo liviano, headless,
  sin tocar ningún job del outbox — navega a `#/upcoming` y decide
  viva/vencida mirando si aparece el botón de agendar o si redirigió a
  `/signin`. Escribe el resultado en la tabla nueva `zoom_session_checks`
  (migración `20260917200000`).
- `.github/workflows/zoom-session-check.yml` (nuevo): mismo mecanismo de
  restaurar sesión que `zoom-apply-browser.yml`, sin `schedule:`, a
  demanda. Verificado con `gh workflow run` real: `ok=true`, fila
  guardada.
- `_shared/github/dispatch-workflow.ts` generalizado a `dispatchWorkflow`
  (antes solo servía para `zoom-apply-browser.yml`); nueva Edge Function
  `zoom-session-check-dispatch` (admin-gated, mismo patrón que
  `zoom-apply-dispatch`). Redeployadas ambas Edge Functions.
- `/dashboard/automatizacion`: botón "Verificar sesión de Zoom" al lado de
  "Sincronizar ahora", con línea de estado ("OK (verificado hace N min)" /
  "VENCIDA — hay que recapturarla...").
- **`npm run zoom:upload-session`** (nuevo): automatiza la parte tediosa
  de recapturar (base64 + partir en 13 pedazos + `gh secret set` uno por
  uno, hecho a mano un rato antes en esta misma sesión) — el valor nunca
  pasa por argumento de proceso, solo por stdin. El login en sí sigue
  siendo 100% manual, a propósito (riesgo de CAPTCHA en cuenta gestionada
  por organización).
- Gotcha de paso: `zoom-automation/tsconfig.json` tenía
  `moduleResolution: "node"` (alias viejo, deprecado desde TS 5.x) —
  cambiado a `"node10"`, `tsc --noEmit` queda sin warnings.

Todo commiteado y pusheado a `master` (`e5f8d60`, `3b47ef2`).

## 2026-09-17 (continuación) — Validación de "múltiplo de 15 minutos" en las tres capas: editor de horario, `schedule-write` y `setStartTime`

Retoma el pendiente anotado en la sesión anterior del mismo día ("`duration_minutes: 140` rompía `setDuration` en cadena... si se retoma este punto, agregar validación (múltiplo de 15) es la mejora real"). El motivo de fondo es el mismo en los tres puntos: los dropdowns de Zoom (hora de inicio y minutos de duración) solo ofrecen opciones cada 15 minutos — cualquier valor que no caiga en esa grilla cuelga la automatización con Playwright buscando una `option` que no existe, en vez de fallar con un mensaje claro.

- **`supabase/functions/schedule-write/index.ts` (`validationError`)** — punto de entrada único de escritura del editor de horario: ahora rechaza con `400` tanto `localTime` como `durationMinutes` que no sean múltiplo de 15. Es el fix real (corta el dato inválido antes de que llegue a `meeting_schedules`), no solo un parche defensivo más adelante. `deno check` verificado sin errores.
- **`components/schedule-editor-dialog.tsx`** — `step={900}` (segundos) en el input de hora y `min={15} step={15}` en el de duración, para que el picker nativo del navegador ya sugiera la grilla correcta; el error real sigue viniendo del servidor (el `step` del input HTML no impide tipear un valor fuera de grilla a mano en todos los navegadores).
- **`zoom-automation/lib/zoom-browser.ts` (`setStartTime` y `setDuration`)** — capa de defensa adicional, para cualquier valor que llegue por otro camino que no sea el editor (ej. `origin='manual'` desde otras acciones, o datos ya cargados antes de este fix): ambos validan su valor antes de tocar la UI de Zoom y tiran un error explícito en vez del timeout genérico de Playwright de antes. `setDuration` es la reproducción exacta y el fix real del incidente `duration_minutes: 140` de la sesión anterior (el combobox de minutos solo tiene 0/15/30/45; 140 min → 2h20 buscaba la opción "20", inexistente). `tsc --noEmit` verificado sin errores en `zoom-automation/`.
