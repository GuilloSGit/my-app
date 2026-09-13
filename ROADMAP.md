# ROADMAP — Automatización de reuniones Zoom

> El spec completo (contexto, razonamiento, schema, arquitectura) vive en
> `ZOOM_AUTOMATION.md` — leerlo primero si es la primera vez que se toca esta
> feature. Este archivo es solo el checklist de fases; el detalle
> cronológico de qué se hizo y qué se encontró en cada una vive en
> `PROGRESS.md`.

Arquitectura: todo el backend nuevo vive dentro del mismo proyecto Supabase
que ya usa `meetings` — Edge Functions (Deno) en vez de Fastify, pg_cron +
pg_net en vez de un cron de sistema, una tabla `zoom_outbox` en vez de
pg-boss. Cero hosting nuevo, cero costo nuevo.

## Fase 0 — Spikes y scaffolding

- [x] Verificar selector `.cardLine1` de wol.jw.org contra el DOM real
- [x] Confirmar que el número de semana en la URL de WOL es la semana ISO
- [x] Instalar Supabase CLI, `supabase init` (scaffold local)
- [x] Linkear el proyecto Supabase real (`Reuniones-Media-Agua`, ref `lwucctdliysrsscmjxsh`)
- [x] Habilitar pg_cron + pg_net en el proyecto real (migración aplicada)
- [x] Verificar pg_cron + pg_net disparando una Edge Function trivial end-to-end (confirmado, ver PROGRESS.md)
- [x] Encontrado y arreglado: `.env` con secretos `NEXT_PUBLIC_*` sin gitignorear
- [ ] Verificar cómo se pasa el service-role key a `net.http_post` sin texto plano en `cron.job` (Vault) — se resuelve en Fase 5 cuando haya jobs reales que necesiten auth
- [x] Verificar si el caché en memoria del token Zoom sobrevive entre invocaciones de una Edge Function — **no sobrevive** (spike dedicado con contador de módulo, sin necesitar credenciales de Zoom: cada invocación arrancó un isolate nuevo). Ver PROGRESS.md 2026-09-12.
- [x] Verificar límite de tiempo de ejecución free-tier vs. el loop de `reconcileMonth` — ya verificado empíricamente en Fase 1 (6 semanas con fetch a WOL + RPCs, sin timeout) y confirmado de nuevo en Fase 2 corriendo `reconcile` real contra el proyecto
- [ ] Verificar si `supabase start` local trae pg_cron/pg_net para paridad de CI — bloqueado hoy por un problema de Docker en esta red (capas grandes se traban), no crítico para seguir
- [x] Crear `ROADMAP.md` y `PROGRESS.md` (este archivo)

## Fase 1 — Schema + reconciliador (dry-run, sin Zoom real)

- [x] Migraciones: `meeting_schedules`, `meeting_occurrences`, `schedule_exceptions`, `wol_week_cache`, `reconcile_runs`, `zoom_outbox` + RLS (aplicadas al proyecto real)
- [x] Módulos puros compartidos: `buildTopic`, `expand()`, diff posicional, parser WOL, `occurrenceDateForWeek`, `isoWeeksBetween` (`supabase/functions/_shared/reconciler/`)
- [x] `reconcileWeek`/`reconcileMonth` — lógica pura con puertos inyectados, apply-a-Zoom todavía no existe (Fase 2)
- [x] Adaptador de puertos contra Postgres real (`db-ports.ts`) + funciones SQL `SECURITY DEFINER` con `pg_advisory_xact_lock` + dirty-check + Edge Function `reconcile` deployada, probada en dry-run y en modo real contra el proyecto (dos corridas seguidas, idempotente, sin errores)
- [x] Suite Vitest completa (topic, expand, diff con pinned, reconcileWeek ok/null/sección-faltante, idempotencia, parser WOL contra fixture real, wrapper de dry-run) — 39 tests del reconciliador, 108 en total, todos verdes
- [x] Flujo manual (`zoom-parser`) sigue intacto, sin tocar

**Fase 1 cerrada — 2026-09-12.**

## Fase 2 — Cliente Zoom real + outbox — **PAUSADA (2026-09-12)**

