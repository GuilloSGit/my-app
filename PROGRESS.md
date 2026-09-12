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
