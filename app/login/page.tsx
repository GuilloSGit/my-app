"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/navbar";
import { CalendarLogo } from "@/components/calendar-logo";
import { useAuth } from "@/lib/auth";
import { isAuthorizedEmail } from "@/lib/authorized-emails";
import { Mail, AlertCircle, ArrowRight, CheckCircle2 } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const router = useRouter();
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    // Simulate a small delay for UX
    await new Promise(resolve => setTimeout(resolve, 500));

    if (!isAuthorizedEmail(email)) {
      setError("Este correo no está autorizado para acceder.");
      setIsLoading(false);
      return;
    }

    login(email);
    setShowSuccess(true);
    
    setTimeout(() => {
      router.push("/dashboard");
    }, 1000);
  };

  return (
    <>
      <Navbar />
      <main className="min-h-screen pt-16 flex items-center justify-center px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-slate-200 dark:border-zinc-800 p-8">
            {/* Logo */}
            <div className="flex justify-center mb-6">
              <CalendarLogo className="w-16 h-16" />
            </div>

            <h1 className="text-2xl font-bold text-center text-slate-900 dark:text-zinc-100 mb-2">
              Bienvenido
            </h1>
            <p className="text-center text-slate-500 dark:text-zinc-400 mb-8">
              Ingresa tu correo autorizado para continuar
            </p>

            {showSuccess ? (
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="text-center py-8"
              >
                <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
                <p className="text-slate-900 dark:text-zinc-100 font-medium">
                  Acceso concedido
                </p>
                <p className="text-slate-500 dark:text-zinc-400 text-sm mt-1">
                  Redirigiendo al dashboard...
                </p>
              </motion.div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-2"
                  >
                    Correo electrónico
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="email"
                      id="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="tu@email.com"
                      required
                      className="w-full pl-10 pr-4 py-3 rounded-lg bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-media-agua focus:border-transparent transition-all"
                    />
                  </div>
                </div>

                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-2 text-red-500 text-sm bg-red-50 dark:bg-red-500/10 p-3 rounded-lg"
                  >
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{error}</span>
                  </motion.div>
                )}

                <motion.button
                  type="submit"
                  disabled={isLoading}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-media-agua hover:bg-media-agua-dark text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-media-agua focus:ring-offset-2"
                >
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      Ingresar
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </motion.button>
              </form>
            )}

            <p className="text-center text-xs text-slate-400 dark:text-zinc-500 mt-6">
              ¿No tienes acceso?{" "}
              <a href="/" className="text-media-agua hover:underline">
                Contacta al administrador
              </a>
            </p>
          </div>
        </motion.div>
      </main>
    </>
  );
}
