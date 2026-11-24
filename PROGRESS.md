# PROGRESS — Automatización de reuniones Zoom

> Bitácora de la implementación, en orden cronológico. Ver `ROADMAP.md` para
> el checklist de fases. Una entrada por sesión/hito relevante, fechada.

<!-- INDICE-INICIO -->
## Índice del historial (entradas rotadas)

| Entrada | Archivo |
|---|---|
| 2026-09-12 — Fase 0: spikes iniciales | `docs/historial/2026-09.md` |
| 2026-09-12 — Fase 1: schema + reconciliador puro (dry-run) | `docs/historial/2026-09.md` |
| 2026-09-12 — Fase 2: cliente Zoom real + outbox | `docs/historial/2026-09.md` |
| 2026-09-12 — Fase 2-bis: navegador automatizado (Playwright) | `docs/historial/2026-09.md` |
| 2026-09-12 (continuación) — Fase 2-bis verificada de punta a punta | `docs/historial/2026-09.md` |
| 2026-09-12 (continuación 2) — cargando los secrets: dos gotchas reales | `docs/historial/2026-09.md` |
| 2026-09-12 (cierre) — incidente real durante el cierre: deploy roto | `docs/historial/2026-09.md` |
| 2026-09-12 (cierre, continuación) — workflow verificado, cron automático DESACTIVADO a propósito | `docs/historial/2026-09.md` |
| 2026-09-12 (nueva sesión) — Fase 3: revisión de diseño y limpieza, sin job nuevo | `docs/historial/2026-09.md` |
| 2026-09-12 (misma fecha, nueva sesión) — Fase 4: primer entregable, vista de mes de solo lectura | `docs/historial/2026-09.md` |
| 2026-09-13 (misma fecha) — Gate de admin implementado + botón "Sincronizar ahora" | `docs/historial/2026-09.md` |
| 2026-09-13 (misma fecha, nueva sesión) — Editor de horario (`schedule-write`) | `docs/historial/2026-09.md` |
| 2026-09-13 (misma fecha, nueva sesión) — Acciones de fila (`occurrence-action`) | `docs/historial/2026-09.md` |
| 2026-09-13 (misma fecha, nueva sesión) — Form de excepción genérico (`exception-create`), Fase 4 cerrada | `docs/historial/2026-09.md` |
| 2026-09-13 (misma fecha, nueva sesión) — Fase 5: cron real de `reconcile` + auto-disparo a Zoom | `docs/historial/2026-09.md` |
| 2026-09-13 (misma fecha, continuación) — Sesión de Zoom recapturada, confirmada funcionando | `docs/historial/2026-09.md` |
| 2026-09-13 (misma fecha, continuación) — Arreglado: fechas ya pasadas | `docs/historial/2026-09.md` |
| 2026-09-13 (misma fecha, continuación) — Arreglado: chevron del datepicker | `docs/historial/2026-09.md` |
| 2026-09-13 (misma fecha, continuación) — Arreglado: horario fijo en 18:00 + detección de duplicados | `docs/historial/2026-09.md` |
| 2026-09-13 (misma fecha, continuación) — Docs: README/ARCHITECTURE/AGENTS al día con Fase 5 | `docs/historial/2026-09.md` |
| 2026-09-17 — Incidente de `cancelMeeting` (2026-09-14) resuelto de punta a punta | `docs/historial/2026-09.md` |
| 2026-09-17 (misma fecha, continuación) — `/dashboard` pasa a `meeting_occurrences` | `docs/historial/2026-09.md` |
| 2026-09-17 (continuación) — Mensaje de WhatsApp: "Tesoros de la Biblia" real + "TEMA" de La Atalaya, sin URLs | `docs/historial/2026-09.md` |
| 2026-09-17 (continuación) — Botón "Verificar sesión de Zoom" + `zoom:upload-session` | `docs/historial/2026-09.md` |
| 2026-09-17 (continuación) — Validación de "múltiplo de 15 minutos" en las tres capas: editor de horario, `schedule-write` y `setStartTime` | `docs/historial/2026-09.md` |
| 2026-09-17 (cierre) — `drift-check` diseñado e implementado (Fase 5, último ítem del roadmap) | `docs/historial/2026-09.md` |
<!-- INDICE-FIN -->

