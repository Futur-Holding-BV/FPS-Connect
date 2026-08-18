/*
 * Service worker voor de FPS Monteur-webapp op /app.
 *
 * Versiebeheer: de deploy-build vervangt __VERSIE__ door de git-commit
 * (zie deploy/Dockerfile.caddy). Een nieuwe versie krijgt daardoor een
 * nieuwe cache-naam, activeert direct (skipWaiting) en ruimt oude caches
 * op — /app toont na een uitrol de nieuwe versie zonder handmatig legen.
 *
 * Strategie:
 * - Navigaties (/app, /app/): network-first, cache als offline-terugval.
 * - Gehashte export-assets (/app/_expo/...): cache-first (immutable).
 * - API-verkeer (/api/...): nooit door de service worker afgehandeld.
 */
const VERSIE = "__VERSIE__";
// Letterlijke naam (geen concatenatie): de deploy-build controleert met grep
// dat "fps-monteur-<commit>" na de sed-vervanging echt in dit bestand staat.
const CACHE = "fps-monteur-__VERSIE__";

self.addEventListener("install", (event) => {
  // Volledige precache: de deploy-build schrijft asset-lijst.json met ÁLLE
  // bestanden van de webexport (JS-bundels, fonts, iconen, index). Zonder
  // die precache zou een offline koude start falen: de gecachte HTML
  // verwijst naar _expo-assets die nog niet in de cache zitten.
  event.waitUntil(
    caches
      .open(CACHE)
      .then(async (cache) => {
        const res = await fetch("/app/asset-lijst.json?v=" + VERSIE, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("asset-lijst.json niet beschikbaar");
        const lijst = await res.json();
        await cache.addAll(["/app/", ...lijst]);
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("fps-monteur-") && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // API nooit cachen

  // Navigaties: network-first met cache-terugval (offline herstart).
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const kopie = res.clone();
          caches.open(CACHE).then((cache) => cache.put("/app/", kopie));
          return res;
        })
        .catch(() =>
          caches
            .match("/app/")
            .then((hit) => hit ?? Response.error()),
        ),
    );
    return;
  }

  // Gehashte assets: cache-first.
  if (url.pathname.startsWith("/app/")) {
    event.respondWith(
      caches.match(event.request).then(
        (hit) =>
          hit ??
          fetch(event.request).then((res) => {
            if (res.ok) {
              const kopie = res.clone();
              caches.open(CACHE).then((cache) => cache.put(event.request, kopie));
            }
            return res;
          }),
      ),
    );
  }
});
