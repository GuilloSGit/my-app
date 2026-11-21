# NEXT_TASK — Prompt para la próxima sesión

> Lo sobrescribe `/cierre` (paso 6) al final de cada sesión. Para retomar,
> pegar el bloque de abajo como primer mensaje. Última actualización:
> 2026-11-21 (cierre).

```
Continuamos con congre-zoom (Congregación Media Agua; repo de GitHub `my-app`, carpeta ~/Projects/my-app). Estado: master (56ec03b) tiene el fix de la UI de Zoom y la migración a Next 16/React 19/ESLint 9, ya desplegada en Pages (test/build/deploy verdes). La rama de migración se borró. Sesión de Zoom recapturada el 21/11 y drift-check manual OK (0 divergencias).

COMPLETADO (2026-11-20/21):
- Sesión de Zoom recapturada (la hizo el usuario) tras `readMeetingSummary` → /signin.
- Zoom cambió su UI: "Edit" pasó de link a botón; el `/s/<id>` de la lista es "Start". Fix con `editControl()` en zoom-browser.ts. Verificado headed en local: lectura, Schedule (selectores) y diálogo Delete (cerrado con Cancel).
- Dependencias al día; migración a Next 16 mergeada y desplegada (lint/tsc/213 tests/build/7 e2e verdes, npm audit 0); /dashboard y /automatizacion revisados a ojo por el usuario.
- 21/11: create→update→cancel verificados contra Zoom real con reuniones de prueba (sin restos).
- 21/11: la sesión de Zoom volvió a vencer ~17 h después de la captura (también la copia local); causa NO confirmada (¿uso local simultáneo con CI? ¿el cron de 10:20Z no corre?). Recapturada y drift-check OK.

PRÓXIMAS PRIORIDADES:
1. Vigilar la sesión de Zoom: si vuelve a vencer sin uso, investigar por qué el session-check programado corre solo ~2 veces al día (slots 10:20Z/10:30Z no aparecen) y no usar la sesión del CI en local (capturar una aparte para inspeccionar la UI).
2. Confirmar que el deploy publicado anda en la PWA instalada (el service worker puede servir la versión vieja hasta recargar). El session-check de las 16:33Z (21/11) pasó tras el uso local, pero el vencimiento a las ~17 h sigue sin explicación: mirar si los session-check de las próximas 24 h pasan.
3. (Hecho 21/11) Ciclo create→cancel probado contra Zoom real con una reunión de prueba: OK. También `updateMeeting` verificado (editó tema/fecha/duración y se releyó). Los tres flujos de escritura están probados con la UI nueva.
4. La lista de Próximas pasó de 9 a 11 reuniones durante la sesión; no se investigó el origen (probable cron/reconcile). Confirmar que no hay duplicados.
5. Pendientes viejos: redeploy de `exception-create` (cosmético, requiere OK); confirmar con el usuario la reunión del 24/10.
6. Docs grandes (regla de documentación liviana): PROGRESS.md ~126 KB, ZOOM_AUTOMATION.md 55 KB, ARCHITECTURE.md ~30 KB, ROADMAP.md 22 KB, memoria project_my_app.md ~60 KB. Proponer compactarlos antes de reorganizar.

CONTEXTO TÉCNICO:
- No leer enteros los docs grandes: `grep -n '^## '` + `sed -n 'A,Bp'`. Gotcha de la UI de Zoom: ARCHITECTURE.md → Gotchas conocidos.
- Ver la UI real de Zoom: `ZOOM_HEADFUL=1` con la sesión local `zoom-automation/.session/zoom-storage-state.json`; scripts de inspección en el scratchpad (no en el repo). Cuenta jworg.zoom.us, UI en inglés.
- Next 16: `next lint` no existe, lint = `eslint .` (eslint.config.mjs). Playwright nuevo requiere `npx playwright install chromium`.
- Antes de reintentar un `create` fallido: listMeetingIds()/check-session para no duplicar. Acciones irreversibles contra Zoom real y deploys: pedir confirmación.
- Verificar antes de pushear: lint, build, test:run, tsc (+ zoom-automation), Playwright.
- Sin líneas Co-Authored-By ni atribución a Claude en commits/PRs.
```