## 2026-09-19 — Panel de automatización: copy de la tarjeta 1 + link "Dashboard" en el navbar

Solo UI/docs, sin cambios de backend.

- **Tarjeta 1 de `/dashboard/automatizacion`**: "Gestión diaria" → "Excepciones puntuales", con leyenda basada en el uso real confirmado por el usuario (Asamblea, transmisión de JW Stream por visita de la Sucursal Mundial: cancelar la reunión de entresemana y/o mover un horario), no en ejemplos genéricos como feriados.
- **`components/navbar.tsx`**: link "Dashboard" (desktop) / "Volver al dashboard" (mobile) en cualquier sub-página logueada que no sea `/dashboard` ni la landing (ej. `/dashboard/automatizacion`). Documentado en `ARCHITECTURE.md`.
- `.gitignore`: se ignora `*.code-workspace`.
- Test: el mock de `Occurrence` en `automatizacion-page.test.tsx` no tenía `zoomMeetingId` (`tsc --noEmit` fallaba, Vitest no); agregado.
- Verificación: `lint`, `build`, `test:run` (194), `playwright` (7) y `tsc --noEmit` verdes. El navbar/panel no se probó logueado de verdad (magic link no automatizable).
- **Pendiente del drift-check (verificado el 2026-09-19 contra el estado real)**: la migración `20260917220000` ya está aplicada en remoto, pero **falta** deployar la Edge Function `zoom-drift-check-dispatch`, cargar el secret `RESEND_API_KEY` en GitHub, y correr `gh workflow run zoom-drift-check.yml` una vez (nunca corrió) para verificar los selectores nuevos antes de marcar el ítem `[x]` en `ROADMAP.md`.

## 2026-09-19 — Primera corrida real de drift-check: 3 bugs encontrados y corregidos

Primera corrida real contra la cuenta (deploy de la Edge Function y `RESEND_API_KEY` ya hechos por el usuario). Resultado inicial: 9 `missing_in_zoom` — todos falsos positivos.

