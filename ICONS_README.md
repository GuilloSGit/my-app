# Iconos y Favicons

> Actualizado 2026-07-05. La versión anterior (9 de abril) listaba iconos
> como "necesitan generarse" que en la práctica nunca se generaron con esos
> nombres — el proyecto terminó con otro esquema, ya completo.

## Estado real: completo

Todos los iconos que la app usa **ya están generados** en `public/` y son
los que efectivamente sirve la app (referenciados desde `app/layout.tsx` y
`public/manifest.json`, no hace falta generar nada más):

| Archivo | Tamaño | Uso | Referenciado en |
|---|---|---|---|
| `favicon.svg` | vectorial | favicon principal | `app/layout.tsx` (`icons.icon`) |
| `favicon-16x16.png` | 16×16 | favicon pequeño | `app/layout.tsx`, `manifest.json` |
| `favicon-32x32.png` | 32×32 | favicon estándar | `app/layout.tsx`, `manifest.json` |
| `favicon.ico` | multi-res | favicon clásico | `app/layout.tsx` (`icons.shortcut`) |
| `apple-touch-icon.png` | 180×180 | iOS/macOS home screen | `app/layout.tsx` (`icons.apple`) |
| `safari-pinned-tab.svg` | vectorial | Safari pinned tab | `app/layout.tsx` (`icons.other`, color `#0d9488`) |
| `android-chrome-192x192.png` | 192×192 | Android/PWA | `manifest.json` |
| `android-chrome-512x512.png` | 512×512 | PWA store/splash | `manifest.json` |

El esquema real terminó siendo el de **RealFaviconGenerator** (nombres
`android-chrome-*`, `apple-touch-icon`, `favicon-*`), no el esquema
`icon-72x72.png`/`icon-144x144.png`/etc. que proponía la versión vieja de
este doc — ese esquema alternativo nunca se generó y no hace falta generarlo.

## Archivo obsoleto sin usar: `public/site.webmanifest`

Existe `public/site.webmanifest` con `name`/`short_name` vacíos — es un
artefacto abandonado de antes de que `public/manifest.json` (el que sí se usa
de verdad, referenciado en `app/layout.tsx` como `manifest: ${basePath}/manifest.json`)
se completara con el contenido real. No lo referencia nada del código. Se
puede borrar con seguridad si en algún momento se hace limpieza, pero no se
tocó en esta pasada para no mezclar una limpieza de archivos con la
actualización de docs.

## Si hay que regenerar/cambiar el diseño

1. Editar `public/favicon.svg` (color principal `#0d9488`, teal de Media Agua).
2. Regenerar los PNG desde ahí. Opciones:
   - Abrir `public/icon-generator.html` en el navegador (generador local, ya
     incluido en el repo) y descargar cada tamaño.
   - Subir el SVG a [realfavicongenerator.net](https://realfavicongenerator.net/)
     (así se generó el set actual) o [favicon.io](https://favicon.io/).
3. Reemplazar los archivos en `public/` con los mismos nombres de la tabla de
   arriba — no hace falta tocar `app/layout.tsx` ni `manifest.json` si los
   nombres no cambian.

## Verificación después de cambiar algo

- [RealFaviconGenerator checker](https://realfavicongenerator.net/favicon_checker)
- Chrome DevTools → Application → Manifest (para PWA/`manifest.json`)
- Safari → Develop → Show Web Inspector → Icons

## Instalación en dispositivos (sin cambios, sigue vigente)

- **Android/Chrome**: menú → "Agregar a pantalla de inicio".
- **iOS/Safari**: Compartir → "Agregar a pantalla de inicio" (usa `apple-touch-icon.png`).
- **Windows/Edge/Chrome desktop**: menú → "Apps" → "Instalar esta página como una aplicación".
- **macOS/Safari**: Archivo → "Agregar al Dock".
