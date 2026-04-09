# 🚀 Deploy en GitHub Pages

Este proyecto está configurado para deploy automático en GitHub Pages.

## 📋 Configuración

La app usa:
- **Base URL:** `https://guillosgit.github.io/my-app/`
- **Branch de deploy:** `gh-pages`
- **Carpeta de build:** `dist/`

## 🔧 Opciones de Deploy

### Opción 1: Deploy Automático (Recomendado)

Ejecuta el script de deploy:

```bash
npm run deploy
```

Esto:
1. Compila el proyecto (`next build`)
2. Crea `.nojekyll` (desactiva procesamiento Jekyll)
3. Sube a la rama `gh-pages` de GitHub

### Opción 2: GitHub Actions (CI/CD)

Crea `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

permissions:
  contents: write
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run build
      - uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
```

### Opción 3: Manual por Web

1. Ve a **Settings** → **Pages** en tu repo
2. Selecciona **Deploy from a branch**
3. Elige la rama `gh-pages` y carpeta `/ (root)`
4. Click en **Save**

## ⚙️ Configurar Repo para gh-pages

### Instalación de gh-pages (ya hecha)

```bash
npm install --save-dev gh-pages
```

### Configurar GitHub Pages en el repo:

1. Ve a tu repo en GitHub
2. **Settings** → **Pages** (en el sidebar izquierdo)
3. En **Build and deployment**:
   - Source: **Deploy from a branch**
   - Branch: **gh-pages** / **/(root)**
4. Click **Save**

## 🌐 URLs de Acceso

Una vez deployado, accede en:

```
https://guillosgit.github.io/my-app/
```

### Rutas de la App

| Ruta | URL Completa |
|------|--------------|
| Landing | `https://guillosgit.github.io/my-app/` |
| Login | `https://guillosgit.github.io/my-app/login/` |
| Dashboard | `https://guillosgit.github.io/my-app/dashboard/` |

## 🔧 Configuraciones Técnicas

### next.config.js

```javascript
basePath: '/my-app',
assetPrefix: '/my-app/',
trailingSlash: true,
```

Esto asegura que los assets y rutas funcionen correctamente en el subdirectorio de GitHub Pages.

### .nojekyll

El archivo `.nojekyll` evita que GitHub procese el sitio con Jekyll, permitiendo que los archivos que empiezan con `_` (como `_next/`) se sirvan correctamente.

## 📁 Estructura del Build

```
dist/
├── index.html              # Landing
├── login/
│   └── index.html          # Login
├── dashboard/
│   └── index.html          # Dashboard
├── _next/                  # Assets de Next.js
├── favicon.svg
├── manifest.json
└── .nojekyll               # Evita Jekyll
```

## 🔄 Flujo de Trabajo

1. **Desarrollo:**
   ```bash
   npm run dev
   ```

2. **Build local:**
   ```bash
   npm run build
   ```

3. **Deploy:**
   ```bash
   npm run deploy
   ```

4. **Verificar:** Espera 1-2 minutos y visita `https://guillosgit.github.io/my-app/`

## ⚠️ Consideraciones

- GitHub Pages tiene **límite de 100MB** por repo
- **No soporta** Server-Side Rendering (por eso usamos `output: 'export'`)
- Los cambios pueden tardar **1-5 minutos** en propagarse
- La autenticación es **client-side** (localStorage), funciona en static hosting

## 🆘 Troubleshooting

### Assets 404
- Verifica que `basePath` y `assetPrefix` estén correctos
- Asegúrate de que `.nojekyll` exista en `dist/`

### Rutas no funcionan
- Usa `trailingSlash: true` en next.config.js
- Enlaces con `<a href="/my-app/login/">` en lugar de rutas absolutas

### Cambios no aparecen
- Limpia caché: **Ctrl + F5**
- Verifica en modo incógnito
- Revisa la rama `gh-pages` en GitHub

## 📚 Recursos

- [GitHub Pages Docs](https://docs.github.com/en/pages)
- [Next.js Static Export](https://nextjs.org/docs/app/building-your-application/deploying/static-exports)
- [gh-pages npm](https://www.npmjs.com/package/gh-pages)
