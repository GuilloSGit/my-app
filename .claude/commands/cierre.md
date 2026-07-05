# /cierre — Cierre de sesión de trabajo (my-app)

Checklist de cierre para **my-app** (Congregación Media Agua — Next.js 14 +
Supabase, deploy a GitHub Pages). Un solo repo, un solo push. Ejecutá todo en
orden y reportá cada paso antes de pasar al siguiente.

## Regla de push durante la sesión

**Durante la sesión: `git commit` local después de cada tarea, pero NO `git push`.**
El push único se hace al final del cierre, junto con la memoria/docs.

---

## 0. Leer la documentación antes de tocar nada

Antes de editar código, memoria o docs en este cierre, leé lo que sea
relevante a lo que se hizo en la sesión:

- `README.md` — setup, comandos, flujo de auth, cómo agregar un test.
- `ARCHITECTURE.md` — estructura real del sistema y gotchas conocidos.
- `AGENTS.md` — convenciones y verificación antes de dar algo por terminado.
- `GITHUB_PAGES.md` — si la sesión tocó deploy/CI.
- `ICONS_README.md` — si la sesión tocó PWA/manifest/iconos.

No asumas el contenido por lo que recordás de sesiones anteriores — estos
docs cambian, y actualizar el paso 3 sobre una versión vieja en la cabeza
produce docs desincronizados entre sí.

---

## 1. Estado git

Repo: `/Users/guillermoandrada/Projects/my-app`.

```bash
git status --short
git log --oneline -5
git diff origin/master...HEAD --stat
```

Si hay cambios sin commitear que deberían guardarse, commiteá con mensaje
Conventional Commits antes de continuar. Si hay algo local que **no** debe
commitearse (no debería haberlo — este repo no tiene rewrites locales tipo
Pay Alert), mencionalo explícitamente.

---

## 2. Actualizar memoria del proyecto

Memoria en:
`~/.claude/projects/-Users-guillermoandrada-Projects-my-app/memory/`

Archivos existentes: `project_my_app.md` (estado del proyecto, incidentes,
gotchas técnicos) y `feedback_verify_before_push.md` (hábito de verificación).

- Agregá al `project_my_app.md` lo nuevo de la sesión: features, bugs
  resueltos, decisiones técnicas, incidentes de infra (ej. Supabase pausado).
- Fechá cada entrada nueva (no reescribas entradas viejas salvo que hayan
  quedado obsoletas).
- Si surgió una guía de trabajo nueva (algo que el usuario corrigió o
  confirmó explícitamente), agregala como memoria `feedback` separada o
  ampliá `feedback_verify_before_push.md` si es del mismo tema.
- Actualizá `MEMORY.md` si cambiaron las descripciones o hay un archivo nuevo.

La memoria es local (fuera del repo) — no se commitea ni se pushea.

---

## 3. Actualizar documentación del repo

Editá (sin commitear todavía) lo que corresponda según qué tocó la sesión —
ya los leíste en el paso 0, así que la actualización parte del contenido
real, no de memoria:

- `README.md` — setup, comandos, flujo de auth, sección `## Tests`,
  `## Estructura del proyecto`, `## Deploy`.
- `ARCHITECTURE.md` — si cambió algo de la estructura del sistema, el modelo
  de datos, auth/autorización, CI/CD, testing, o si apareció un gotcha nuevo.
- `AGENTS.md` — si cambió algún comando, convención, o gotcha relevante para
  trabajar en el repo.
- `GITHUB_PAGES.md` — si cambió el mecanismo de deploy o algo de CI.
- `ICONS_README.md` — si cambiaron iconos/manifest/PWA.

Solo tocá las secciones donde algo realmente cambió. No dupliques contenido
entre docs — `ARCHITECTURE.md` es la referencia de sistema, `AGENTS.md` es
la de cómo trabajar, `README.md` es la de setup/uso.

---

## 4. Verificación obligatoria antes de pushear

**Regla: no se pushea sin verificar. Sin excepciones.**

```bash
npm run lint          # ESLint
npm run build          # build de producción (output: export)
npm run test:run       # Vitest — unitarios + integración + componentes
npx playwright test    # E2E (requiere haber corrido `npx playwright install chromium` alguna vez)
```

Si algo de esto falla: **no pushear**, arreglar primero. Si el cambio de la
sesión tocó `login/`, `dashboard/` o cualquier componente compartido
(`Navbar`, `ThemeToggle`, etc.), probalo también visualmente (Puppeteer o
`npm run dev` + navegador) antes de dar el fix por bueno — los tests no
reemplazan ver el flujo andar.

Limpiá artifacts generados antes de continuar:
```bash
rm -rf dist .next test-results playwright-report
```

---

## 5. Push final — un solo push

```bash
git status --short   # confirmar qué quedó pendiente
git add <archivos>
git commit -m "tipo: descripción (Conventional Commits)"
git push origin master
```

Después del push, confirmá que el workflow de GitHub Actions corrió bien
(el job `test` gatea `build`/`deploy` — si `test` falla, no se despliega):

```bash
gh run list --branch master --limit 1
gh run view <run-id>        # repetir/esperar hasta ver test ✓ build ✓ deploy ✓
```

Reportá el resultado (run id, jobs en verde) antes de seguir.

---

## 6. Prompt para la próxima sesión

Generá un prompt completo y autónomo:

```
Continuamos con my-app (Congregación Media Agua). Estado actual: <resumen breve>.

COMPLETADO esta sesión:
- <lista>

PRÓXIMAS PRIORIDADES (si las hay, si no decir "sin pendientes urgentes"):
1. ...

CONTEXTO TÉCNICO NECESARIO:
- <archivos clave a leer antes de tocar código>
- <decisiones ya tomadas que no hay que re-discutir>
- <gotchas conocidos: ej. Supabase free tier se pausa solo, Vitest 4 requiere Node >=20, el seam window.__E2E_SUPABASE__ en lib/supabase.ts es para Playwright>

Credenciales / accesos: acceso a supabase.com/dashboard (guillermoandrada@gmail.com) si hace falta pausar/resumir el proyecto.
```
