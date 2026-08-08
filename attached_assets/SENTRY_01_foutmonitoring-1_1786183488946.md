# SENTRY_01 — Foutmonitoring op de productie-API

**Opdracht voor Replit · 8 augustus 2026 · repo `vinkrene-jpg/fps-one`, branch `main`**

---

## 1. Uitgangssituatie — gemeten, niet aangenomen

Alles hieronder is op 8 augustus 2026 in de code van `main` nagekeken.

| Wat | Stand |
|---|---|
| `artifacts/api-server` | Express 5.2.1, opstart via `src/index.ts` → `src/app.ts` |
| Centrale foutafhandelaar | **Bestaat al**: `src/middlewares/foutafhandelaar.ts`, correct als laatste `app.use()` in `app.ts` r.121 |
| Verwijzingscode | Bestaat al: `maakVerwijzingscode()` levert `FPS-XXXXXXXX`, wordt server-side gelogd én aan de gebruiker getoond |
| Lekbescherming | Bestaat al: `DB_DETAIL_PATRONEN` + `veiligeFoutmelding()` |
| Snelheidsrem `/auth` | **Bestaat al**: `routes/auth.ts` gebruikt `express-rate-limit`, met test `__tests__/auth-rate-limit.test.ts` |
| `@sentry/*` in de code | **Nergens aanwezig** — geen enkel event wordt verstuurd |
| Bouw | `build.mjs` bundelt met esbuild naar één bestand `dist/index.mjs`, ESM, `sourcemap: "linked"` |
| Start | `node --enable-source-maps dist/index.mjs` (`deploy/Dockerfile.api` r.75) |
| Release-informatie | **Staat er al**: `deploy-production.sh` r.137 exporteert `GIT_COMMIT` (korte SHA); die gaat als build-arg de image in en is in de container beschikbaar als `process.env.GIT_COMMIT` |
| Let op — dode kopie | `artifacts/api-server/Dockerfile` bestaat óók, maar wordt door niets gebruikt: compose bouwt met `deploy/Dockerfile.api`. De twee zijn inhoudelijk uit elkaar gelopen (alpine vs slim, andere stages). **Alle wijzigingen in deze opdracht gaan naar `deploy/Dockerfile.api`.** Opruimen van de kopie valt buiten deze opdracht, maar moet gemeld worden |
| Deploy | Push naar `main` → `.github/workflows/deploy.yml` → `scripts/deploy-production.sh` op de VPS, geen goedkeuringsstap |

**Gevolg voor deze opdracht.** De schuldpunten 21+36 (centrale foutafhandelaar) en 24 (snelheidsrem op `/auth`) zijn inmiddels gebouwd; die staan hier niet meer in. Wat ontbreekt is uitsluitend de doorgifte naar Sentry. Deze opdracht bouwt daarom **geen nieuwe foutafhandeling** — hij haakt aan op wat er al staat.

**Sentry-doel:** organisatie `futur-holding`, project `fps-connect-api`, regio EU (`de.sentry.io`). Alleen Error Monitoring is aangezet; Tracing, Profiling, Logs en Metrics staan bewust uit.

---

## 2. Wat gebouwd wordt

### 2.1 Afhankelijkheid

`@sentry/node` toevoegen aan `artifacts/api-server/package.json`. Niets anders — geen `@sentry/profiling-node`, geen OpenTelemetry-pakketten.

### 2.2 Initialisatie

Nieuw bestand `artifacts/api-server/src/instrument.ts`, en dat wordt de **allereerste import** in `src/index.ts`, vóór `./app` en vóór alle andere imports.

De init voldoet aan:

- **DSN uit de omgeving** (`SENTRY_DSN`). **Is de variabele leeg of afwezig, dan wordt Sentry niet geïnitialiseerd en start de applicatie gewoon door.** Ontwikkelomgeving en CI mogen hier nooit op stuklopen en mogen nooit events versturen.
- `environment` uit `SENTRY_ENVIRONMENT`, met terugval op `NODE_ENV`.
- `release` gevuld met **`process.env.GIT_COMMIT`** — die variabele zit al in de image gebakken, dus er hoeft niets nieuws geregeld te worden. Dit is niet optioneel: omdat elke merge rechtstreeks naar productie gaat, is "sinds welke release komt deze fout" de enige manier om een regressie aan een deploy te koppelen. Ontbreekt `GIT_COMMIT`, dan blijft `release` leeg — nooit een verzonnen waarde.
- `tracesSampleRate: 0` en profiling uit — er wordt uitsluitend op fouten gemonitord.

