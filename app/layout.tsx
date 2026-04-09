import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Congregación Media Agua - Links de Reunión",
  description: "Accede fácilmente a los enlaces de Zoom para las reuniones de la Congregación Media Agua. Mantente conectado con tu comunidad.",
  keywords: ["Congregación Media Agua", "reuniones Zoom", "comunidad", "links"],
  authors: [{ name: "Guillermo David Andrada" }],
  openGraph: {
    title: "Congregación Media Agua - Links de Reunión",
    description: "Accede fácilmente a los enlaces de Zoom para las reuniones de la congregación.",
    type: "website",
    locale: "es_AR",
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
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
