---
name: Caddyfile statische routes
description: Valkuilen rond extensiematchers, matcher-AND en routevolgorde voor geneste statische apps
---

# Caddyfile statische routes

**Regel 1:** de `path_regexp ext` in de Caddyfile moet `mjs` bevatten naast `js`.

**Regel 2 (aug 2026):** binnen één named matcher worden verschillende matcher-soorten (`path` én `path_regexp`) door Caddy ge-**AND**, niet ge-OR. Een extra `path`-lijst naast de extensie-regexp zorgde ervoor dat root-bestanden buiten die lijst (bv. `/logo-fps-one.png`) als text/html via de SPA-fallback werden geserveerd. De matcher bevat daarom alleen nog de `path_regexp` op extensie.

**Regel 3 (aug 2026):** zet de statische/fallback-splitsing van een geneste app binnen één specifieke top-level `handle /app/*`. Een los top-level `route`-blok vóór een algemene `handle @static` is tekstueel niet genoeg: Caddy kan de algemene handle eerder uitvoeren, waarna `/app/*.png` in de verkeerde documentroot als 404 eindigt.

```caddy
@static {
    path_regexp ext \.(js|mjs|css|png|jpg|...)$
}
```

**Why:** Vite bundelt de pdfjs worker als `pdf.worker.min-<hash>.mjs` (niet `.js`). Zonder `mjs` in de matcher valt het bestand door naar de SPA-fallback (`rewrite * /index.html`) en ontvangt de browser `text/html` in plaats van `text/javascript`. pdfjs kan de worker dan niet laden → alle PDF-rendering faalt → plattegrond toont niet.

**How to apply:** Bij elke Caddyfile-wijziging: controleer dat `mjs` aanwezig is in de extensie-regexp. Test bovendien de volledige configuratie met zowel een bestaand als ontbrekend bestand onder elke geneste app: bestaand moet het echte MIME-type geven, ontbrekend moet 404 geven en nooit SPA-HTML.
