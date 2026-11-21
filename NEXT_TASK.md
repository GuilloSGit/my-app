# NEXT_TASK — Prompt para la próxima sesión

> Lo sobrescribe `/cierre` (paso 6) al final de cada sesión. Para retomar,
> pegar el bloque de abajo como primer mensaje. Última actualización:
> 2026-11-20.

```
Continuamos con congre-zoom (Congregación Media Agua; repo de GitHub `my-app`, carpeta ~/Projects/my-app). Estado: master tiene el fix de la UI de Zoom (fba28ef, pusheado). La rama `chore/migrar-next-16` (Next 16/React 19/ESLint 9) está verde pero SIN mergear ni pusheada a master.

COMPLETADO (2026-11-20):
- Sesión de Zoom recapturada (la hizo el usuario) tras `readMeetingSummary` → /signin.
- Zoom cambió su UI: "Edit" pasó de link a botón; el `/s/<id>` de la lista es "Start". Fix con `editControl()` en zoom-browser.ts. Verificado headed en local: lectura, Schedule (selectores) y diálogo Delete (cerrado con Cancel).
- Dependencias al día; migración a Next 16 en rama (lint/tsc/213 tests/build/7 e2e verdes, npm audit 0).

PRÓXIMAS PRIORIDADES:
1. Confirmar que el drift-check de GitHub Actions volvió a andar en master (`gh run list --workflow zoom-drift-check.yml`; disparar a mano si hace falta).
2. Revisar a ojo `/dashboard` y `/dashboard/automatizacion` en la rama (`npm run dev`, login por magic link) y, si está bien, mergear a master (deploy.yml despliega a Pages al pushear master; confirmar test ✓ build ✓ deploy ✓).
3. Probar contra Zoom real los clicks finales de create ("Save") y cancel ("Delete") creando y borrando UNA reunión de prueba — pedir OK al usuario antes. Hay un TODO(codegen) en createMeeting.
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
