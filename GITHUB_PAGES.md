# Deploy en GitHub Pages

> Actualizado 2026-07-05. Reemplaza la versión anterior (9 de abril), que
> describía un flujo por rama `gh-pages` que ya no es el que corre.

## Cómo se despliega hoy

El deploy es **100% automático vía GitHub Actions**, usando el mecanismo
nativo de GitHub Pages (`actions/deploy-pages`), no una rama `gh-pages`.
Workflow: `.github/workflows/deploy.yml`.

```
push a master/main
   │
   ▼
job "test"    → npm run test:run (Vitest) + npx playwright test (E2E)
   │             si algo falla, ACÁ TERMINA. No se construye ni se publica nada.
   ▼
job "build"   → npm run build (next build, output: export) → dist/
   │             sube dist/ como Pages artifact (actions/upload-pages-artifact)
   ▼
job "deploy"  → actions/deploy-pages publica el artifact
```

No existe (ni hace falta) `npm run deploy` como paso manual de rutina — el
script sigue existiendo en `package.json` (`next build && touch dist/.nojekyll
&& gh-pages -d dist`) como fallback manual si alguna vez GitHub Actions no
estuviera disponible, pero **no es el camino que usa el proyecto**. La rama
remota `gh-pages` puede seguir existiendo en el repo como remanente de un
enfoque anterior; no la borra el pipeline actual y no hace falta tocarla.

## Variables de entorno

Se configuran como **Variables** (no Secrets) en:
**Settings → Secrets and variables → Actions → Variables**

- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_AUTHORIZED_EMAILS`
- `NEXT_PUBLIC_ADMIN_EMAIL`

La `anon key` de Supabase es pública por diseño (no es un secret real); las
RLS policies en Supabase son las que efectivamente protegen los datos.

## Node version

El workflow corre con **Node 20** en los tres jobs. No bajarlo a 18: Vitest 4
requiere Node ≥20 (falla con un `SyntaxError` sobre `node:util`'s `styleText`
si se corre en Node 18 — ver `test job` de CI si esto se toca).

## URLs de la app

```
https://guillosgit.github.io/my-app/            Landing
https://guillosgit.github.io/my-app/login/      Login (magic link)
https://guillosgit.github.io/my-app/dashboard/  Dashboard (requiere sesión)
```

## Configuración técnica (next.config.js)

```js
output: isProd ? 'export' : undefined,   // export estático solo en prod
distDir: isProd ? 'dist' : '.next',
basePath: isProd ? '/my-app' : '',       // GitHub Pages sirve desde /my-app
assetPrefix: isProd ? '/my-app/' : '',
trailingSlash: true,
```

`isProd` se decide por `NODE_ENV === 'production'`, que `next build` setea
solo — no hace falta (ni hay que) setearlo a mano.

`.nojekyll` se genera en el build (ver script `deploy` en package.json y el
job `build` del workflow) para que GitHub Pages no intente procesar `_next/`
con Jekyll.

## Autenticación

**No es client-side/localStorage** (así lo describía la versión vieja de
este doc). Desde la migración a Supabase Auth (2026-05-25), el login es un
magic link real: Supabase manda el email, verifica la sesión vía JWT firmado,
y las RLS policies de Postgres son las que efectivamente bloquean el acceso a
los datos sin sesión válida — funciona igual en GitHub Pages (estático) que
en cualquier otro hosting, porque toda la lógica de auth vive en el cliente
hablando directo con Supabase, no en un backend propio.

## Troubleshooting

### La home funciona pero `/login/` o `/dashboard/` dan 404
**Chequear primero la fuente de Pages, antes que nada:**
```bash
gh api repos/GuilloSGit/my-app/pages -q '{build_type, source}'
```
Tiene que decir `"build_type":"workflow"`. Si dice `"legacy"`, GitHub está
publicando el sitio con su propio build automático de Jekyll (dispara un job
`pages build and deployment` en paralelo a nuestro workflow, visible en
`gh run list`) — Jekyll renderiza el `README.md` de la raíz como si fuera la
home (por eso "algo" se ve en `/`), pero no tiene ni idea de `/login`ni
`/dashboard`, así que esas rutas 404 aunque nuestro workflow haya corrido
perfecto. Pasó el 2026-07-05. Fix:
```bash
gh api -X PUT repos/GuilloSGit/my-app/pages -f build_type=workflow
gh workflow run deploy.yml   # republicar
```
Después de cambiar `build_type`, la propagación puede tardar varios minutos
(los `curl` seguían mostrando el contenido viejo un rato después de que la
API ya confirmaba el cambio y el deploy decía `success`) — no hay forma de
apurarlo vía API/CLI, solo esperar y reintentar.

### El login da "Failed to fetch"
Antes de sospechar del código: los proyectos Supabase free tier se pausan
solos tras ~7 días de inactividad. Revisar el estado del proyecto en
supabase.com/dashboard y hacer "Resume" si está pausado (pasó el
2026-07-04, ver memoria del proyecto).

### El job `test` falla en CI pero pasa en local
Revisar la versión de Node — Vitest 4 necesita ≥20 (ver arriba).

### Assets 404 / rutas rotas
- Confirmar `basePath`/`assetPrefix` en `next.config.js`.
- Confirmar que `.nojekyll` existe en `dist/` tras el build.
- `trailingSlash: true` es necesario para que las rutas del export estático
  resuelvan bien en GitHub Pages.

### Los cambios no aparecen
- Puede tardar 1-2 minutos en propagar tras un deploy exitoso.
- Confirmar en `gh run list` / `gh run view` que el run terminó en verde
  (test ✓ build ✓ deploy ✓), no asumirlo.