> **Bloqueante de fondo, no un permiso chico**: la cuenta Zoom de la
> congregación es una sub-cuenta administrada centralmente por **"Kingdom
> Support Services, Inc."** (owner `no-reply-zoom@jw.org` — la organización
> que gestiona el Zoom institucional de las congregaciones), y el usuario de
> la congregación tiene rol **"Miembro"**, sin acceso a administración de
> cuenta. Crear cualquier app en Zoom Marketplace (General, Server-to-Server
> OAuth o Webhook) requiere permisos de owner/admin de la cuenta completa —
> algo que la congregación no tiene y no controla. No es un toggle que se
> pueda prender desde acá ni un problema de plan/dominio de email
> (se investigó y descartado, ver PROGRESS.md 2026-09-12).
>
> Decisión del usuario: **pausar Fase 2 indefinidamente y seguir con el
> flujo manual** (`lib/zoom-parser.ts` + `zoom-import-dialog.tsx`), que sigue
> 100% intacto y autoritativo. Todo el código de Fase 2 (cliente Zoom,
> outbox, `zoom-apply`) queda escrito, testeado y deployado pero **dormido**
> — no hay cron que lo dispare (Fase 5 nunca se activó), así que no hace
> nada por sí solo. Si en el futuro se resuelve el permiso a nivel
> organización (o se decide otra cuenta), se retoma desde acá sin rehacer
> nada de lo ya hecho. Opciones que quedaron sobre la mesa si se retoma:
> pedir el permiso a la administración central del Zoom institucional, o
> usar una cuenta Zoom separada (con la contra de que las reuniones no
> saldrían de la cuenta/capacidad real que ya usa la congregación).

- [x] Cliente Zoom en Deno (`_shared/zoom/client.ts`): S2S OAuth (token cacheado en el closure del cliente, no a nivel de módulo), `type:2`/`use_pmi:false`, PATCH preserva join_url (no reenvía `settings`), `cancelMeeting` trata 404 como éxito, GET on-demand de `start_url`
- [x] `dequeue_zoom_jobs`/`complete_zoom_job` (migración `20260912190000`) + función `zoom-apply` con retry/backoff exponencial (techo 5 intentos)
- [x] `reconciler_upsert_occurrence`/`reconciler_cancel_occurrence` ahora encolan en `zoom_outbox` dentro de la misma guarda de dirty-check que ya tenían (Fase 1) — `reconcileWeek` ya encola jobs reales sin cambios propios, solo invocado a mano (sin cron todavía)
- [x] Tests con `fetch` stubbeado (Vitest, corren tanto en Node como tipados por `deno check`) para el cliente y el dispatch de jobs — nunca contra la API real en CI
- [ ] Verificación manual contra una cuenta de Zoom real — **bloqueada, no solo pendiente**: no hay forma de crear la app Server-to-Server OAuth con los permisos actuales de la cuenta. Ver nota de arriba.

## Fase 2-bis — Navegador automatizado (Playwright), reemplaza a la API REST

> Decidido con el usuario 2026-09-12 como salida al bloqueo de arriba: la
> UI web de Zoom sí funciona con el rol "Miembro" de esta cuenta (es lo que
> se usa a mano hoy), así que la automatización pasa a manejar esa UI con
> Playwright en vez de la API REST. Detalle completo en
> `ZOOM_AUTOMATION.md` (sección "Navegador automatizado (Playwright)").

