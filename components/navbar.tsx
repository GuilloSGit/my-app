"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CalendarLogo } from "./calendar-logo";
import { ThemeToggle } from "./theme-toggle";
import { useAuth } from "@/lib/auth";
import { LogOut, LogIn, ArrowRight, LayoutDashboard, Menu, X } from "lucide-react";
import { useState } from "react";

// Get basePath for GitHub Pages
const basePath = process.env.NODE_ENV === 'production' ? '/my-app' : '';

function getPath(path: string): string {
  return `${basePath}${path}`;
}

export function Navbar() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  // Normalize pathname (remove trailing slash for comparison)
  const normalizedPath = pathname?.replace(/\/$/, '') || '';
  const dashboardPath = getPath("/dashboard").replace(/\/$/, '');
  const loginPath = getPath("/login").replace(/\/$/, '');
  const landingPath = basePath || '/';
  
  const isDashboard = normalizedPath === dashboardPath || normalizedPath === "/dashboard";
  const isLogin = normalizedPath === loginPath || normalizedPath === "/login";
  const isLanding = normalizedPath === landingPath || normalizedPath === '' || normalizedPath === '/';

  const handleLogout = async () => {
    await logout();
    router.push("/");
  };

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="fixed top-0 left-0 right-0 z-50"
    >
      <nav className="backdrop-blur-md bg-white/80 dark:bg-zinc-950/80 border-b border-slate-200/50 dark:border-zinc-800/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-3">
              <CalendarLogo className="w-8 h-8" />
              <span className="font-semibold text-slate-900 dark:text-zinc-100">
                Media Agua
              </span>
            </Link>

            {/* Right side */}
            <div className="flex items-center gap-3">
              {/* Mobile menu button */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="sm:hidden p-2 text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>

              {user ? (
                <div className="hidden sm:flex items-center gap-3">
                  {/* Show 'Ir a la app' ONLY on landing page */}
                  {isLanding && (
                    <Link href="/dashboard">
                      <motion.span
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-media-agua hover:bg-media-agua-dark text-white rounded-lg transition-colors cursor-pointer"
                      >
                        <LayoutDashboard className="w-4 h-4" />
                        Ir a la app
                        <ArrowRight className="w-4 h-4" />
                      </motion.span>
                    </Link>
                  )}
                  {/* Show 'Salir' on dashboard or other pages */}
                  {!isLanding && (
                    <motion.button
                      onClick={handleLogout}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      Salir
                    </motion.button>
                  )}
                </div>
              ) : (
                /* Not logged in: show login button (except on login page) */
                !isLogin && (
                  <Link href="/login">
                    <motion.span
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="hidden sm:flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-media-agua hover:bg-media-agua-dark text-white rounded-lg transition-colors cursor-pointer"
                    >
                      <LogIn className="w-4 h-4" />
                      Ingresar
                    </motion.span>
                  </Link>
                )
              )}
              <ThemeToggle />
            </div>
          </div>

          {/* Mobile menu */}
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="sm:hidden border-t border-slate-200/50 dark:border-zinc-800/50 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md"
            >
              <div className="px-4 py-4 space-y-3">
                {user ? (
                  <>
                    {isLanding && (
                      <Link href="/dashboard" onClick={() => setMobileMenuOpen(false)}>
                        <span className="flex items-center gap-2 px-4 py-3 text-sm font-medium bg-media-agua text-white rounded-lg">
                          <LayoutDashboard className="w-4 h-4" />
                          Ir a la app
                        </span>
                      </Link>
                    )}
                    {!isLanding && (
                      <button
                        onClick={() => {
                          handleLogout();
                          setMobileMenuOpen(false);
                        }}
                        className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-slate-600 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 w-full"
                      >
                        <LogOut className="w-4 h-4" />
                        Salir
                      </button>
                    )}
                  </>
                ) : (
                  !isLogin && (
                    <Link href="/login" onClick={() => setMobileMenuOpen(false)}>
                      <span className="flex items-center gap-2 px-4 py-3 text-sm font-medium bg-media-agua text-white rounded-lg">
                        <LogIn className="w-4 h-4" />
                        Ingresar
                      </span>
                    </Link>
                  )
                )}
              </div>
            </motion.div>
          )}
        </div>
      </nav>
    </motion.header>
  );
}
