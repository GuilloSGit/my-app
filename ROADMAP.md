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
- [x] **Botón "Sincronizar ahora"** (propuesto por el usuario 2026-09-12): dispara `zoom-apply-dispatch` (Edge Function nueva) → GitHub Actions API → corre `zoom-apply-browser` casi al instante, en vez de esperar al backstop de 2 días. **Verificado de punta a punta 2026-09-13** contra la cuenta real: click en `/dashboard/automatizacion` (local) → JWT validado → gate de admin OK → GitHub Actions disparado (run `34770345918`) → `zoom-apply-browser` corrió en verde. Ver "Jobs" en `ZOOM_AUTOMATION.md` para el diseño completo, y PROGRESS.md para los dos bugs reales encontrados en el camino (redirect prematuro por sesión sin cargar, CORS faltante).
- [x] Acciones de un clic: Marcar Asamblea, Marcar Conmemoración, Crear igual sin contenido, Cancelar esta reunión (las 4, solo en filas bloqueadas) + Mover a otro día (cualquier fila — ver nota abajo) — implementadas, deployadas y **verificadas de punta a punta contra el proyecto real** 2026-09-13 (`occurrence-action`, `components/occurrence-action-dialog.tsx`). Encontró y arregló un bug real en "Marcar Asamblea" (fecha inválida por un mapeo snake_case/camelCase) — ver PROGRESS.md.
  - **"Mover a otro día" no quedó limitado a filas bloqueadas**: se detectó al planificar que el caso que lo motivó (visita del Superintendente de Circuito) no genera una fila bloqueada — WOL sigue teniendo contenido normal esa semana. El botón está disponible en cualquier fila no cancelada.
- [x] Form de excepción con los defaults acordados (asamblea suprime ambas siempre; evento especial pre-marca por event_days, editable) — implementado, deployado y **verificado de punta a punta contra el proyecto real** 2026-09-13 (`exception-create`, `components/exception-create-dialog.tsx`). A diferencia de "Marcar Asamblea"/"Cancelar" (arriba), este declara la excepción de forma proactiva, sin necesitar una fila ya calculada — si ya había una, la cancela en el mismo submit. Alcance limitado a Asamblea + Acontecimiento especial (confirmado con el usuario); "Sin reunión" suelto queda para cuando haga falta, resuelto desde la fila real.
- [x] Editor de horario con preview en texto plano antes de guardar (no opcional) — implementado, deployado y **verificado de punta a punta contra el proyecto real** 2026-09-13 (`schedule-write`, `components/schedule-editor-dialog.tsx`), reemplaza la carga manual de `meeting_schedules` de arriba. Editable: día/hora/duración (zona horaria fija, `kind` no editable). Guardar no dispara sync automático a Zoom (backstop de 2 días o botón "Sincronizar ahora" por separado). Preview + preservación de `agenda`/`join_url` en un `update` confirmados contra datos reales/sintéticos limpiados después — ver PROGRESS.md.

**Fase 4 cerrada — 2026-09-13.** Los 6 entregables (vista de mes, gate de admin, "Sincronizar ahora", editor de horario, acciones de fila, form de excepción) implementados, deployados y verificados contra el proyecto real.

## Fase 5 — Cron real + drift-check + retiro del flujo manual

