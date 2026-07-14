---
name: Caddyfile mjs static matcher
description: Caddyfile @static path_regexp moet mjs bevatten, anders wordt pdfjs-worker als SPA-fallback (text/html) geserveerd
---

# Caddyfile `@static` matcher — mjs vereist

**Regel:** de `path_regexp ext` in de Caddyfile moet `mjs` bevatten naast `js`.

```caddy
@static {
    path /assets/* /icons/* /favicon* /manifest* /sw.js
    path_regexp ext \.(js|mjs|css|png|jpg|...)$
}
```

**Why:** Vite bundelt de pdfjs worker als `pdf.worker.min-<hash>.mjs` (niet `.js`). Zonder `mjs` in de matcher valt het bestand door naar de SPA-fallback (`rewrite * /index.html`) en ontvangt de browser `text/html` in plaats van `text/javascript`. pdfjs kan de worker dan niet laden → alle PDF-rendering faalt → plattegrond toont niet.

**How to apply:** Bij elke Caddyfile-wijziging: controleer dat `mjs` aanwezig is in de extensie-regexp. Na rebuild Caddy-image verifiëren via `curl -I https://<domain>/assets/pdf.worker.min-*.mjs` — verwacht `200 text/javascript` (bij een misconfiguratie zie je `text/html` door de SPA-fallback).
