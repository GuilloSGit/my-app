"use client";

import { useEffect, useState } from "react";

export function ServiceWorkerRegister() {
  const [showInstallButton, setShowInstallButton] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      if ("serviceWorker" in navigator) {
        const basePath = process.env.NODE_ENV === "production" ? "/my-app" : "";
        const swUrl = `${basePath}/sw.js`;
        
        navigator.serviceWorker
          .register(swUrl)
          .then((registration) => {
            console.log("[SW Register] ✅ Service Worker registered successfully!", registration.scope);
          })
          .catch((error) => {
            console.error("[SW Register] ❌ Service Worker registration failed:", error);
            console.error("[SW Register] Error details:", error.message);
            console.error("[SW Register] Error stack:", error.stack);
          });
      } else {
        console.warn("[SW Register] ❌ Service Worker is NOT supported in this browser");
      }

      // Check PWA installation criteria
      if ('beforeinstallprompt' in window) {
        window.addEventListener('beforeinstallprompt', (e) => {
          // Prevent the mini-infobar from appearing on mobile
          e.preventDefault();
          // Stash the event so it can be triggered later
          (window as any).deferredPrompt = e;
          setShowInstallButton(true);
        });
      } else {
        if (process.env.NODE_ENV === 'development') {
          setShowInstallButton(true);
        }
      }
    }
  }, []);

  const handleInstallClick = async () => {
    const deferredPrompt = (window as any).deferredPrompt;
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      (window as any).deferredPrompt = null;
      setShowInstallButton(false);
    } else {
      // Fallback: try to install manually
      if (navigator.serviceWorker && navigator.serviceWorker.ready) {
        const registration = await navigator.serviceWorker.ready;
      }
    }
  };

  if (!showInstallButton) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <button
        onClick={handleInstallClick}
        className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 transition-colors"
      >
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"/>
        </svg>
        Instalar App
      </button>
    </div>
  );
}
