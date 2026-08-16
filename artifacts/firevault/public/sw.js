// FPS Connect Service Worker
// - Cachet nooit Vite dev-bestanden (HMR tokens zijn sessie-specifiek)
// - Navigatie: network-first met cache-update (altijd verse HTML-shell)
// - Statische assets: stale-while-revalidate (snel + automatisch vernieuwd)
// - API: altijd netwerk, nooit cache
// De versie hieronder wordt tijdens de Vite-build automatisch vervangen door
// een hash van de gebouwde bundel (zie sw-versie plugin in vite.config.ts).
// Handmatig ophogen is dus niet meer nodig: elke release krijgt vanzelf een
// nieuwe cachenaam en oude caches worden bij activatie opgeruimd.
const SW_VERSIE = "__SW_VERSIE__";
const CACHE = "fps-connect-" + (SW_VERSIE.startsWith("__") ? "dev" : SW_VERSIE);

function isViteDevBestand(url) {
  return (
    url.pathname.startsWith("/@") ||
    url.pathname.startsWith("/src/") ||
    url.search.includes("t=") ||
    url.search.includes("v=")
  );
}

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

  // API-verzoeken: altijd netwerk, nooit cachen
  if (url.pathname.startsWith("/api/")) return;

  // Vite dev-bestanden: nooit cachen (HMR tokens zijn sessie-specifiek)
  if (isViteDevBestand(url)) return;

  // Navigatie (HTML-shell): network-first, sla op in cache als fallback
  if (request.mode === "navigate") {
    e.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(request, clone));
          }
          return res;
        })
        .catch(() =>
          caches
            .match(request)
            .then((c) => c ?? caches.match("/"))
            .then((c) => c ?? new Response("Offline — controleer verbinding", { status: 503 }))
        )
    );
    return;
  }

  // Statische assets (fonts, icons, afbeeldingen): stale-while-revalidate
  // Serveert direct uit cache (snel) en herlaadt op de achtergrond (actueel).
  e.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(request).then((cached) => {
        const netwerk = fetch(request).then((res) => {
          if (res.ok && url.origin === self.location.origin) {
            cache.put(request, res.clone());
          }
          return res;
        });
        return cached ?? netwerk;
      })
    )
  );
});
