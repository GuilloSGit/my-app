# NEXT_TASK — Prompt para la próxima sesión

> Lo sobrescribe `/cierre` (paso 6) al final de cada sesión. Para retomar,
> pegar el bloque de abajo como primer mensaje. Última actualización:
> 2026-10-10.

```
Continuamos con my-app (Congregación Media Agua). Estado: todo commiteado y pusheado a master, sesión de Zoom recapturada y activa el 10/10, reuniones hasta el 14/11 creadas y sincronizadas.

COMPLETADO (2026-10-10):
- Sesión de Zoom vencida: recapturada con `zoom:capture-session` + `zoom:upload-session`; `check-session` ok.
- Jobs `create` 110/111 (12/11 y 14/11) estaban `failed` por la sesión vencida; verificado que no existían en Zoom, reseteados a pending y aplicados con `zoom:apply` → synced (87295421310, 82312858396).
- Fix en `zoom-automation/drift-check.ts`: ya no verifica ocurrencias `cancelled` (reventaba con la del 22/10). 0 divergencias. lint/build/Vitest 212/tsc/Playwright 7 verdes.
- Medido: la sesión de Zoom dura ~2 días (ok hasta 29/9 00:23 UTC, rojo desde 29/9 16:32 UTC hasta la recaptura). Detalle en PROGRESS.md 2026-10-10.

PRÓXIMAS PRIORIDADES:
1. El problema de fondo: la sesión vence cada ~2 días, así que la automatización se rompe sola. Decidir con el usuario la estrategia (login scripteado con riesgo de CAPTCHA/verificación, recaptura periódica a mano, o mantener la sesión viva con más frecuencia) — no implementar sin acordar.
2. Confirmar con el usuario si la visita del superintendente afecta también la reunión del sábado 24/10 (se asumió que no).
3. Confirmar que `reconcile` genera solo las ocurrencias posteriores al 14/11 en su próxima corrida (cron cada 10hs).
4. Si se toca zoom-browser.ts: correr suites completas (Vitest, tsc raíz y zoom-automation, Playwright).

CONTEXTO TÉCNICO:
- Leer ARCHITECTURE.md (gotchas de zoom-browser.ts), PROGRESS.md (2026-09-27 y 2026-10-10) y ZOOM_AUTOMATION.md ("Dónde vive la sesión") antes de tocar zoom-automation/ o supabase/functions/.
- Recapturar sesión: `npm run zoom:capture-session` en terminal REAL (no con `!`), luego `npm run zoom:upload-session`.
- Antes de reintentar un `create` fallido: comparar con `listMeetingIds()`/`check-session` para no duplicar. Para reencolar: update zoom_outbox set status='pending', attempts=0, available_at=now(), last_error=null.
- Esquema: tabla `meeting_occurrences` (columna `starts_at`, `status`, `zoom_meeting_id`), `zoom_outbox`, `zoom_session_checks`.
- Si `reconcile` falla en silencio: mirar `net._http_response` antes de sospechar de la sesión.
- Acciones irreversibles contra Zoom real (cancelar) requieren confirmación explícita del usuario.
- Autorizados: `supabase db push`, `supabase secrets set`, `supabase db query --linked`, `gh`. Nunca pedir credenciales por chat.
- Sin líneas Co-Authored-By en commits.
```
