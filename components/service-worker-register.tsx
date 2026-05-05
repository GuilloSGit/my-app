"use client";

import { useEffect, useState } from "react";

export function ServiceWorkerRegister() {
  const [showInstallButton, setShowInstallButton] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      console.log("[SW Register] Checking service worker support...");
      
      if ("serviceWorker" in navigator) {
        console.log("[SW Register] Service Worker is supported");
        const basePath = process.env.NODE_ENV === "production" ? "/my-app" : "";
        const swUrl = `${basePath}/sw.js`;
        console.log("[SW Register] Attempting to register:", swUrl);
        
        navigator.serviceWorker
          .register(swUrl)
          .then((registration) => {
            console.log("[SW Register] ✅ Service Worker registered successfully!");
            console.log("[SW Register] Scope:", registration.scope);
            console.log("[SW Register] Active worker:", registration.active);
            console.log("[SW Register] Installing worker:", registration.installing);
            console.log("[SW Register] Waiting worker:", registration.waiting);
            
            // Check if there's an update
            registration.addEventListener('updatefound', () => {
              console.log("[SW Register] New Service Worker found!");
              const newWorker = registration.installing;
              if (newWorker) {
                newWorker.addEventListener('statechange', () => {
                  console.log("[SW Register] New worker state:", newWorker.state);
                });
              }
            });
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
        console.log("[SW Register] ✅ beforeinstallprompt event is supported");
        window.addEventListener('beforeinstallprompt', (e) => {
          console.log("[SW Register] 🚀 beforeinstallprompt event fired!");
          console.log("[SW Register] Event:", e);
          // Prevent the mini-infobar from appearing on mobile
          e.preventDefault();
          // Stash the event so it can be triggered later
          (window as any).deferredPrompt = e;
          setShowInstallButton(true);
        });
      } else {
        console.warn("[SW Register] ❌ beforeinstallprompt event is NOT supported");
        // In development, show install button manually
        if (process.env.NODE_ENV === 'development') {
          setShowInstallButton(true);
        }
      }

      // Check if app is already installed
      if (navigator.serviceWorker.controller) {
        console.log("[SW Register] ✅ App is controlled by Service Worker");
      } else {
        console.log("[SW Register] ❌ App is NOT controlled by Service Worker yet");
      }
    }
  }, []);

  const handleInstallClick = async () => {
    console.log("[SW Register] Install button clicked");
    
    // Try to use the deferred prompt first
    const deferredPrompt = (window as any).deferredPrompt;
    if (deferredPrompt) {
      console.log("[SW Register] Using deferred prompt");
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log("[SW Register] User choice:", outcome);
      (window as any).deferredPrompt = null;
      setShowInstallButton(false);
    } else {
      // Fallback: try to install manually
      console.log("[SW Register] No deferred prompt, trying manual install");
      if (navigator.serviceWorker && navigator.serviceWorker.ready) {
        const registration = await navigator.serviceWorker.ready;
        console.log("[SW Register] Service Worker ready:", registration);
        
        // For development, show instructions
        alert("Instalación manual:\n\n1. En Chrome: Menú (⋮) → 'Instalar Media Agua'\n2. En Edge: Menú (⋯) → 'Apps' → 'Instalar este sitio como aplicación'\n3. En Android: Menú (⋮) → 'Agregar a pantalla de inicio'");
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
