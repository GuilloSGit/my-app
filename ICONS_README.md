# 📱 Iconos y Favicons

Este proyecto incluye soporte completo para PWA (Progressive Web App) con iconos para todas las plataformas.

## Archivos Generados

### ✅ Listos
- `favicon.svg` - Icono SVG vectorial (escalable)
- `safari-pinned-tab.svg` - Icono para Safari
- `manifest.json` - Configuración PWA
- `icon-generator.html` - Generador de iconos PNG

### ⚠️ Necesitan Generarse
Los siguientes iconos PNG deben generarse para completar la instalación:

| Archivo | Tamaño | Uso |
|---------|--------|-----|
| `favicon.ico` | 32x32 | Favicon clásico |
| `favicon-16x16.png` | 16x16 | Favicon pequeño |
| `favicon-32x32.png` | 32x32 | Favicon estándar |
| `apple-touch-icon.png` | 180x180 | iOS/macOS home screen |
| `icon-72x72.png` | 72x72 | Android |
| `icon-96x96.png` | 96x96 | Android |
| `icon-128x128.png` | 128x128 | Chrome/Edge |
| `icon-144x144.png` | 144x144 | Android |
| `icon-152x152.png` | 152x152 | iOS |
| `icon-192x192.png` | 192x192 | Android/PWA |
| `icon-256x256.png` | 256x256 | Windows/macOS |
| `icon-384x384.png` | 384x384 | PWA splash |
| `icon-512x512.png` | 512x512 | PWA store |

## 🎨 Generar Iconos

### Opción 1: Generador Local (Recomendado)
1. Abre el archivo `public/icon-generator.html` en tu navegador
2. Haz clic en "Descargar" para cada tamaño
3. Guarda los archivos en `/public/`

### Opción 2: Herramientas Online
1. Descarga `favicon.svg` 
2. Usa [favicon.io](https://favicon.io/) o [realfavicongenerator.net](https://realfavicongenerator.net/)
3. Sube el SVG y genera todos los tamaños

### Opción 3: Script Node.js
```bash
# Si tienes Node.js instalado
npm install -g sharp
# Luego puedo proporcionarte un script para generar los PNG
```

## 📲 Instalación en Dispositivos

### Android
1. Abre Chrome y visita el sitio
2. Menú → "Agregar a pantalla de inicio"
3. El icono aparecerá como app nativa

### iOS
1. Abre Safari y visita el sitio
2. Compartir → "Agregar a pantalla de inicio"
3. Usa el icono `apple-touch-icon.png`

### Windows (Edge/Chrome)
1. Visita el sitio
2. Menú → "Apps" → "Instalar esta página como una aplicación"

### macOS (Safari)
1. Visita el sitio
2. Archivo → "Agregar al Dock"

## 🎨 Personalización

El color principal (Media Agua teal) es `#0d9488`. Para cambiar el tema:

1. Edita `public/favicon.svg`
2. Cambia los colores en el atributo `fill`
3. Regenera los PNG

## 🔍 Verificación

Después de generar los iconos, verifica en:
- [RealFaviconGenerator](https://realfavicongenerator.net/favicon_checker) - Comprueba todos los favicons
- Chrome DevTools → Application → Manifest - Verifica PWA
- Safari → Develop → Show Web Inspector → Icons

## 📦 Estructura Final

```
public/
├── favicon.svg              # Icono vectorial principal
├── favicon.ico              # Favicon multiresolución
├── favicon-16x16.png        # Pequeño
├── favicon-32x32.png        # Estándar
├── apple-touch-icon.png     # iOS/macOS
├── safari-pinned-tab.svg    # Safari
├── icon-72x72.png           # Android
├── icon-96x96.png           # Android
├── icon-128x128.png         # Chrome
├── icon-144x144.png         # Android
├── icon-152x152.png         # iOS
├── icon-192x192.png         # PWA
├── icon-256x256.png         # Windows
├── icon-384x384.png         # PWA
├── icon-512x512.png         # PWA Store
├── manifest.json            # Configuración PWA
└── icon-generator.html      # Generador local
```

## ⚠️ Nota Importante

Los iconos PNG deben generarse **después** de que estés satisfecho con el diseño del SVG, ya que son versiones rasterizadas (pixeles) del vector.

El calendario incluye:
- 6 días de colores diferentes (rosa, ámbar, verde, azul, violeta, teal)
- Color teal #0d9488 como color principal
- Fondo blanco con borde teal
- Dos anillos superiores

¿Necesitas ayuda generando los iconos PNG o quieres modificar el diseño SVG?
