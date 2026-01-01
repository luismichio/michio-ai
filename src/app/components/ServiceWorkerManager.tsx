"use client";
import { useEffect } from "react";

export default function ServiceWorkerManager() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { type: "module" })
        .then((registration) => {
          console.log("Service Worker registered with scope:", registration.scope);
          
          // Setup Heartbeat
          const heartbeatInterval = setInterval(() => {
            if (registration.active) {
                registration.active.postMessage({ type: 'heartbeat' });
            }
          }, 30000); // 30s heartbeat

          return () => clearInterval(heartbeatInterval);
        })
        .catch((error) => {
          console.error("Service Worker registration failed:", error);
        });
    }
  }, []);

  return null;
}
