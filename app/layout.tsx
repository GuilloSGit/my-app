import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { ServiceWorkerRegister } from "@/components/service-worker-register";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const basePath = process.env.NODE_ENV === "production" ? "/my-app" : "";
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://guillosgit.github.io/my-app";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Reuniones · Congregación Media Agua",
    template: "%s · Media Agua",
  },
  description:
    "Accedé a los enlaces de Zoom para las reuniones de la Congregación Media Agua. Links actualizados, disponibles en un clic.",
  keywords: ["Congregación Media Agua", "reuniones Zoom", "iglesia", "links de reunión"],
  authors: [{ name: "Guillermo David Andrada", url: "https://GA-Software.dev" }],
  creator: "Guillermo David Andrada",
  manifest: `${basePath}/manifest.json`,
  icons: {
    icon: [
      { url: `${basePath}/favicon.svg`, type: "image/svg+xml" },
      { url: `${basePath}/favicon-16x16.png`, sizes: "16x16", type: "image/png" },
      { url: `${basePath}/favicon-32x32.png`, sizes: "32x32", type: "image/png" },
    ],
    shortcut: `${basePath}/favicon.ico`,
    apple: [{ url: `${basePath}/apple-touch-icon.png`, sizes: "180x180", type: "image/png" }],
    other: [
      { rel: "mask-icon", url: `${basePath}/safari-pinned-tab.svg`, color: "#0d9488" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Media Agua",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
  openGraph: {
    type: "website",
    locale: "es_AR",
    url: siteUrl,
    siteName: "Congregación Media Agua",
    title: "Reuniones · Congregación Media Agua",
    description:
      "Accedé a los enlaces de Zoom para las reuniones de la Congregación Media Agua. Links actualizados, disponibles en un clic.",
  },
  twitter: {
    card: "summary",
    title: "Reuniones · Congregación Media Agua",
    description: "Accedé a los enlaces de Zoom para las reuniones de la congregación.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning className={inter.variable}>
      <body className={`${inter.className} min-h-screen`}>
        <ThemeProvider>
          <ServiceWorkerRegister />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
