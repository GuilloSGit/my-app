# NEXT_TASK — Prompt para la próxima sesión

> Lo sobrescribe `/cierre` (paso 6) al final de cada sesión. Para retomar,
> pegar el bloque de abajo como primer mensaje. Última actualización:
> 2026-09-19.

```
Continuamos con my-app (Congregación Media Agua). Estado: todo commiteado y pusheado a master, deploy en verde, migración 20260919140000 aplicada.

COMPLETADO (2026-09-19): rediseño del panel /dashboard/automatizacion + link "Dashboard" en el navbar; drift-check verificado contra la cuenta real (0 divergencias); "Verificar sesión" con constancia (URL, reuniones vistas, captura, link a la corrida); crons encadenados cada 10hs (reconcile :00 pg_cron → session-check :20 → drift-check :30, 00/10/20 UTC) con concurrency `zoom-account` y mail solo por divergencias nuevas.

PRÓXIMAS PRIORIDADES:
1. Verificar el primer disparo real de los crons de GitHub (`gh run list`): que session-check y drift-check corran a :20/:30 y no se pisen con reconcile/apply.
2. Mirar `zoom_session_checks` (source='schedule') para ver cuánto dura la sesión de Zoom; si vence en horas y no en semanas, investigar (hipótesis: Zoom invalida al usarla desde dos lugares).
3. Opcional: leer el email de la cuenta en /profile (`account_label` sigue null; solo evidencia, no decide el OK).
4. Probar navbar/panel logueado con `npm run dev` (el magic link no se puede automatizar).

CONTEXTO TÉCNICO:
- Leer PROGRESS.md (entradas 2026-09-19) y ZOOM_AUTOMATION.md ("Cadena de crons", "Chequeo de sesión") antes de tocar zoom-automation/ o supabase/functions/.
- Si la sesión vence: recapturar con `npm run zoom:capture-session` desde una terminal REAL (no con `!`), luego `npm run zoom:upload-session` (ahora borra los pedazos sobrantes solo).
- El usuario autorizó `supabase db push` y comandos `gh` en este proyecto; `gh secret delete` sigue bloqueado para el asistente. Nunca pedir credenciales por el chat; si el usuario pega una, señalarla y recomendar rotar.
- Verificar con `npx tsc --noEmit` (raíz y zoom-automation): Vitest no tipa.
- Cuando el usuario numera respuestas, los números refieren a los puntos de MI mensaje anterior.
- Sin líneas Co-Authored-By en commits.
```
