# NEXT_TASK — Prompt para la próxima sesión

> Lo sobrescribe `/cierre` (paso 6) al final de cada sesión. Para retomar,
> pegar el bloque de abajo como primer mensaje. Última actualización:
> 2026-11-23 (cierre).

```
Continuamos con congre-zoom (Congregación Media Agua; repo `my-app`, carpeta ~/Projects/my-app). Estado: master con Next 16/React 19/ESLint 9 desplegado. El 23/11 bajamos la frecuencia de los chequeos con navegador: zoom-drift-check 1/semana (lunes 00:30Z) y zoom-session-check 2/semana (lunes y jueves 00:20Z); reconcile/apply siguen cada 10hs. Hipótesis a validar: el uso frecuente de la sesión de Zoom la vence (venció ~17 h después de recapturarla el 21/11).

COMPLETADO (2026-11-23):
- Crons cambiados y pusheados (299b735); comentarios y docs (ARCHITECTURE, ZOOM_AUTOMATION, PROGRESS) alineados.
- Prueba de "llamada liviana" (GET sin navegador con cookies guardadas a jworg.zoom.us/meeting): 302 a /signin con la copia local del 21/11. con la sesión vigente de la base tampoco funciona (ver prioridad 2). También cerrados: sin duplicados en Próximas (la base tiene 10 futuras synced; las 11 de Zoom incluían el sábado 21/11), `exception-create` ya estaba al día ("No change found"), PWA con skipWaiting.

PRÓXIMAS PRIORIDADES:
1. Ver si la sesión sobrevive con menos chequeos: `gh run list --workflow=zoom-session-check.yml` (próximos: jueves 26/11 00:20Z) y que no corran slots fuera de lun/jue. Si vence de nuevo sin uso, la hipótesis del uso frecuente se descarta.
2. Llamada liviana diaria: DESCARTADA el 23/11 (GET con solo las cookies de la sesión vigente de la base → 302 a /signin en /meeting, /profile y zoom.us; probado con UA/headers de navegador). Si se quiere mantener viva la sesión sin Playwright habría que investigar otra vía; no es prioridad.
3. Reunión del 24/10: en la base figura `synced` (zoom_meeting_id 83266603097) y el drift-check da 0 divergencias; solo falta que el usuario confirme que era la correcta.
4. Docs grandes (PROGRESS.md ~126 KB, ZOOM_AUTOMATION.md 55 KB, ARCHITECTURE.md ~30 KB, ROADMAP.md 22 KB, memoria project_my_app.md ~60 KB): proponer compactarlos antes de reorganizar.

CONTEXTO TÉCNICO:
- No leer enteros los docs grandes: `grep -n '^## '` + `sed -n 'A,Bp'`. Cadena de crons: ZOOM_AUTOMATION.md → "Cadena de crons". Gotcha de la UI de Zoom: ARCHITECTURE.md → Gotchas conocidos.
- Sesión local: `zoom-automation/.session/zoom-storage-state.json` (capturada 21/11); no usar la del CI en local. Cuenta jworg.zoom.us, UI en inglés.
- Next 16: lint = `eslint .`. Playwright requiere `npx playwright install chromium`.
- Antes de reintentar un `create` fallido: listMeetingIds()/check-session. Acciones irreversibles contra Zoom real y deploys: pedir confirmación.
- Verificar antes de pushear: lint, build, test:run, tsc (+ zoom-automation), Playwright.
- Sin líneas Co-Authored-By ni atribución a Claude en commits/PRs.
```
