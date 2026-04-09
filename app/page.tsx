"use client";

import { motion } from "framer-motion";
import { Navbar } from "@/components/navbar";
import { CalendarLogo } from "@/components/calendar-logo";
import { ContactButtons } from "@/components/contact-buttons";
import { MessageSquare, Users, Calendar, ArrowRight } from "lucide-react";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.2,
    },
  },
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
};

export default function LandingPage() {
  return (
    <>
      <Navbar />
      
      <main className="min-h-screen pt-16">
        {/* Hero Section */}
        <section className="relative overflow-hidden px-4 sm:px-6 lg:px-8 py-20 lg:py-32">
          {/* Background decoration */}
          <div className="absolute inset-0 -z-10">
            <div className="absolute top-20 left-1/4 w-72 h-72 bg-media-agua/10 rounded-full blur-3xl" />
            <div className="absolute bottom-20 right-1/4 w-96 h-96 bg-teal-400/10 rounded-full blur-3xl" />
          </div>

          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="max-w-4xl mx-auto text-center"
          >
            {/* Logo */}
            <motion.div variants={itemVariants} className="flex justify-center mb-8">
              <CalendarLogo className="w-24 h-24 sm:w-32 sm:h-32" />
            </motion.div>

            {/* Headline */}
            <motion.h1
              variants={itemVariants}
              className="text-4xl sm:text-5xl lg:text-6xl font-bold text-slate-900 dark:text-zinc-100 tracking-tight mb-6"
            >
              Congregación{" "}
              <span className="text-media-agua">Media Agua</span>
            </motion.h1>

            {/* Tagline */}
            <motion.p
              variants={itemVariants}
              className="text-lg sm:text-xl text-slate-600 dark:text-zinc-400 max-w-2xl mx-auto mb-8"
            >
              Mantente conectado con tu comunidad. Accede a los links en un solo clic para compartirlos con tus hermanos.
            </motion.p>

            {/* Features */}
            <motion.div
              variants={itemVariants}
              className="flex flex-wrap justify-center gap-4 sm:gap-6 mb-12"
            >
              {[
                { icon: Calendar, text: "Reuniones programadas" },
                { icon: Users, text: "Comunidad unida" },
                { icon: MessageSquare, text: "Comparte fácilmente" },
              ].map((feature) => (
                <div
                  key={feature.text}
                  className="flex items-center gap-2 text-sm text-slate-500 dark:text-zinc-500"
                >
                  <feature.icon className="w-4 h-4 text-media-agua" />
                  <span>{feature.text}</span>
                </div>
              ))}
            </motion.div>

            {/* CTA */}
            <motion.div variants={itemVariants}>
              <motion.a
                href="#contacto"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="inline-flex items-center gap-2 px-8 py-4 bg-media-agua hover:bg-media-agua-dark text-white font-medium rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-media-agua focus-visible:ring-offset-2"
              >
                Contactar para acceso
                <ArrowRight className="w-5 h-5" />
              </motion.a>
            </motion.div>
          </motion.div>
        </section>

        {/* Info Section */}
        <section className="px-4 sm:px-6 lg:px-8 py-16 bg-white dark:bg-zinc-900/50 border-y border-slate-200 dark:border-zinc-800">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="max-w-3xl mx-auto"
          >
            <h2 className="text-2xl sm:text-3xl font-semibold text-slate-900 dark:text-zinc-100 text-center mb-6">
              ¿Cómo funciona?
            </h2>
            <p className="text-slate-600 dark:text-zinc-400 text-center mb-8 leading-relaxed">
              Esta plataforma está diseñada para facilitar el acceso a los enlaces de Zoom 
              de nuestras reuniones. Los miembros autorizados pueden ver, copiar y compartir 
              los detalles de las reuniones con toda la congregación.
            </p>
            <div className="grid sm:grid-cols-3 gap-6">
              {[
                { step: "1", title: "Contacta", desc: "Habla con el administrador para obtener acceso" },
                { step: "2", title: "Accede", desc: "Ingresa con tu correo autorizado" },
                { step: "3", title: "Comparte", desc: "Envía los links a quienes los necesiten" },
              ].map((item) => (
                <div
                  key={item.step}
                  className="text-center p-6 rounded-xl bg-slate-50 dark:bg-zinc-800/50"
                >
                  <div className="w-10 h-10 mx-auto mb-4 rounded-full bg-media-agua/10 text-media-agua font-semibold flex items-center justify-center">
                    {item.step}
                  </div>
                  <h3 className="font-medium text-slate-900 dark:text-zinc-100 mb-2">{item.title}</h3>
                  <p className="text-sm text-slate-500 dark:text-zinc-500">{item.desc}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </section>

        {/* Contact Section */}
        <section id="contacto" className="px-4 sm:px-6 lg:px-8 py-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="max-w-2xl mx-auto text-center"
          >
            <h2 className="text-2xl sm:text-3xl font-semibold text-slate-900 dark:text-zinc-100 mb-4">
              ¿Necesitas acceso?
            </h2>
            <p className="text-slate-600 dark:text-zinc-400 mb-10">
              Contacta a Guillermo para solicitar acceso a la plataforma
            </p>
            <ContactButtons />
          </motion.div>
        </section>

        {/* Footer */}
        <footer className="px-4 sm:px-6 lg:px-8 py-8 border-t border-slate-200 dark:border-zinc-800">
          <p className="text-center text-sm text-slate-500 dark:text-zinc-500">
            © {new Date().getFullYear()} Congregación Media Agua. Todos los derechos reservados.
          </p>
        </footer>
      </main>
    </>
  );
}