### 2.3 Privacy — dit gaat vóór het gemak

Connect draagt loongegevens, facturen, IBAN-nummers en persoonsgegevens van medewerkers. Een foutrapport mag daar niets van meenemen.

Verplicht:

- `sendDefaultPii: false`.
- Een `beforeSend` die vóór verzending verwijdert: de volledige **request body**, de headers `cookie`, `authorization` en `x-api-key`, en alle querystring-waarden.
- Alleen dit blijft over aan requestcontext: methode, pad zónder querystring, statuscode, en de verwijzingscode.
- Geen `sendDefaultPii`-uitzondering "voor het gemak", ook niet tijdelijk.

### 2.4 Aanhaken op de bestaande foutafhandelaar

In `src/middlewares/foutafhandelaar.ts`, in de tak die nu de `FPS-`-code aanmaakt en `logger.error` aanroept, komt er één handeling bij: de fout wordt naar Sentry gestuurd met **de verwijzingscode als tag** (`verwijzingscode`).

Daarmee wordt de code die een gebruiker aan de telefoon voorleest de zoeksleutel in Sentry. Jacqueline of René leest `FPS-3A9C1B04` op, en die fout is direct terug te vinden.

Wat **niet** naar Sentry gaat:

- de 400-tak (kapotte JSON) — dat is een clientfout;
- de 403-tak (CORS-weigering) — idem;
- de `res.headersSent`-tak.

Alleen de onverwachte 500 telt.

### 2.5 Geen tweede foutafhandelaar

`Sentry.setupExpressErrorHandler()` wordt **niet** toegevoegd. Er is één foutpad in deze applicatie en dat blijft zo. Twee handlers naast elkaar leveren dubbele events en een tweede plek waar het gedrag kan afwijken.

---

## 3. Sourcemaps — BESLOTEN: uploaden (keuze A, René 08-08-2026)

`build.mjs` bundelt alles tot één bestand `dist/index.mjs` van tienduizenden regels. Zonder actie wijst elke stacktrace in Sentry naar regel 48312 van dat ene bestand. Dat is technisch een werkende koppeling en praktisch nauwelijks bruikbaar.

Er worden al sourcemaps gegenereerd (`sourcemap: "linked"`), dus het gat is alleen dat ze niet naar Sentry gaan.

### 3.1 Waar de bestanden staan — gemeten

De build draait **in de Docker-image**, niet op de VPS-schijf: `deploy/Dockerfile.api` bundelt in de builder-stage en kopieert `/app/artifacts/api-server/dist` naar `/app/dist` in de runtime-image. De `.map`-bestanden gaan mee. Op de host zelf staat na de deploy dus géén `dist/`-map — het uploadscript moet ze uit de gebouwde image halen.

### 3.2 Nieuwe stap in `scripts/deploy-production.sh`

Direct **na** stap 5 (`${COMPOSE} build --no-cache api`) en **vóór** stap 6 (migraties), als nieuwe **stap 5b**:

1. `SENTRY_AUTH_TOKEN` uit `deploy/.env.production` lezen. **Ontbreekt hij of is hij leeg, dan wordt de stap overgeslagen met een duidelijke waarschuwing in het log — de deploy mag hier niet op stuklopen.** Een mislukte sourcemap-upload is nooit een reden om een werkende release tegen te houden.
2. De `dist`-map uit de zojuist gebouwde api-image kopiëren naar een tijdelijke map op de host (via een wegwerpcontainer op het image-id uit `${COMPOSE} images -q api`).
3. `sentry-cli sourcemaps upload` uitvoeren met de officiële `getsentry/sentry-cli` container op die tijdelijke map, met:
   - `--org futur-holding`
   - `--project fps-connect-api`
   - `--release "${GIT_COMMIT}"` — **exact dezelfde waarde** die als build-arg de image in ging en die de SDK als `release` gebruikt. Wijkt dit ook maar één teken af, dan vindt Sentry de maps niet en zie je alsnog de bundel.
   - `--url https://de.sentry.io` (EU-regio, geen sentry.io)
