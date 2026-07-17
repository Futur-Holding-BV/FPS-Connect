---
name: E2E proxy multipart upload
description: route.fetch() verbruikt multipart/form-data binary stream → zero bytes op server; gebruik route.continue() voor file uploads in de Playwright API-proxy.
---

## Regel
In de `installeProxyMetSessie()` helper (scripts/e2e/web-api-proxy.ts):
- Detecteer `content-type: multipart/form-data` op het inkomende request
- Gebruik `route.continue()` i.p.v. `route.fetch()` voor multipart requests
- `route.fetch()` verbruikt de binaire stream vóórdat de server hem leest → server ontvangt 0 bytes

**Why:** Playwright's `route.fetch()` leest de volledige request body om hem te bufferen voor
de nieuwe fetch. Bij multipart/form-data is de body al geconsumeerd zodra `route.fetch()` hem
verwerkt. De server (multer/busboy) ziet dan een lege body en rapporteert "zero bytes".
`route.continue()` forwardt de originele request zonder de body aan te raken.

**How to apply:** Elke keer dat de proxy een `/api/*` route intercepteert:
```ts
const contentType = route.request().headers()["content-type"] ?? "";
if (contentType.includes("multipart/form-data")) {
  await route.continue({ headers: { ...route.request().headers(), cookie: cookieHeaderWaarde } });
  return;
}
// Overige requests: route.fetch() met cookie-header
```

## Extra context
- Ephemere toast na wachtwoord-wijzigen: `window.location.assign()` herlaadt de pagina
  onmiddellijk na `isSuccess` — toast verdwijnt vóór Playwright hem vangt. Gebruik
  `waitFor({ state: "visible", timeout: 5_000 }).catch(() => {})` (best-effort).
- NixOS browser-crash bij top-level `test.use(devices["iPhone 13"])` in een apart bestand:
  spawnt een tweede Chromium-instantie die crasht bij resource-schaarste. Dupliceer de
  mobiele test liever in een `describe`-block met `test.use()` in hetzelfde bestand.