- [x] Scaffolding: `zoom-automation/` (script standalone, fuera de Next/Supabase — Playwright no corre en Deno Edge Functions), `tsconfig.json` propio, excluido del `tsc`/lint de Next
- [x] `capture-session.ts` — captura de sesión a mano (nunca se scriptea el login, para no arriesgar CAPTCHA/verificación contra una cuenta gestionada por una organización)
- [x] `lib/outbox.ts` — mismo contrato `dequeue_zoom_jobs`/`complete_zoom_job` que ya usa la Edge Function `zoom-apply`, consumido desde Node
- [x] `lib/zoom-browser.ts` (`ZoomBrowserClient`) + `apply.ts` — loop dequeue → browser → complete, con screenshot en cualquier falla
- [x] `.github/workflows/zoom-apply-browser.yml` — sin cron automático a propósito (ver nota abajo), `workflow_dispatch` para correrlo a demanda, sube capturas de fallas como artifact
- [x] Sesión capturada y verificada como autenticada contra `zoom.us/profile`
- [x] `npx playwright codegen` grabado por el usuario (crear/editar/cancelar) — selectores reales trasladados a `zoom-browser.ts`
- [x] **`createMeeting`/`updateMeeting`/`cancelMeeting` verificados de punta a punta contra la cuenta real** (autorización explícita del usuario para esta sesión) — ciclo completo crear→editar→cancelar confirmado releyendo la página de detalle en cada paso, no solo confiando en que el click no tirara error. Encontrados y arreglados: `networkidle` poco confiable en este SPA, timing entre comboboxes de duración, formato real del combobox de hora (24hs, texto libre), y el bug más importante — la página se cerraba antes de que la request de guardar/borrar terminara, dejando el cambio sin aplicar pese a "éxito" aparente. Ver detalle en `ZOOM_AUTOMATION.md`/`PROGRESS.md`.
- [x] Los 7 secrets cargados en GitHub como Secrets (no Variables) y el workflow probado a demanda de punta a punta: sesión restaurada, conexión a Supabase OK, dequeue funcionando (reportó correctamente "Sin jobs pendientes" — la cola está vacía porque todavía no hay `meeting_schedules` reales ni cron de `reconcile`). De paso se encontró y arregló otro bug: `@supabase/supabase-js` necesita Node ≥22 (WebSocket nativo), el workflow pedía Node 20 copiado de `deploy.yml` sin pensar.
- **No se activó el `schedule:` del cron a propósito**: correr un runner con Playwright+Chromium cada 10 min contra una cola siempre vacía es puro gasto de minutos de GitHub Actions. Se reactiva recién en **Fase 5**, junto con el cron de `reconcile` (que es lo que realmente llena `zoom_outbox`) — activarlos por separado no tiene sentido.

## Fase 3 — Enriquecimiento WOL

> **Revisado 2026-09-12**: se verificó contra wol.jw.org real que publica
> contenido con ~3.5 meses de anticipación (semanas 38 a 52 de 2026, todas
> con títulos reales distintos) — muy por delante del horizonte de 1 mes de
> `reconcile`. Esto descarta la necesidad de un job `wol-enrich` diario
> aparte: el propio `reconcile` (cada 2 días, Fase 5) ya reintenta
> `wol_unreachable` en la próxima corrida (esas semanas nunca se cachean) y
> ya emite un job `update` (preserva `join_url`) cuando el contenido de una
> ocurrencia ya sincronizada cambia — es el mismo mecanismo que haría un
> "PATCH de agenda desacoplado", sin necesitar una Edge Function nueva. Ver
> `ZOOM_AUTOMATION.md` para el detalle.

- [x] Caché por semana ISO (`wol_week_cache`, ya implementado en Fase 1) y PATCH de agenda desacoplado de la creación (ya cubierto por `reconciler_upsert_occurrence`, que emite `update` en vez de `create` cuando la ocurrencia ya está sincronizada) — no hace falta job nuevo, ver nota arriba
- [x] `wol_unreachable` (warning, no toca nada) y `wol_section_missing` (blocked) como paths separados — implementado y testeado desde Fase 1
- [x] Limpieza: se sacó la acción `enrich_agenda` de `zoom_outbox` (schema, tipos, dispatch) — quedaba del diseño original sin ningún productor real
- [x] Completar el campo de descripción/agenda en `zoom-browser.ts` — selector real verificado contra el DOM (botón "Add Description" revela un `<textarea id="agenda">`), implementado en `createMeeting`/`updateMeeting`
- [x] Verificación end-to-end contra la cuenta real — ciclo crear (con agenda)→releer desde sesión aparte→cancelar→confirmar ausencia, agenda confirmada en el detalle real

**Fase 3 cerrada — 2026-09-12.**

## Fase 4 — UI

> **Primer entregable cerrado 2026-09-12**: vista de mes de solo lectura en
> `/dashboard/automatizacion` (admin-only, sin ningún botón de escritura
> todavía). Los puntos que siguen (sincronizar, acciones de fila,
> excepciones, editor) necesitan primero un **gate de admin nuevo para las
> Edge Functions de escritura** — hoy `reconcile`/`zoom-apply` solo aceptan
> un token interno estático pensado para el cron/servidor, no seguro para
> exponer en el browser de un admin. Diseño acordado (sin implementar
> todavía): la Edge Function recibe el JWT que `supabase.functions.invoke`
> ya adjunta solo desde un cliente autenticado, lo valida con
> `supabase.auth.getUser(jwt)` y chequea el email contra la misma lista de
> `ADMIN_EMAILS` que ya usa `lib/admin.ts` (server-side, env var propia en
> Supabase — no es secreta, ya es pública vía `NEXT_PUBLIC_ADMIN_EMAIL`).

