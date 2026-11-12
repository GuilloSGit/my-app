# NEXT_TASK — Prompt para la próxima sesión

> Lo sobrescribe `/cierre` (paso 6) al final de cada sesión. Para retomar,
> pegar el bloque de abajo como primer mensaje. Última actualización:
> 2026-11-12.

```
Continuamos con congre-zoom (Congregación Media Agua; repo de GitHub `my-app`, carpeta ~/Projects/my-app). Estado: todo pusheado a master; reuniones sincronizadas hasta el 12/12; sesión de Zoom activa (87 checks ok desde el 10/10).

COMPLETADO (2026-11-12):
- Mudanza verificada (lint, tsc, Vitest 213, build, Playwright 7 verdes).
- Renombre a `congre-zoom` solo en package.json/docs. El repo NO se renombra (rompe URL de Pages, PWA instalada, basePath, dispatch-workflow.ts, Redirect URLs de Supabase Auth).
- Fix 496f162: el dashboard mantiene la card completa 45 min después del inicio (GRACE_MINUTES en app/dashboard/page.tsx). El usuario pidió 45 min, no 2 h.
- Auditoría de workflows/crons/edge functions: sin fallos.

PRÓXIMAS PRIORIDADES:
1. Confirmar que el deploy del 12/11 quedó publicado y probar en la PWA instalada (el service worker puede servir la versión vieja hasta recargar).
2. NEXT_TASK anterior, prioridad 1 («la sesión vence cada ~2 días»): parece resuelta, 33+ días sin vencer, probable efecto de la renovación en CI (no verificado). Confirmar con el usuario y cerrarla; si vuelve a vencer, recapturar con `npm run zoom:capture-session` (terminal REAL) + `npm run zoom:upload-session`.
3. Pendiente de confirmar con el usuario: si la visita del superintendente afectó la reunión del sáb 24/10 (se asumió que no).
4. Redeploy de `exception-create` (metadata con ruta vieja /Users/guillermoandrada/my-app; cosmético). Requiere OK del usuario.
5. Docs grandes (aviso de cierre): PROGRESS.md 123 KB, ZOOM_AUTOMATION.md 55 KB, ARCHITECTURE.md 29 KB, ROADMAP.md 22 KB, memoria project_my_app.md 59 KB. Proponer al usuario compactarlos (regla de «documentación liviana») antes de reorganizar.

CONTEXTO TÉCNICO:
- No leer enteros los docs grandes: `grep -n '^## '` + `sed -n 'A,Bp'`.
- Leer antes de tocar zoom-automation/ o supabase/functions/: ARCHITECTURE.md (gotchas de zoom-browser.ts), PROGRESS.md (2026-09-27, 2026-10-10, 2026-11-12), ZOOM_AUTOMATION.md («Dónde vive la sesión»).
- Esquema: meeting_occurrences (starts_at, status, zoom_meeting_id; sin created_at), zoom_outbox, zoom_session_checks. Si reconcile falla en silencio: mirar net._http_response (el timeout de 5 s de pg_net es normal).
- Antes de reintentar un `create` fallido: comparar con listMeetingIds()/check-session para no duplicar.
- Acciones irreversibles contra Zoom real (cancelar) y deploys/escrituras en la base: pedir confirmación. Autorizados: supabase db push / secrets set / db query --linked, gh. Nunca pedir credenciales por chat.
- Verificar antes de pushear: lint, build, test:run, tsc (+ zoom-automation), Playwright.
- Sin líneas Co-Authored-By ni atribución a Claude en commits/PRs.
```