4. De tijdelijke map en de wegwerpcontainer opruimen, ook wanneer de upload faalt.

### 3.3 Wat er op de server bij moet

Eén regel in `deploy/.env.production` (ongetrackt, blijft bij `git reset --hard` staan): `SENTRY_AUTH_TOKEN=...` plus `SENTRY_DSN=...`.

`SENTRY_DSN` wordt **niet** aan de lijst `VERPLICHTE_VARS` in de pre-check toegevoegd. Ontbreekt hij, dan draait de applicatie zonder monitoring door; dat is geen reden om een deploy te blokkeren.

Beide waarden moeten ook in `docs/productie-env-checklist.md` beschreven staan, want die checklist is de plek waar volgens het deployscript naar verwezen wordt.

---

## 4. Verboden in deze opdracht

- Geen wijzigingen aan routes, aan `veiligeFoutmelding()` of aan de bestaande logregels.
- Geen Tracing, Profiling, Logs of Metrics aanzetten.
- Geen tweede logbibliotheek; `pino` blijft de logger.
- Geen `/api/debug-sentry`- of testroute die na oplevering in de code blijft staan.
- Geen DSN in de broncode of in een gecommit bestand — uitsluitend als omgevingsvariabele op de VPS.

---

## 5. Acceptatie — geen groene build, maar bewijs

Een geslaagde `typecheck` en `build` zijn niet voldoende. Oplevering vereist deze zes bewijzen, met vermelding van commit-SHA, GitHub `main`-SHA en de actieve productie-SHA:

1. **Start zonder DSN.** Applicatie start lokaal met lege `SENTRY_DSN` en er wordt niets verstuurd. Aantonen met de opstartregels.
2. **Event komt aan.** Een bewust veroorzaakte 500 op `connect.fps-one.nl` verschijnt in project `fps-connect-api`. Vermeld de issue-titel.
3. **Verwijzingscode klopt.** De `FPS-`-code uit het antwoord in de browser is identiek aan de tag `verwijzingscode` op dat event in Sentry. Beide waarden noemen.
4. **Geen gegevenslek.** De event-JSON in Sentry openen en aantonen dat er géén request body, géén `cookie`-header, géén `authorization`-header en géén querystring-waarden in staan. Dit is het belangrijkste acceptatiepunt van deze opdracht.
5. **Release is gevuld.** Het event draagt de commit-SHA als release.
6. **Clientfouten blijven weg.** Een verzoek met kapotte JSON (400) en een verzoek vanaf een niet-toegestane origin (403) leveren géén Sentry-event op.
7. **Stacktrace is leesbaar.** Op het event uit punt 2 wijst de bovenste regel van de stacktrace naar een echt bronbestand (`src/...`, met regelnummer), niet naar `dist/index.mjs`. Vermeld de getoonde bestandsnaam en het regelnummer. Dit is het bewijs dat de sourcemap-upload en de `release`-waarde op elkaar aansluiten.
8. **Ontbrekend token blokkeert niets.** Een deploy met lege `SENTRY_AUTH_TOKEN` komt normaal door tot en met de smoketest, met een waarschuwing in het log.

---

## 6. Na oplevering bijwerken

- `docs/technische-schuld.md`: punten **21+36** en **24** als opgelost markeren met datum, want die zijn bij deze meting aantoonbaar gebouwd.
- `docs/changelog.md`: regel toevoegen voor de foutmonitoring.
- `docs/PRODUCTION_RUNBOOK.md`: korte paragraaf hoe een verwijzingscode in Sentry teruggezocht wordt.
- `docs/productie-env-checklist.md`: `SENTRY_DSN` en `SENTRY_AUTH_TOKEN` beschrijven.
- **Melden, niet oplossen:** dat `artifacts/api-server/Dockerfile` een ongebruikte, afwijkende kopie is van `deploy/Dockerfile.api`. Dit is een valstrik voor de volgende wijziging aan de bouw en hoort als apart punt op de schuldenlijst.
