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
