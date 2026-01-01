// public/sw.js
import { ServiceWorkerMLCEngineHandler } from "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.80/+esm";

const engine = new ServiceWorkerMLCEngineHandler();

self.addEventListener('install', function(event) {
    self.skipWaiting();
});

self.addEventListener('activate', function(event) {
    event.waitUntil(self.clients.claim());
});

// Heartbeat to keep SW alive
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'heartbeat') {
        // Just acknowledging keeps it alive
        // console.log("SW: Heartbeat received"); 
    }
});