- [x] Activar cron de `reconcile` cada 2 días (no diario — revisado 2026-09-12, ver `ZOOM_AUTOMATION.md`) en Supabase (pg_cron) — **implementado y verificado de punta a punta 2026-09-13**. `wol-enrich` **no se crea** (decisión ya tomada en Fase 3, este ítem tenía texto desactualizado — el propio `reconcile` ya cubre ese caso, ver `ZOOM_AUTOMATION.md`). `drift-check` sigue pendiente, ver más abajo.
- [x] **`zoom-apply-browser` sin cron propio de GitHub Actions** (correrlo seguido es gasto real de minutos de CI para un runner con Chromium) — se dispara por el botón de Fase 4 y por `reconcile` al terminar (fire-and-forget vía `dispatchZoomApplyWorkflow`, llamado directo, no vía la Edge Function `zoom-apply-dispatch` que está gateada para JWT de browser), nunca por schedule automático. **Verificado de punta a punta 2026-09-13.**
- [x] `zoom-apply-dispatch`/auto-disparo: `reconcile` dispara el mismo mecanismo de "Sincronizar ahora" al terminar una corrida real (no dry-run). **Implementado, deployado y verificado 2026-09-13** — ver PROGRESS.md para el detalle completo de la corrida real (12 ocurrencias creadas, agenda real de WOL, 0 bloqueos).
  - **Bug real encontrado en la verificación — confirmado y resuelto**: los 12 jobs de `zoom_outbox` habían quedado `pending` por sesión de Zoom expirada. **El usuario recapturó la sesión** (`npm run zoom:capture-session`) — pesaba más que antes, se subieron 13 secrets de GitHub en vez de 5 y se actualizó `zoom-apply-browser.yml` para reconstruir de los 13. Verificado con 3 corridas reales: **9 de 12 jobs se aplicaron bien**, con reuniones de Zoom reales creadas. Quedaron 2 bugs nuevos, distintos, sin relación con la sesión — uno ya resuelto (ver abajo), el otro pendiente.
  - **Fechas ya pasadas — arreglado**: la primera semana del horizonte de `reconcile` (la que contiene `now`) puede tener el día de reunión ya pasado si la corrida cae después de ese día — no es un caso raro de la primera corrida, se repite cada vez que el cron cae después del día de reunión de esa semana. `reconcileWeek` ahora corta antes si `date < now`, sin generar issue (2 tests nuevos, 157 en total). Deployado, verificado, y limpiados los 2 registros huérfanos que había dejado el bug en producción. Ver PROGRESS.md.
  - **Chevron del datepicker — arreglado**: el selector CSS del botón "mes siguiente" era ambiguo (esa clase la comparten otros chevrons de la página) y `.first()` agarraba el equivocado. Encontrado inspeccionando el DOM real de la cuenta (autorizado, solo lectura) — el botón real tiene `aria-label="Next month"`. Verificado con un click real aislado y después con los 2 jobs reales que habían quedado pendientes: **las 12 ocurrencias de la primera corrida real quedaron completamente resueltas** (2 canceladas por fecha pasada + 10 sincronizadas con Zoom real). Ver PROGRESS.md.
  - **Horario mal (18:00 fijo en las 10 reuniones reales) — arreglado**: encontrado por el usuario revisando la cuenta real. `setStartTime` escribía el valor con `fill()+Enter`, que queda visible en el input pero no se confirma en el estado interno de la app — el combobox de duración (paso siguiente) lo pisaba de vuelta con el default ("18:00"). Fix: clickear la opción del dropdown, igual que `setDuration`. Corregidas las 10 reuniones reales ya creadas (`updateMeeting`, preserva `join_url`) y verificadas una por una contra Zoom real. Ver PROGRESS.md.
  - **Duplicados con el flujo manual viejo — detectado, dejado así a propósito**: `/dashboard` (lo que usa la congregación) sigue leyendo de la tabla `meetings` vieja, no de `meeting_occurrences` — las reuniones de la automatización conviven en paralelo con las del flujo manual sin pisarlas. El corte (retirar `zoom-import-dialog`/`zoom-parser`, pasar `/dashboard` a `meeting_occurrences`) sigue siendo su propio ítem de Fase 5, más abajo, sin apurarlo.
- [ ] `drift-check` reporta divergencias, nunca corrige solo — **sin diseñar todavía**, deliberadamente afuera de esta ronda: necesita leer el estado real de Zoom para comparar, y la API REST sigue bloqueada (Fase 2 pausada); la única vía viva es Playwright (`zoom-automation/`), que hoy solo crea/edita/cancela, no lista todo.
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
