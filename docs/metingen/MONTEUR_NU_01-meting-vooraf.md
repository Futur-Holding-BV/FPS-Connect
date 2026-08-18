# MONTEUR_NU_01 — Meting vooraf (webuitvoer monteur-app)

Datum: 18 augustus 2026. Gemeten op de echte broncode van `artifacts/monteur-app` (git HEAD `da5cc9ea`, vóór de bouwwijzigingen van deze taak).

## 1. Kan `expo export --platform web` draaien?

**Ja, direct, zonder aanpassingen.** Uitgevoerd commando en uitkomst:

```
npx expo export --platform web --output-dir /tmp/web-export-test
› web bundles (2):
_expo/static/js/web/entry-….js            (5,15 MB)
_expo/static/js/web/pushNotifications-….js (158 kB)
› Files: favicon.ico, index.html, metadata.json
Exported: /tmp/web-export-test
```

Geen blokkerende foutmeldingen. Met `experiments.baseUrl: "/app"` in `app.json` verwijzen alle asset-paden naar `/app/_expo/...` — geverifieerd in de gegenereerde `index.html`.

Kanttekening: `app/+html.tsx` (eigen HTML-schil) wordt door Expo **alleen** bij `web.output: "static"` gebruikt, niet bij `"single"`. De PWA-tags (manifest, service-worker-registratie) moeten dus ná de export in `index.html` geïnjecteerd worden (zie `artifacts/monteur-app/scripts/injecteer-pwa.mjs`).

## 2. Native onderdelen in de browser

| Onderdeel | Gebruik in de app | In de browser | Oordeel |
|---|---|---|---|
| expo-local-authentication (biometrie) | app-slot rond de bearer-sessie (`context/auth.tsx`) | Webguard bestond al: biometrie staat op web volledig uit, app-slot vergrendelt nooit | **werkt (uitgeschakeld, bekend en aanvaard)** |
| Camera/foto (expo-image-picker) | foto's bij opname, werkdag, uitvoering, meldingen | `launchCameraAsync` opent op web de camera-invoer van de browser; `launchImageLibraryAsync` opent de bestandskiezer | **werkt met terugval** |
| expo-camera (CameraView, barcode) | alleen `app/magazijn/scan.tsx` (live barcode-scannen) | live scannen niet beschikbaar; het scherm had al een handmatige zoekfunctie als alternatief | **werkt met terugval** (webscherm biedt direct "Artikel zoeken") |
| expo-haptics | trillen bij bevestigen (RadiaalMenu, ui.tsx) | guards bestonden al (`Platform.OS !== "web"`); bevestigen zonder trilling | **werkt (zonder trilling)** |
| expo-glass-effect / expo-symbols | **geen enkele import in de broncode** | n.v.t. | **n.v.t.** |
| Offline-wachtrij `lib/offlineCache.ts` + `lib/syncQueue.ts` | cache + wachtrij | gebruiken uitsluitend AsyncStorage → localStorage op web | **werkt** |
| expo-file-system | `context/sync.tsx` (upload/lezen/wissen wachtrij-bestanden), `app/opname/item/[itemId].tsx`, `app/werkdag/[id].tsx` (lokale foto's + handtekening-SVG), `app/document/[tekeningId].tsx` en `app/hrm/loonstrookjes.tsx` (download + Sharing) | bestaat niet op web | **werkt niet → terugval gebouwd** (`lib/bestanden.ts`: op web data-URL's in AsyncStorage; downloads openen in een nieuw tabblad) |
| expo-sharing | document- en loonstrookweergave | bestaat niet op web | **werkt niet → terugval**: PDF via object-URL in nieuw tabblad |
| react-native-webview (`components/PdfPlattegrond.tsx`) | plattegrondweergave (pdf.js in WebView) | geen webimplementatie | **werkt niet → terugval gebouwd**: zelfde HTML in een same-origin iframe met identieke berichtenbrug |
| @react-native-async-storage/async-storage | token, cache, voorkeuren | localStorage-implementatie | **werkt** |
| expo-notifications (push) | `lib/pushNotifications.ts` | guard bestond al: vroege return op web | **werkt (geen push op web)** |
| expo-updates (OTA-banner) | `UpdateBanner` | `Updates.isEnabled` is false op web → banner verschijnt nooit | **werkt (inert)** |

Bekende webbeperking van de foto-terugval: localStorage-quota is ±5 MB, dus de **offline** fotobuffer op web is beperkt tot enkele foto's; bij volle opslag volgt een duidelijke foutmelding, geen stille misser. Online foto's uploaden direct en raken de buffer niet. De APK-weg blijft de route voor volledig offline werken.

## 3. Schermen die uitvallen

Telling: 56 routebestanden (excl. layouts) in `app/`. **Geen enkel scherm valt volledig uit.** Na de terugvallen uit deze taak:

- 0 schermen verborgen of doodlopend;
- 1 scherm met functionele beperking + werkend alternatief: `magazijn/scan` (geen live barcode-scannen; wel artikel zoeken);
- 2 schermen met gewijzigd gedrag: document- en loonstrookweergave openen de PDF in een nieuw tabblad in plaats van het deelvenster;
- biometrie-instellingen tonen zichzelf niet op web (bestaande guard).

**Alle 56 routes blijven dus bereikbaar; 58-tal schermen uit de opdrachttekst omvat mede de twee tabs-layouts.**

## 4. Login/backend-toets (eis: niets stilzwijgend aanpassen)

- `POST /api/auth/mobile/login` (auth.ts): vereist e-mail + wachtwoord + **TOTP-code**; zonder geactiveerde 2FA volgt 403, zonder code 401 `verify_2fa`. Rate-limit 5/15 min per IP+e-mail. Dit geldt óók in de browser — **een monteur moet dus eenmalig 2FA hebben ingericht** (bestaande eis van de mobiele weg, ongewijzigd overgenomen).
- Token: stateless HMAC, **30 dagen geldig** — "één keer inloggen, sessie blijft staan" wordt hiermee gehaald; op web in AsyncStorage/localStorage.
- Loginpayload bevat `rol` én `functietitels` → buitendienstdetectie kan client-side met exact dezelfde regel als de web-app (`Monteur`, `Timmerman`, `Uitvoerder`, `Onderhoudsmonteur`; hoofdbeheerder nooit).

## 5. Dev-omgeving

In de Replit-dev-omgeving draait de web-app van de monteur-app op een ander domein dan de api (CORS-fouten in de console); in productie is /app **same-origin** met de api achter Caddy, waardoor dit daar niet speelt.
