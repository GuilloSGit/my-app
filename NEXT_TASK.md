# NEXT_TASK — Prompt para la próxima sesión

> Lo sobrescribe `/cierre` (paso 6) al final de cada sesión. Para retomar,
> pegar el bloque de abajo como primer mensaje. Última actualización:
> 2026-11-23 (cierre).

```
Continuamos con congre-zoom (Congregación Media Agua; repo `my-app`, carpeta ~/Projects/my-app). Estado: master con Next 16/React 19/ESLint 9 desplegado. El 23/11 bajamos la frecuencia de los chequeos con navegador: zoom-drift-check 1/semana (lunes 00:30Z) y zoom-session-check 2/semana (lunes y jueves 00:20Z); reconcile/apply siguen cada 10hs. Hipótesis a validar: el uso frecuente de la sesión de Zoom la vence (venció ~17 h después de recapturarla el 21/11).

COMPLETADO (2026-11-23):
- Crons cambiados y pusheados (299b735); comentarios y docs (ARCHITECTURE, ZOOM_AUTOMATION, PROGRESS) alineados.
- Prueba de "llamada liviana" (GET sin navegador con cookies guardadas a jworg.zoom.us/meeting): 302 a /signin con la copia local del 21/11. INCONCLUSO (¿copia vencida? ¿Zoom exige cf_clearance/UA/IP?).

PRÓXIMAS PRIORIDADES:
1. Ver si la sesión sobrevive con menos chequeos: `gh run list --workflow=zoom-session-check.yml` (próximos: jueves 26/11 00:20Z) y que no corran slots fuera de lun/jue. Si vence de nuevo sin uso, la hipótesis del uso frecuente se descarta.
2. Llamada liviana diaria (punto pendiente del usuario): probarla con la sesión vigente del CI (no con la copia local vieja). Ver si el GET con cookies alcanza o si renueva/mantiene la sesión; si sí, implementarla como workflow diario sin Playwright.
3. Confirmar PWA instalada con el deploy nuevo (service worker puede servir la vieja) y que no hay reuniones duplicadas en Próximas (11).
4. Pendientes viejos: redeploy de `exception-create` (cosmético, requiere OK); confirmar con el usuario la reunión del 24/10.
5. Docs grandes (PROGRESS.md ~126 KB, ZOOM_AUTOMATION.md 55 KB, ARCHITECTURE.md ~30 KB, ROADMAP.md 22 KB, memoria project_my_app.md ~60 KB): proponer compactarlos antes de reorganizar.

CONTEXTO TÉCNICO:
- No leer enteros los docs grandes: `grep -n '^## '` + `sed -n 'A,Bp'`. Cadena de crons: ZOOM_AUTOMATION.md → "Cadena de crons". Gotcha de la UI de Zoom: ARCHITECTURE.md → Gotchas conocidos.
- Sesión local: `zoom-automation/.session/zoom-storage-state.json` (capturada 21/11); no usar la del CI en local. Cuenta jworg.zoom.us, UI en inglés.
- Next 16: lint = `eslint .`. Playwright requiere `npx playwright install chromium`.
- Antes de reintentar un `create` fallido: listMeetingIds()/check-session. Acciones irreversibles contra Zoom real y deploys: pedir confirmación.
- Verificar antes de pushear: lint, build, test:run, tsc (+ zoom-automation), Playwright.
- Sin líneas Co-Authored-By ni atribución a Claude en commits/PRs.
```
