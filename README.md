# Zoom Links - Congregación Media Agua

Aplicación web minimalista y segura para gestionar las reuniones por Zoom de la Congregación Media Agua.

## Descripción

Plataforma web con acceso restringido que permite visualizar y compartir los enlaces de Zoom para las reuniones de la congregación. Incluye una landing page pública y un dashboard protegido para miembros autorizados.

## Características

- **Landing Page Pública**: Diseño profesional con información de contacto
- **Autenticación Segura**: Sistema de "Allowed List" basado en correos electrónicos autorizados
- **Dashboard Protegido**: Lista de reuniones ordenadas por fecha (más próximas primero)
- **Compartir por WhatsApp**: Funcionalidad para compartir detalles de reuniones fácilmente
- **Persistencia de Datos**: Opción de usar GitHub Issues API como base de datos (ideal para GitHub Pages)
- **Responsive**: Diseño optimizado para móviles

## Tech Stack

- **Framework**: [Next.js 14](https://nextjs.org/) (App Router)
- **Estilos**: [Tailwind CSS](https://tailwindcss.com/)
- **UI Components**: [shadcn/ui](https://ui.shadcn.com/)
- **Iconos**: [Lucide React](https://lucide.dev/)
- **Animaciones**: [Framer Motion](https://www.framer.com/motion/)
- **Lenguaje**: TypeScript

## Requisitos Previos

- Node.js 18+
- npm o pnpm

## Instalación

1. Clonar el repositorio:
```bash
git clone <url-del-repositorio>
cd Zoom-link/my-app
```

2. Instalar dependencias:
```bash
npm install
```

3. Configurar variables de entorno:
```bash
cp .env.example .env.local
```

Editar `.env.local` con tus configuraciones:
```env
NEXT_PUBLIC_AUTHORIZED_EMAILS=email1@ejemplo.com,email2@ejemplo.com
NEXT_PUBLIC_ADMIN_EMAIL=admin@ejemplo.com
```

### Configuración de Persistencia de Datos (Opcional)

Por defecto, la aplicación usa `localStorage` para guardar las reuniones (solo funciona en el navegador del usuario). Para habilitar persistencia real entre dispositivos y usuarios, configura GitHub DB:

1. **Crear un Personal Access Token en GitHub**:
   - Ve a https://github.com/settings/tokens
   - Click en "Generate new token (classic)"
   - Selecciona el scope `repo` (necesario para leer/escribir issues)
   - Genera el token y cópialo

2. **Configurar las variables de entorno**:
```env
NEXT_PUBLIC_GITHUB_OWNER=tu-usuario-github
NEXT_PUBLIC_GITHUB_REPO=nombre-del-repositorio
NEXT_PUBLIC_GITHUB_TOKEN=ghp_tu-token-aqui
```

3. **Para GitHub Actions/Deploy**:
   - Agrega las mismas variables como secrets en:
   - Settings > Secrets and variables > Actions > Repository secrets
   - Los nombres deben ser: `NEXT_PUBLIC_GITHUB_OWNER`, `NEXT_PUBLIC_GITHUB_REPO`, `NEXT_PUBLIC_GITHUB_TOKEN`

**Nota**: Si no configuras estas variables, la app funcionará normalmente con localStorage (sin persistencia entre dispositivos).

## Desarrollo

Iniciar servidor de desarrollo:

```bash
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000) en el navegador.

## Construcción para Producción

```bash
npm run build
```

Para iniciar la versión de producción localmente:

```bash
npm start
```

## Deploy

Esta aplicación está configurada para deploy en [GitHub Pages](https://pages.github.com/) (ver workflow en `.github/workflows/deploy.yml`).

Variables de entorno requeridas:
- `NEXT_PUBLIC_AUTHORIZED_EMAILS`: Lista de correos autorizados separados por comas
- `NEXT_PUBLIC_ADMIN_EMAIL`: Email del administrador con permisos de edición

Opcionales (para persistencia de datos):
- `NEXT_PUBLIC_GITHUB_OWNER`: Tu usuario de GitHub
- `NEXT_PUBLIC_GITHUB_REPO`: Nombre del repositorio
- `NEXT_PUBLIC_GITHUB_TOKEN`: Personal Access Token con permisos `repo`

## Estructura del Proyecto

```
my-app/
├── app/                    # Rutas y páginas (App Router)
│   ├── page.tsx           # Landing page
│   ├── layout.tsx         # Root layout con metadata
│   └── dashboard/         # Dashboard protegido
├── components/            # Componentes React reutilizables
│   └── ui/               # Componentes de shadcn/ui
├── lib/                   # Utilidades y funciones auxiliares
├── public/               # Archivos estáticos
├── next.config.js        # Configuración de Next.js
├── tailwind.config.ts    # Configuración de Tailwind
└── package.json          # Dependencias y scripts
```

## Seguridad

- El acceso al dashboard está restringido únicamente a los correos electrónicos listados en la variable de entorno `AUTHORIZED_EMAILS`
- Los usuarios no autenticados o no autorizados son redirigidos automáticamente a la landing page
- Los enlaces de Zoom solo son visibles para usuarios autorizados

## Contacto

**Guillermo David Andrada**
- WhatsApp: [+54 387 629 5801](https://wa.me/543876295801)
- Google Meet: [Agendar reunión](https://calendar.app.google/BrFnLdX8Xudn4WVD7)
- Email: [guillermoandrada@gmail.com](mailto:guillermoandrada@gmail.com)

## Licencia

Proyecto privado para uso de la Congregación Media Agua.