- [x] Vista de mes (admin-only): `/dashboard/automatizacion`, agrupada por schedule con chip de estado y `join_url` (`lib/automation.ts`, `app/dashboard/automatizacion/page.tsx`)
- [x] `reconcile_runs.finished_at` siempre visible — mismo entregable de arriba
- [x] Horario real cargado en `meeting_schedules` (jueves 19:00 / sábado 18:00, 2hs cada una, `America/Argentina/Buenos_Aires`) — antes vacía, stopgap hasta que exista el editor
- [x] **Gate de admin nuevo** (JWT de sesión + `ADMIN_EMAILS` server-side): `supabase/functions/_shared/admin-auth.ts` (`requireAdmin`), implementado y testeado — ver PROGRESS.md 2026-09-13.
- [~] **Botón "Sincronizar ahora"** (propuesto por el usuario 2026-09-12): dispara `zoom-apply-dispatch` (Edge Function nueva) → GitHub Actions API → corre `zoom-apply-browser` casi al instante, en vez de esperar al backstop de 2 días. Código implementado y testeado (`zoom-apply-dispatch`, `lib/automation.ts#triggerZoomSync`, botón en `/dashboard/automatizacion`) — **pendiente de deploy y de cargar los secrets `ADMIN_EMAILS`/`GITHUB_PAT`** (bloqueado por el clasificador de modo automático, requiere que el usuario lo corra). Ver "Jobs" en `ZOOM_AUTOMATION.md` para el diseño completo.
- [ ] Acciones de un clic sobre filas bloqueadas: Marcar Asamblea, Marcar Conmemoración, Crear igual sin contenido, Cancelar esta reunión, Mover a otro día — necesita el gate de admin nuevo
- [ ] Form de excepción con los defaults acordados (asamblea suprime ambas siempre; evento especial pre-marca por event_days, editable) — necesita el gate de admin nuevo
- [ ] Editor de horario con preview en texto plano antes de guardar (no opcional) — necesita el gate de admin nuevo; reemplaza la carga manual de `meeting_schedules` de arriba

## Fase 5 — Cron real + drift-check + retiro del flujo manual

- [ ] Activar cron de `reconcile` cada 2 días (no diario — revisado 2026-09-12, ver `ZOOM_AUTOMATION.md`), `wol-enrich` diario, `drift-check` semanal — los tres en Supabase (pg_cron)
- [ ] **`zoom-apply-browser` sin cron propio de GitHub Actions** (correrlo seguido es gasto real de minutos de CI para un runner con Chromium) — se dispara por el botón de Fase 4 y por `reconcile` al terminar (fire-and-forget vía `zoom-apply-dispatch`), nunca por schedule automático
- [ ] `zoom-apply-dispatch`: Edge Function que llama a la GitHub Actions API con un PAT (`GITHUB_PAT`, scope `workflow`) guardado como secret de Supabase — el usuario lo genera y carga él mismo, nunca por el chat
- [ ] `drift-check` reporta divergencias, nunca corrige solo
- [ ] Retirar `zoom-import-dialog.tsx`/`lib/zoom-parser.ts` del flujo principal (fallback documentado un ciclo más antes de borrar)
- [ ] Actualizar README/ARCHITECTURE/AGENTS como sistema autoritativo

---

## Preguntas ya resueltas (no volver a preguntar)

- **Suppresses por defecto**: Asamblea (cualquier tipo) suprime siempre ambas
  reuniones, sin Zoom, solo info de lugar/día(s). Acontecimiento especial
  pre-marca la reunión cuyo día caiga en `event_days`, editable. Caso
  "Visita del Superintendente de Circuito" (jueves→martes) se resuelve con
  excepción `suppresses=['midweek']` + ocurrencia `origin='manual'` en la
  fecha nueva, expuesto en la UI como acción "Mover a otro día".
- **Backend/hosting**: 100% dentro del Supabase existente (Edge Functions +
  pg_cron/pg_net + tabla-cola), cero servicio ni hosting nuevo, por costo.