- **Sesión de CI vencida tratada como "no existe"**: `readMeetingSummary` devolvía `null` al caer en `/signin` y `listMeetingIds` devolvía `[]`. Ahora ambos llaman a `assertSessionActive` y tiran un error explícito (con instrucciones de recaptura). Un vencimiento futuro da un error claro, no una tanda de avisos falsos por mail. Confirmado con el chequeo de sesión (#4, 13:12 UTC: "Sesión vencida").
- **Pedazos sobrantes de la sesión**: al recapturar, la sesión pasó de 13 a 4 pedazos; los secrets 5..13 viejos seguían en GitHub y los workflows los concatenan → sesión corrupta. `upload-session.ts` ahora borra los `ZOOM_SESSION_STATE_B64_N` con N > cantidad de pedazos, y solo avisa si la sesión supera los 13 que leen los workflows.
- **Lectura de campos del form de edición** (primer selector de drift-check verificado contra el DOM real, vía captura de la falla): el combobox de hora es un `<input>` (`innerText()` daba `""`) → ahora se lee `.value` con fallback a `textContent`; y la fecha se muestra como `DD/MM/YYYY`, no como el label en inglés → `parseZoomDateTime` acepta ambos. Tests nuevos en `__tests__/zoom/parse-zoom-date-time.test.ts`.
- Verificación: `tsc --noEmit` (raíz y `zoom-automation/`), lint, 200 tests. Falta: correr `zoom-drift-check.yml` de nuevo con este código pusheado.
- **Verificado**: tras el push de `2b9b7a2`, `zoom-drift-check.yml` (run `35446059120`) terminó en verde con **0 divergencias** guardadas en `drift_check_runs` — las 9 reuniones reales coinciden con la base en tema/horario/duración. Ítem de Fase 5 marcado `[x]` en `ROADMAP.md`. Sin verificar todavía: el mail de Resend (solo sale con ≥1 divergencia) y el cron semanal de los domingos.

## 2026-09-19 — "Verificar sesión" con constancia + chequeo diario con aviso

A pedido del usuario: el chequeo solo miraba que apareciera "Programar una reunión" y no dejaba ninguna prueba de que se había entrado de verdad a la cuenta (el primer OK de la mañana no se pudo verificar a posteriori).

- **OK más estricto** (`check-session.ts`): además del botón de agendar, si la base espera reuniones futuras ya creadas en Zoom, la lista "Próximas" tiene que mostrar al menos una — una lista vacía cuando debería tener contenido da "Sesión dudosa", no OK.
- **Constancia** en `zoom_session_checks` (migración `20260919140000`, aplicada): `final_url`, `meetings_seen`, `account_label` (email leído de `/profile`, solo evidencia, NO decide el OK — selector sin verificar), `run_url` y `source` (manual/schedule). Captura de pantalla en CADA corrida (artifact `zoom-session-check-evidence`, 14 días), no solo en fallas.
- **Panel**: "Sesión de Zoom: OK — 9 reuniones vistas, cuenta@… (verificado …)" + link "Ver constancia" a la corrida (captura). Los chequeos viejos sin constancia se siguen mostrando igual.
- **Cron diario** de `zoom-session-check.yml` (`0 11 * * *` UTC, 8:00 hora local) con **aviso por mail** si falla — solo en la transición a fallo o como recordatorio cada 24 hs (no un mail por corrida). Helper compartido `zoom-automation/lib/alert-email.ts` (también lo usa drift-check).
- Tests: 203 (nuevos para la constancia en lib y en el panel). Sin verificar todavía: el selector del email en `/profile` (si no lo encuentra, `account_label` queda null y no pasa nada).
- **Crons encadenados cada 10hs** (a pedido del usuario, todo gratis): `reconcile` :00 (pg_cron, ya existía) → `zoom-session-check` :20 → `zoom-drift-check` :30, en 00/10/20 UTC. Antes: session-check solo a demanda/diario y drift-check semanal (domingos). Los tres workflows comparten `concurrency: zoom-account` (comparten UNA sesión de Zoom, nunca dos a la vez) y el drift-check ahora avisa por mail **solo por divergencias nuevas** respecto de la corrida anterior (`lib/drift-diff.ts`, 5 tests) para no repetir el mismo mail 3 veces por día. Documentado en `ZOOM_AUTOMATION.md` ("Cadena de crons").

## 2026-09-21 — Sesión de Zoom persistida y renovada en la base

La sesión venció en 2-4hs dos veces seguidas (19/09 y 21/09: check OK a las 04:57 UTC, drift-check caído a las 05:17). Causa probable: cada corrida partía de la misma captura de los secrets y tiraba las cookies renovadas.

- Nueva tabla `zoom_session_state` (migración `20260921120000`, aplicada) + `lib/session-store.ts` (`pullSession`/`pushSession`). Los tres scripts bajan la sesión al arrancar y suben la renovada al terminar si sigue activa; `upload-session` también la siembra en la tabla.
- Tests: `__tests__/zoom/session-store.test.ts` (preserva la sesión local real). Verificación: tsc (raíz y zoom-automation), lint, build, 212 tests.
- **Pendiente**: recapturar (`zoom:capture-session`) y correr `zoom:upload-session` para sembrar la tabla; después ver en `zoom_session_checks` cuánto dura. Detalle en `ZOOM_AUTOMATION.md` ("Dónde vive la sesión"). También pendiente: que "Verificar sesión" falle (exit 1) cuando `ok=false`.

## 2026-09-27 — Cadena de crons resucitada (bug real de 10 días) + 2 bugs nuevos de la SPA de Zoom + visita del superintendente

Arrancó por un mail de GitHub Actions: `zoom-drift-check` fallando ("sesión vencida"). La sesión sí estaba vencida, pero investigar por qué llevó a un hallazgo mucho más grande.

- **Causa raíz real, sin relación con la sesión**: `reconcile` venía devolviendo `401 unauthorized` en **cada corrida de `pg_cron` desde el 17/9** (10 días, ~30 corridas) — el token compartido entre el secret de la función (`RECONCILE_INTERNAL_TOKEN`) y el de Vault (`reconcile_internal_token`, el que arma el `Authorization` que manda el cron) estaba desincronizado. `reconcile_runs` no tenía filas nuevas desde esa fecha pese a que `cron.job_run_details` mostraba el disparo puntual cada 10hs — nada en la app lo mostraba, la única pista fue `net._http_response` (`status_code: 401`, se purga sola, hay que mirarla poco después de una corrida). **Fix**: rotar ambos al mismo valor nuevo (`supabase secrets set` + `vault.update_secret`). Con eso, `reconcile` disparado a mano generó ocurrencias nuevas al toque (22/10, 24/10, 29/10, 31/10) y de paso sembró por primera vez `zoom_session_state` (ver entrada 2026-09-21, quedaba pendiente). Detalle completo en `ZOOM_AUTOMATION.md` ("Dónde vive la sesión").
- **Bug nuevo #1 — banner de cookies de Zoom (OneTrust) rompe la SPA entera**: su fetch de config falla por CORS y tira una excepción sin atrapar que deja la página en blanco para siempre — reproducido igual en un Chrome real del usuario, no es cosa de la automatización. Fix: `context.route(/cookielaw\.org/, ... .abort())` en `ZoomBrowserClient.open()`.
- **Bug nuevo #2 — las transiciones client-side de la SPA se rompen y dejan la pestaña muerta** ("Transition was skipped"): pasaba al clickear "Schedule a Meeting" desde `#/upcoming`, y ya arreglado eso, al leer "Copy Invitation" en la misma pestaña justo después de que "Save" navegara sola — reproducido 100% de las veces las dos veces, aislado con un script de diagnóstico descartable (`_diag_tmp.ts`, nunca commiteado) que midió tiempos/estabilidad del elemento antes de tocar el código real. Fix: `createMeeting` va directo a la URL del form (nunca pasa por `#/upcoming` + click) y, después de "Save", cierra la pestaña y abre una nueva para leer la invitación (`recoverInvitation`, nuevo método público) en vez de seguir en la que acaba de navegar. Detalle y la regla general ("ante un timeout nuevo tipo 'visible, enabled and stable' después de un click que cambia de URL, sospechar de esto antes que del selector") en `ARCHITECTURE.md`.
- **Incidente real durante el arreglo — reunión duplicada**: el primer intento de crear la reunión del martes 20/10 falló en "Copy Invitation" (bug #2) pero el "Save" ya había guardado la reunión en Zoom de verdad. Se reintentó sin chequear eso primero → `createMeeting` corrió de nuevo desde cero y creó una segunda reunión real para la misma ocurrencia. Detectado por el usuario mirando la constancia de invitación de la reunión buena, no por ningún test. La huérfana (`83595432111`) se identificó con `listMeetingIds`/`readMeetingSummary` (mismo tema/fecha que la buena) y se canceló con autorización explícita del usuario (el clasificador de modo automático bloqueó `cancelMeeting` por ser una acción irreversible, correctamente). **Lección agregada a `ARCHITECTURE.md`**: nunca reintentar un `create` que ya falló una vez sin listar la cuenta primero.
- **Visita del superintendente de circuito**: la reunión de entresemana del jueves 22/10 tenía que moverse al martes 20/10 (dato real del usuario, no estaba cargado como `schedule_exceptions` — se agregó recién ahora). Se replicó a mano, vía las mismas RPCs `security definer` que usa la Edge Function `occurrence-action` (acción "move"), el flujo completo: insertar la excepción (`kind: special_event`, `suppresses: ['midweek']`), `schedule_write_cancel_occurrence` sobre la ocurrencia del jueves (canceló también la reunión real en Zoom vía el outbox) y `reconciler_upsert_occurrence` para la ocurrencia nueva del martes. No se pudo invocar `occurrence-action` directo porque `requireAdmin` exige un JWT de sesión de usuario admin, que el asistente no tiene — se llamó a las mismas RPCs con el `service_role`. Se asumió que la reunión de fin de semana (24/10) no se mueve, solo la de entresemana — sin confirmar explícitamente con el usuario si el superintendente también la afecta.
- Recuperación de datos: para toda reunión que quedó creada en Zoom sin `zoom_meeting_id` en la base (jueves 22/10 original, sábado 24/10, jueves 29/10, sábado 31/10, martes 20/10), se usó `readMeetingSummary`/`recoverInvitation` para releer topic/fecha/join_url/passcode reales y actualizar `meeting_occurrences`/`zoom_outbox` a mano en vez de dejar que el reconciliador reintentara (que habría vuelto a duplicar).
- Estado final verificado con `listMeetingIds` (10 reuniones reales, exactamente las 10 `synced` de la base, sin huérfanas) y con la constancia de invitación de cada una.
- Verificación de los cambios de código: `tsc --noEmit` en `zoom-automation/` y en la raíz, ambos limpios. No se corrió la suite completa de Vitest/Playwright en esta sesión (los cambios fueron solo en `zoom-browser.ts`, sin tests unitarios que cubran el flujo de Playwright contra la cuenta real) — **pendiente real**: si se toca `zoom-browser.ts` de nuevo, correr igual `npm run test:run` antes del cierre, no asumir que "solo tsc alcanza" porque esta vez no había tests afectados.
- **Pendiente real, no resuelto esta sesión**: confirmar con el usuario si la visita del superintendente también afecta la reunión de fin de semana del 24/10; verificar que la cadena de crons (reconcile → session-check → drift-check) corra sola y en verde en su próximo disparo real (20:00 UTC); seguir sin saber cuánto dura la sesión de Zoom ahora que la tabla `zoom_session_state` por fin tiene datos reales.

## 2026-10-10 — Sesión de Zoom vencida: recaptura headed, reuniones de noviembre y drift-check

- La sesión de Zoom había vencido (los `create` 110 y 111 de las reuniones del 12/11 y 14/11 quedaron `failed` tras 5 intentos, timeout en el campo Tema). Se recapturó a mano (`npm run zoom:capture-session` desde terminal real, Chrome visible) y se subió con `zoom:upload-session`. `zoom:check-session` dio ok (7 reuniones en "Próximas").
- Antes de reintentar se comprobó que Zoom no tenía esas dos reuniones (no hay duplicados). Se reseteó `zoom_outbox` 110/111 a `pending` (`attempts=0`) y `zoom:apply` las creó: 12/11 (87295421310) y 14/11 (82312858396), ambas `synced`.
- **Bug de `drift-check.ts`**: verificaba también las ocurrencias `cancelled` (conservan `zoom_meeting_id` pero ya no existen en Zoom) y reventaba con "no se encontró el link Edit" para la del 22/10 (cancelada a propósito por la visita del superintendente). Ahora las excluye de la verificación. Resultado: 0 divergencias.
- Verificación: lint, build, Vitest (212), tsc (raíz y zoom-automation) y Playwright (7), todo verde.
- **Dato medido** (`zoom_session_checks`): tras sembrar la tabla el 27/9, la sesión dio ok hasta el 29/9 00:23 UTC y falló desde el 29/9 16:32 UTC — dura ~2 días, NO semanas. Los chequeos estuvieron en rojo ~11 días hasta la recaptura del 10/10. Pendiente: decidir cómo manejarlo (alerta más agresiva, recaptura periódica, o login scripteado).

## 2026-11-12 — Auditoría post-mudanza, renombre a congre-zoom y fix del link en curso

- Proyecto renombrado a `congre-zoom` solo en package.json y docs; el repo `my-app` y la URL de Pages se mantienen (renombrar rompe la PWA instalada, `basePath`, `dispatch-workflow.ts` y las Redirect URLs de Supabase Auth). Ver nota en `GITHUB_PAGES.md`.
- Fix `496f162`: `/dashboard` mantiene la card completa 45 min después del `starts_at` (antes desaparecía al empezar la reunión porque la consulta cortaba en `starts_at >= now`). `getUpcomingOccurrences` ganó el parámetro `graceMinutes` (default 0; automatización no cambia). +1 test (213 en total).
- Auditoría solo lectura: 4 workflows y el cron `reconcile-every-10-hours` sin fallos; ocurrencias hasta el 12/12, outbox 34/34 `done`; 87 session-checks ok desde el 10/10.

## 2026-11-20 — Sesión de Zoom recapturada, UI de Zoom cambiada y migración a Next 16

- **Sesión vencida** (`readMeetingSummary` → redirigió a /signin): recapturada con `zoom:capture-session` + `zoom:upload-session` (la hizo el usuario).
- **Zoom cambió su UI** (ver gotcha en ARCHITECTURE.md): "Edit" pasó de link a botón y el `/s/<id>` de la lista es ahora "Start". Fix `fba28ef` (en master, pusheado): `editControl()` + tema desde `.topic`. Verificado en local con `ZOOM_HEADFUL=1` y comprobación segura de Schedule/Delete (sin Save ni Delete real).
- **Dependencias:** `npm update` en rango (Playwright 1.65 → hubo que correr `npx playwright install chromium`) y migración en la rama `chore/migrar-next-16` (sin mergear): Next 16, React 19, ESLint 9 con `eslint.config.mjs`, `lint` = `eslint .`, next-themes 0.4, lucide 1.x, framer-motion 14. `npm audit`: 0 vulnerabilidades. Arreglos: tipo de `ease`, `ThemeToggle` con `useSyncExternalStore`, `Link` en login (el `<a href="/">` ignoraba el basePath), `<div>` dentro de `<p>` en el dashboard, `data-scroll-behavior`, 2 `eslint-disable` de `set-state-in-effect` con motivo.
- Verificación en la rama: lint, tsc (+ zoom-automation), Vitest 213, build y Playwright 7, verdes. Páginas públicas revisadas a ojo; `/dashboard` y `/dashboard/automatizacion` pendientes (requieren login).
- **2026-11-21:** la sesión de Zoom volvió a vencer ~17 h después de la captura (CI y copia local); causa no confirmada (¿uso local simultáneo con el CI?, ¿el session-check de las 10:20Z no corre?). Recapturada y subida por el usuario; drift-check manual: 0 divergencias, session-check de las 16:33Z OK tras las pruebas locales.
- **2026-11-21:** migración a Next 16 revisada a ojo por el usuario, mergeada a `master` (`56ec03b`) y desplegada; rama borrada.
- **2026-11-21:** ciclo completo contra Zoom real con UI nueva, con reuniones de prueba creadas y canceladas al instante (sin restos; lista de Próximas 11 antes y después): create ("Save"), update (tema/fecha/duración releídos con readMeetingSummary) y cancel ("Delete"). Scripts de prueba solo en el scratchpad, no en el repo.

## 2026-11-23 — Menos chequeos con navegador (hipótesis: el uso frecuente vence la sesión)

- `zoom-drift-check` pasó a 1 vez por semana (`30 0 * * 1`) y `zoom-session-check` a 2 (`20 0 * * 1,4`); reconcile/apply siguen cada 10hs. Commit `299b735`. Comentarios y docs (ARCHITECTURE, ZOOM_AUTOMATION) actualizados.
- Idea pendiente: "llamada liviana diaria" con las cookies guardadas (GET sin navegador). Prueba local: `GET jworg.zoom.us/meeting` con las cookies de la copia local (capturada el 21/11) → 302 a /signin. Inconcluso: no se sabe si la copia venció o si Zoom exige más que cookies (cf_clearance atado a UA/IP). Hay que probarla con la sesión vigente del CI.
- A mirar el 24-26/11: que no haya corridas programadas nuevas fuera de lun/jue, y si la sesión sigue viva.
- **2026-11-23 (después):** llamada liviana DESCARTADA: con la sesión vigente de `zoom_session_state` (renovada 22:11Z por el drift-check) un GET con cookies a /meeting, /profile y zoom.us da 302 a /signin aun con headers de navegador. Sin duplicados en Próximas (base: 10 futuras synced). `supabase functions deploy exception-create` → "No change found" (ya al día).

## 2026-11-23 (cierre) — Compactación de docs
- `PROGRESS.md` 127 KB → ~25 KB: 25 entradas de septiembre rotadas sin cambios a `docs/historial/2026-09.md` + tabla índice (`scripts/rotar-progress.py`, idempotente). `ZOOM_AUTOMATION.md` con tabla índice sección → línea (`scripts/indexar-docs.py`). Verificado línea por línea que no se perdió texto. Memoria `project_my_app.md` 62 KB → ~6 KB núcleo + `project_my_app_archivo.md` (texto íntegro). ARCHITECTURE (30 KB) y ROADMAP (22 KB) quedaron como están (bajo el umbral). `/cierre` corre los scripts.
