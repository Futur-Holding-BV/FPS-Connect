// FPS Connect Service Worker v1
const CACHE = "fps-connect-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // API-verzoeken: altijd direct naar netwerk, nooit cachen
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // Navigatie (HTML): network-first, fallback naar gecachete shell
  if (request.mode === "navigate") {
    e.respondWith(
      fetch(request).catch(() =>
        caches.match("/").then((c) => c ?? new Response("Offline", { status: 503 }))
      )
    );
    return;
  }

  // Statische assets (JS, CSS, afbeeldingen): cache-first
  e.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((res) => {
        if (res.ok && url.origin === self.location.origin) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(request, clone));
        }
        return res;
      });
    })
  );
});
