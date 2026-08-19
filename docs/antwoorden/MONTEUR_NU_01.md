# MONTEUR_NU_01 — De monteuromgeving werkend op de telefoon via /app

Datum: 18 augustus 2026. Status: gebouwd en in dev bewezen; de productie-acceptatie (echte telefoon op connect.fps-one.nl/app) kan pas ná de eerstvolgende uitrol — zie §5.

## 1. Meting vooraf

Geleverd in `docs/metingen/MONTEUR_NU_01-meting-vooraf.md`. Kern: `expo export --platform web` werkt direct; de offline-wachtrij zelf (AsyncStorage) werkt op web; alleen expo-file-system (5 vindplaatsen), expo-sharing (2) en react-native-webview (1 component) hadden een terugval nodig. **Geen enkel scherm valt uit** (56 routes blijven bereikbaar; scan-scherm krijgt een handmatig-zoeken-terugval).

## 2. Wat is gebouwd

- **Webuitvoer van de echte monteur-app** op `/app` (Expo web-export, `experiments.baseUrl: "/app"`, `web.output: "single"`). De wachtpagina verdwijnt: in productie serveert Caddy op /app de monteuromgeving; de oude SPA-wachtpagina stuurt zichzelf door zodra `/app/versie.json` bereikbaar is (vangnet voor verouderde service-worker-caches).
- **Inloggen met hetzelfde Connect-account** via het bestaande bearer-pad (`/api/auth/mobile/login`, TOTP verplicht zoals op de APK-weg; token 30 dagen, in localStorage → één keer inloggen, sessie blijft staan). Biometrie op web bewust uit (bestaande guard).
- **Buitendienst-poort**: na inloggen op web controleert de app `rol` + `functietitels` met exact dezelfde regel als de web-app (`lib/buitendienst.ts`). Geen buitendienstprofiel → harde doorverwijzing naar het gewone Connect (`/`). Buitendienstgebruikers landen op hun eigen menu (bestaande startroute), niet op een dashboard of desktopweergave.
- **Eigen PWA**: eigen `manifest.webmanifest` (naam "FPS Monteur", scope en start_url `/app/`, standalone, merkkleuren), eigen pictogrammen (uit het app-icoon) en een **eigen service worker** (`/app/sw.js`) — niets gedeeld met het desktop-manifest. De service worker pre-cachet bij installatie het **volledige export-manifest** (`asset-lijst.json`, door de deploy-build gegenereerd uit alle exportbestanden, in dev nagemeten: 65 bestanden incl. de entry-bundel), zodat de app ook bij een koude start zonder netwerk opstart — een shell-only-cache zou offline vastlopen op de gehashte bundels. De service worker van de desktop-app slaat /app-verzoeken voortaan expliciet over.
- **Geen doodlopende knoppen**:
  - foto's: camera-invoer/bestandskiezer van de browser (expo-image-picker web);
  - offline foto's/handtekeningen: `lib/bestanden.ts` — op web data-URL's in localStorage, native ongewijzigd expo-file-system; de bestaande SyncQueue loopt op beide platforms leeg via hetzelfde pad;
  - plattegronden: `PdfPlattegrond` rendert op web in een same-origin iframe met dezelfde berichtenbrug als de native WebView;
  - documenten/loonstroken: openen op web in een nieuw tabblad;
  - barcode-scannen: nette melding + directe knop "Artikel zoeken";
  - bevestigen zonder trilling (bestaande haptics-guards).
- **Versie zichtbaar**: Instellingen → App-informatie toont versie + commit + bouwdatum (`EXPO_PUBLIC_GIT_COMMIT` / `EXPO_PUBLIC_BUILD_TIJD`, ingebakken bij de deploy-build); `/app/versie.json` maakt de draaiende versie extern controleerbaar.

## 3. Uitrol

