# NEXT_TASK — Prompt para la próxima sesión

> Lo sobrescribe `/cierre` (paso 6) al final de cada sesión. Para retomar,
> pegar el bloque de abajo como primer mensaje. Última actualización:
> 2026-09-27.

```
Continuamos con my-app (Congregación Media Agua). Estado: todo commiteado y pusheado a master (fe647bc), deploy en verde (test✓ build✓ deploy✓).

COMPLETADO (2026-09-27):
- Causa raíz real de por qué no se creaban reuniones nuevas desde el 17/9: `reconcile` devolvía 401 en CADA corrida de pg_cron (token `RECONCILE_INTERNAL_TOKEN` desincronizado del de Vault). Rotado y verificado — `reconcile` volvió a andar y `zoom_session_state` se sembró por primera vez.
- 2 bugs reales de la SPA de Zoom, arreglados en `zoom-automation/lib/zoom-browser.ts`: banner de cookies (OneTrust) rompía la página entera (bloqueado el dominio), y la transición client-side después de "Save" dejaba la pestaña muerta para leer "Copy Invitation" (fix: `recoverInvitation`, pestaña nueva). Ver ARCHITECTURE.md (gotchas) y PROGRESS.md 2026-09-27 para el detalle completo.
- Reunión duplicada (incidente real durante el arreglo, resuelto: se canceló la huérfana) — lección agregada a ARCHITECTURE.md: nunca reintentar un `create` que ya falló una vez sin listar la cuenta primero.
- Visita del superintendente de circuito: reunión de entresemana movida de jueves 22/10 a martes 20/10 (excepción cargada en `schedule_exceptions`, reunión vieja cancelada en Zoom, nueva creada). Las 6 reuniones de octubre restantes (22→ahora 20/10, 24/10, 29/10, 31/10 + las 6 que ya estaban) verificadas 1:1 contra `listMeetingIds` — 10 reales, 10 en la base, sin huérfanas.

PRÓXIMAS PRIORIDADES:
1. Confirmar con el usuario si la visita del superintendente también afecta la reunión de fin de semana del 24/10 (se asumió que no, sin confirmación explícita).
2. Verificar el próximo disparo real de la cadena de crons (reconcile :00 → session-check :20 → drift-check :30, UTC) ahora que el token está sincronizado — debería correr sola en verde por primera vez desde el 17/9.
3. Ver cuánto dura la sesión de Zoom ahora que `zoom_session_state` tiene datos reales por primera vez (antes no se podía medir porque la tabla nunca se sembraba).
4. Si se vuelve a tocar `zoom-browser.ts`: correr `npm run test:run`/`playwright test` completos aunque el cambio parezca acotado (esta sesión solo corrió tsc + toda la suite igual, pero no había tests unitarios afectados — no dar por sentado que siempre va a ser así).

CONTEXTO TÉCNICO:
- Leer ARCHITECTURE.md (gotchas nuevos de zoom-browser.ts) y PROGRESS.md/ZOOM_AUTOMATION.md (entrada/sección 2026-09-27, "Dónde vive la sesión") antes de tocar zoom-automation/ o supabase/functions/.
- Si `reconcile` vuelve a fallar en silencio (sin ocurrencias nuevas por varios días pese a que pg_cron está activo): chequear `net._http_response` (vía `supabase db query --linked "select * from net._http_response order by created desc"`) ANTES de sospechar de la sesión de Zoom — se purga sola, mirarla poco después de una corrida.
- Si la sesión vence: recapturar con `npm run zoom:capture-session` desde una terminal REAL (no con `!`), luego `npm run zoom:upload-session`.
- Antes de reintentar a mano un `create` de zoom_outbox que ya falló: correr `listMeetingIds()` primero para descartar que ya haya quedado creada en Zoom (ver ARCHITECTURE.md).
- Acciones irreversibles contra la cuenta real de Zoom (cancelar una reunión) quedan bloqueadas por el clasificador de modo automático — pedir confirmación explícita al usuario antes, no buscar un rodeo.
- El usuario autorizó `supabase db push`, `supabase secrets set`, `supabase db query --linked` y comandos `gh` en este proyecto; `gh secret delete` sigue bloqueado para el asistente. Nunca pedir credenciales por el chat; si el usuario pega una, señalarla y recomendar rotar.
- Verificar con `npx tsc --noEmit` (raíz y zoom-automation): Vitest no tipa.
- Cuando el usuario numera respuestas, los números refieren a los puntos de MI mensaje anterior.
- Sin líneas Co-Authored-By en commits.
```