- `deploy/Dockerfile.caddy`: extra buildstap exporteert de monteur-app naar `/srv/app`, injecteert de PWA-tags (`scripts/injecteer-pwa.mjs`), vervangt `__VERSIE__` in `sw.js` door de git-commit, schrijft `versie.json` én genereert `asset-lijst.json` (precache-manifest, geverifieerd op aanwezigheid van de entry-bundel); harde verificaties (index, bundel, sw, manifest, versievervanging) laten een incomplete build falen.
- `deploy/Caddyfile`: `redir /app /app/` + een `/app/*`-handle (strip prefix, root `/srv/app`, SPA-fallback) **vóór** de bestaande @static-handle; `index.html`, `sw.js`, manifest en `versie.json` krijgen `Cache-Control: no-cache` zodat de service worker (versie = commit in de cachenaam, skipWaiting + oude caches opruimen) elke uitrol zonder handmatig legen zichtbaar maakt.
- `scripts/deploy-production.sh`: nieuwe `app_versiecheck` — de deploy is pas geslaagd als óók `/app/versie.json` de nieuwe commit meldt; anders dezelfde automatische rollback als bij de API-versiecheck. docker-compose zelf onveranderd: /app zit in het bestaande caddy-image (dat al met GIT_COMMIT/BUILD_TIJD wordt gebouwd).

## 4. Wat blijft

De APK-weg (MONTEURAPP_01) is niet aangeraakt: native gedrag van bestandsopslag, biometrie, push en OTA is ongewijzigd (alle terugvallen zitten achter `Platform.OS === "web"`). Volledig offline werken en biometrie blijven de kracht van de APK; de webweg heeft een beperkte offline-fotobuffer (localStorage ±5 MB) met duidelijke foutmelding.

## 5. Acceptatie — stand van zaken

**Status: UITSTAAND — wacht op telefoonmetingen na productie-uitrol**

### Aangetoond in dev (agent, 18 augustus 2026)

- Webexport draait en de app rendert op telefoonformaat (loginscherm, screenshot in de taakoplevering).
- De export geserveerd onder /app: index, sw.js, manifest, bundel en diepe routes geven 200 (nagemeten met een lokale /app-server).
- Typecheck monteur-app én web-app groen.
- `deploy/Caddyfile` bevat de `/app/*`-handle met SPA-fallback, no-cache-headers voor index/sw/manifest en de permanente redirect van `/app` naar `/app/`.
- `scripts/deploy-production.sh` voert `app_versiecheck` uit: de deploy slaagt pas als óók `/app/versie.json` de nieuwe commit meldt.

### Vier metingen — na productie-uitrol door opdrachtgever (René)

De agent heeft geen VPS/SSH-toegang (sinds 8 aug 2026) en geen fysieke telefoon.
De vier acceptatiemetingen zijn volledig uitgewerkt in:

**`docs/metingen/MONTEUR_NU_01-telefoonbewijs.md`**

| Meting | Omschrijving | Status |
|--------|-------------|--------|
| A — Inloggen monteursaccount | connect.fps-one.nl/app op telefoon, werkscherm zichtbaar | 🔲 uitstaand |
| B — PWA op beginscherm | standalone-modus, geen browserbalk, FPS-icoon | 🔲 uitstaand |
| C — Offline foto + wachtrij leeg | vliegtuigstand → foto → herstel verbinding → sync leeg | 🔲 uitstaand |
| D — Niet-buitendienstaccount → Connect | redirect naar connect.fps-one.nl/ | 🔲 uitstaand |

Bewijs-afbeeldingen opslaan in: `docs/metingen/afbeeldingen/MONTEUR_NU_01-*.jpg`

Zodra alle vier ✅ zijn: status bovenaan dit blok wijzigen naar
**VOLLEDIG GEACCEPTEERD** en de statusregel boven §5 bijwerken.

## 6. Afwijkingen / meldingen (niets stilzwijgend aangepast)

1. **2FA blijft verplicht** op de mobiele login, ook in de browser — bestaande backend-eis, bewust niet versoepeld.
2. **`app/+html.tsx` werkt niet bij `output: "single"`** — PWA-tags worden daarom ná de export in `index.html` geïnjecteerd (buildstap, geverifieerd).
3. **Offline-fotobuffer op web is beperkt** (localStorage-quota); bij volle opslag een duidelijke fout, geen stille misser. Volledig offline werken blijft de APK-weg.
4. **Buitendienstlijst gedupliceerd** in `lib/buitendienst.ts` (zelfde vier functietitels als de web-app) — moet synchroon blijven; het geplande MONTEUR_NU_02 raakt dit gebied.
5. In dev draait de monteur-web op een ander domein dan de api (CORS-fouten in de console); in productie is /app same-origin en speelt dit niet.
