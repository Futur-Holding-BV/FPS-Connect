## 2026-07-16 — Herstel functietellers, medewerker-Connect-koppeling en uitnodigingsstroom

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Aanleiding:** Vier gekoppelde problemen: (1) Timmerman/Monteur-functietellers toonden 0 ondanks dat Fred van Wallinga de rol had; (2) personeelslid aanmaken was losgekoppeld van gebruikersaccount aanmaken; (3) uitnodigingsmail en onboarding startten niet automatisch; (4) GitHub push geblokkeerd door merge-conflict.

**Wijzigingen:**

1. **`artifacts/api-server/src/routes/gebruikers.ts`** — `isBeheerderRol` gaf ten onrechte `functietitels = []` voor ALLE niet-hoofdbeheerder rollen. Fix: `VELD_FUNCTIETITELS_TOEGESTAAN` whitelist + `schoonVeldFunctietitels()` zodat veldmedewerkers (Timmerman, Monteur, Uitvoerder, etc.) hun functietitels behouden bij POST en PATCH.

2. **`lib/api-spec/openapi.yaml`** — `connect_uitnodigen: boolean` en `connect_profiel_id: integer|null` toegevoegd aan `MedewerkerInput` schema; codegen bijgewerkt (orval + zod).

3. **`artifacts/api-server/src/routes/hrm.ts`** — POST /medewerkers ondersteunt nu `connect_uitnodigen`/`connect_profiel_id`: maakt atomair een FPS Connect gebruikersaccount aan (in transactie, inclusief bevoegdheden uit opgegeven profiel en functietitel), koppelt het aan de medewerker, en verstuurt de uitnodigingsmail. Niet-fataal: medewerker wordt altijd aangemaakt; account-aanmaak is best-effort.

4. **`artifacts/firevault/src/pages/personeel/index.tsx`** — "Toegang tot FPS Connect aanmaken" sectie toegevoegd aan het medewerker-aanmaak dialog: checkbox met profielselectie, validatie op e-mailadres en toelichting.

5. **`scripts/post-merge.sh`** — `git checkout --ours` conflict-resolutie toegevoegd voor `web-wachtwoord-gate.spec.ts` merge-conflict.

**Typecheck:** volledig groen (api-server + firevault + typecheck:libs). Workflows herstart.

---

## 2026-07-16 — Herstel HRM-medewerker gebruikersbeheer (403) + e2e-infra stabiliteit

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Aanleiding:** Jacqueline (HRM-medewerker, profiel HRM-adviseur) kreeg 403 bij `POST /gebruikers` en `PATCH /gebruikers/:id`. Oorzaak: het HRM-adviseur systeem-preset miste `gebruikers: 4` in `lib/permissies`, én de productie-DB had het verouderde profiel.

**Wijzigingen:**

1. **`lib/permissies/src/index.ts`** — HRM-adviseur preset: `gebruikers: 4` toegevoegd aan de bevoegdhedenmatrix.

2. **`artifacts/api-server/src/routes/gebruikers.ts`** — `POST /gebruikers` en `PATCH /gebruikers/:id`: de zelf-escalatiebeveiliging laat nu expliciet door wie `heeftModuleRecht("gebruikers", 4)` heeft, zodat HRM-adviseurs volledige profielen kunnen toewijzen. Foutmelding verbeterd naar begrijpelijk Nederlands.

3. **`lib/db/scripts/apply-additive.mjs`** — twee idempotente datapatch-stappen toegevoegd:
   - `UPDATE profielen SET bevoegdheden = bevoegdheden || '{"gebruikers":4}' WHERE naam = 'HRM-adviseur' AND systeem = true AND niveau < 4` — bijwerken van het opgeslagen profiel.
   - `UPDATE gebruikers SET bevoegdheden = ...` — herberekening van stored bevoegdheden voor gebruikers direct gekoppeld aan HRM-adviseur via `gebruiker_profielen`.
   - Beide stappen zijn idempotent en draaien automatisch bij elke deploy als onderdeel van de migrate-stap.

4. **`scripts/e2e/web-wachtwoord-gate.spec.ts`** — Playwright-fout opgelost: `defaultBrowserType` kan niet in een `describe`-blok worden gedestructureerd vanuit `devices[...]` spread; refactored naar variabele buiten describe.

5. **`scripts/src/e2e-monteur-run.ts` + `e2e-web-run.ts`** — port-conflict false negative opgelost: `zorgServiceDraait()` herprobeert nu 3× (5s interval) voor de conclusie dat de service niet draait, waardoor een tweede api-server instantie niet meer wordt gestart.

**Deploy:** commits `2ce866c` (HRM preset), `05bf043` (merge + Playwright/retry), `d9664a0` (datapatch), `c193984` (e2e-fixes) gepusht naar GitHub main. Productie draait nu op `d9664a03` (gebouwd `2026-07-16T08:42:30Z`). De datapatch loopt automatisch bij de volgende productie-deploy via `apply-additive`.

**Verificatie:** `/api/status` op `connect.fps-one.nl` bevestigt `commit: d9664a03` en `db: ok`. `apply-additive` op dev-DB gaf OK voor beide datapatch-stappen. Typecheck volledig groen.

---

## 2026-07-16 — Productiecontrole herstel: versie-endpoint, systeemstatus-pagina, uitgebreide smoketest, env-check, rollback-documentatie

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Aanleiding:** Vier structurele hiaten in de deployment-infrastructuur: geen pre-deployment env-check, geen versie-endpoint, beperkte smoketest (3 checks) en geen systeemstatus-pagina voor de hoofdbeheerder.

**Wijzigingen:**

1. **`GET /api/versie/status` (nieuw endpoint)** — publiek endpoint dat DB (SELECT 1), objectopslag (env-check), mail (Azure env-check) en AI (OpenAI key env-check) pingt en `{db, opslag, mail, ai, aangemaakt_op}` teruggeeft. Toegevoegd aan OpenAPI spec (`/versie/status` + `VersieStatus` schema), codegen hergedraaid, geïmplementeerd in `artifacts/api-server/src/routes/health.ts`.

2. **`/beheer/systeemstatus` (nieuwe beheer-pagina)** — zichtbaar voor hoofdbeheerder via Instellingen-menu. Toont actieve Git-commit (met GitHub-link), versienummer, builddatum en vier statusbollen (DB, objectopslag, mail, AI). Route toegevoegd aan `App.tsx`, nav-item in `instellingen/index.tsx`.

3. **GitHub Actions smoketest uitgebreid van 3 naar 15 checks** — `deploy.yml` smoketest voert nu: healthz, versie, versie/status (db=ok), login, gebruikerslijst, dashboard/stats, recente-activiteit, gebouwenlijst, gebouw aanmaken (201), gebouwdetail, gebouw bijwerken, versie/status (consistentiecheck), commit aanwezig, gebouw verwijderen (cleanup), sessie na herlaad.

4. **Pre-deployment env-variabelecheck in `scripts/deploy-production.sh`** — controleert 10 verplichte variabelen in `.env.production` vóór de eerste container start. Bij ontbrekende variabele: exit 1 met duidelijke foutmelding en verwijzing naar checklist.

5. **Pre-taak sync-verificatie in `scripts/post-merge.sh`** — controleert bovenaan het script of GitHub main commits bevat die lokaal ontbreken. Niet-blokkerend: waarschuwing met divergente commits als ze er zijn.

6. **`docs/productie-env-checklist.md` (nieuw)** — volledige tabel van alle verplichte/aanbevolen variabelen, locatie (VPS / GitHub Actions / beide), beveiligingsregels (wat nooit in Git mag).

7. **`docs/PRODUCTION_RUNBOOK.md` uitgebreid** — nieuwe secties: automatische rollback-procedure, versie controleren (pagina + API), smoketest handmatig triggeren, omgevingsvariabelen-checklist verwijzing, Definition of Done.

---

## 2026-07-16 — Herstel deployment-keten: Replit → GitHub → VPS (structureel)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Aanleiding:** De Replit → GitHub → VPS deployment-keten was niet betrouwbaar: `git push` uit `post-merge.sh` mislukte met "fetch first" als GitHub divergente commits had, `/api/status` bestond niet (geen actief productie-commit zichtbaar), en `DEPLOY_NUMMER` werd niet doorgegeven aan de Docker-build.

**Wijzigingen:**

1. **`scripts/post-merge.sh` — stap 7a: auto-sync voor GitHub-push** (nieuw)
   - Vóór elke `git push` wordt nu automatisch `origin/main` gefetcht
   - Als er divergentie is (GitHub heeft commits die Replit niet heeft), wordt automatisch `git merge --no-edit` uitgevoerd
   - Daarna pas de push — "fetch first"-afwijzingen worden structureel voorkomen

2. **`artifacts/api-server/src/routes/health.ts` — nieuw endpoint `GET /api/status`**
   - Retourneert: `api_status`, `commit`, `versie`, `gebouwd_op`, `deploy_nummer`, `db_verbinding` (live DB-ping), `db_latency_ms`, `timestamp`, `omgeving`
   - Publiek bereikbaar (geen auth vereist), bruikbaar als monitoring-endpoint
   - `GET /api/versie` blijft bestaan voor achterwaartse compatibiliteit

3. **`scripts/deploy-production.sh` — DEPLOY_NUMMER en GIT_COMMIT_LANG**
   - Exporteert `DEPLOY_NUMMER` (timestamp-formaat `YYYYMMDDHHmmss`) als build-arg
   - Exporteert `GIT_COMMIT_LANG` (volledig SHA) als build-arg
   - Beide beschikbaar als ENV in de API-container

4. **`deploy/docker-compose.production.yml`** — `DEPLOY_NUMMER` toegevoegd als build-arg
5. **`deploy/Dockerfile.api`** — `ARG DEPLOY_NUMMER` + `ENV DEPLOY_NUMMER` toegevoegd

**Deploy:** commits `dd19ccbc` (post-merge fix) en `43a38209` (FASE 4 status endpoint + DEPLOY_NUMMER) gepusht naar GitHub main; VPS deployt nu op `43a38209` via `deploy-production.sh` (Docker build --no-cache).

**GitHub Actions (deploy.yml):** Triggert automatisch bij push naar main. Vereist GitHub repository secrets: `PROD_SSH_KEY`, `PROD_SSH_HOST`, `PROD_SSH_USER` (voor SSH naar VPS) en optioneel `SMOKETEST_EMAIL`/`SMOKETEST_PASSWORD` (voor smoketest na deploy).

---

## 2026-07-16 — Herstel scrollgedrag structureel applicatiebreed

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Rootprobleem:** De `SidebarProvider`-wrapper gebruikte `min-h-svh` (geen vaste hoogte) waardoor de `<main>` met `min-h-screen overflow-auto` nooit een scroll-container werd — het document scrollde. Dit zorgde voor conflicten met split-panel pagina's (`h-full overflow-hidden`) en maakte `overflow-auto` op `<main>` inactief/misleidend. Onderkant-knoppen en content verdwenen achter vaste elementen (NieuwsTicker, SlimUploadBalk, AdviseurChat).

**Wijzigingen:**

1. **`beheerder-layout.tsx`** — `SidebarProvider` krijgt `className="h-dvh"` zodat de wrapper exact viewporthoogte heeft. `<main>` van `flex-1 min-h-screen overflow-auto` naar `flex-1 min-h-0 overflow-y-auto` (normale pagina's) en `flex-1 min-h-0 overflow-hidden flex flex-col` (split-panel: `/berichten` + `/werk-inbox`). Content-wrapper bodempading verhoogd van `pb-20` naar `pb-28`. Topbar shrink-logica uitgebreid met `/werk-inbox`.

2. **`klant-layout.tsx`** — `SidebarProvider` krijgt `className="h-dvh"`. `<main>` van `flex-1 min-h-screen` naar `flex-1 min-h-0 overflow-y-auto`.

3. **`monteur-layout.tsx`** — `SidebarProvider` krijgt `className="h-dvh"`. `<main>` van `flex-1 min-h-screen overflow-auto` naar `flex-1 min-h-0 overflow-y-auto`.

**Effect:** Elke pagina is nu volledig scrollbaar tot de onderkant. `sticky top-0` topbar werkt correct als scroll-anker op `<main>`. Split-panel pagina's (berichten, werk-inbox) houden hun viewport-begrensde full-height layout. Vaste onderste elementen zijn nooit meer afgesneden.


## 2026-07-16 — Herstel Maps Static API 403: fout zichtbaar als Nederlandse melding

- **Uitvoering:** volledig (code) + deels (GCP fix vereist menselijke handeling) | **Kwaliteit:** hoog | **Risico:** laag

**Aanleiding:** Op de productieomgeving connect.fps-one.nl gaf de Maps Static API HTTP 403 terug (`API key not authorized`). De oorzaak: `Maps Static API` stond niet in de API-restrictielijst van de Google-sleutel. Eerder gaf `haalSatellietBeeld()` bij HTTP-fout stil `null` terug — de gebruiker zag geen foutmelding en de gebouwanalyse werkte gedeeltelijk zonder uitleg.

**Wijziging (`artifacts/api-server/src/services/gebouw-ai.ts`):**

1. **`haalSatellietBeeld()`** — `return null` bei HTTP-fout vervangen door `throw new Error(melding)` met een specifieke Nederlandse melding per statuscode. Bij HTTP 403 staat de exacte GCP Console-instructie in de foutmelding.
2. **`analyseerGebouwVrijeTekst()`** — de `Promise.all` voor satelliet- en Street View-afhaling geeft de throw nu niet meer door; een `.catch()` vangt hem op en zet de Nederlandse melding als `result.toelichting`. Zo is de fout zichtbaar in de API-respons én blijft de Street View-analyse doorlopen.

**Deploy:** commit `66ddb23b` gepusht naar GitHub main; Docker image herbouwd op VPS met `--no-cache`; container opnieuw gestart. Bundle-verificatie bevestigt dat de Nederlandse foutmelding aanwezig is.

**Nog openstaand (menselijke handeling):** de Maps Static API staat nog niet op de API-restrictielijst. Zodra René dit toevoegt in Google Cloud Console werkt de satellietkaart ook echt (zie instructie hieronder).

## 2026-07-16 — Herstel chatfunctie: invoerveld buiten beeld door verkeerde hoogte-berekening

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Rootprobleem:** De `BerichtenPagina` gebruikte `h-[calc(100vh-64px)]` als vaste hoogte, maar de `beheerder-layout.tsx` heeft geen vaste 64px-header. De werkelijke structuur is:
- `<main className="flex-1 min-h-screen overflow-auto">` — de hele main scrollt
- Topbalk (`py-1.5 flex items-center`) ≈ 40px
- Contentomhulling `<div className="p-3 md:p-4 xl:p-6 pb-20">` — op desktop p-4 + pb-20 = 96px extra

Totaal af te trekken op desktop: ~136px. De chat trok maar 64px af, waardoor de pagina groter was dan de beschikbare ruimte, de `main` ging scrollen in plaats van de interne chatscroll, en het invoerveld verdween buiten beeld.

**Diagnosestappen bevestigd:**
- Chat-tabellen (`chat_gesprekken`, `chat_deelnemers`, `chat_berichten`) bestaan in productie ✓
- `chatRouter` correct geregistreerd in `routes/index.ts` (regels 45 en 176) ✓
- Chat-endpoints aanwezig in `openapi.yaml` en gegenereerde hooks kloppen ✓
- Productie-DB is leeg (nog geen gesprekken aangemaakt) — verwacht gedrag voor eerste gebruik ✓

**Wijzigingen:**

1. **`artifacts/firevault/src/layouts/beheerder-layout.tsx`** — `location === "/berichten"` detectie:
   - `main` krijgt `overflow-hidden flex flex-col h-screen` i.p.v. `min-h-screen overflow-auto`
   - Topbalk wordt `flex-shrink-0` i.p.v. `sticky top-0` (overflow-hidden maakt sticky irrelevant)
   - Contentomhulling wordt `flex-1 min-h-0` zonder padding voor de berichten-pagina

2. **`artifacts/firevault/src/pages/berichten/index.tsx`** — root-div `h-[calc(100vh-64px)]` → `h-full`

---

## 2026-07-16 — Post-merge faalmelding altijd bezorgd via fallback-kanaal

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Aanleiding:** Als `AZURE_TENANT_ID`/`AZURE_CLIENT_ID`/`AZURE_CLIENT_SECRET`/`RENE_ALERT_EMAIL` niet ingesteld zijn (of als het Graph-token mislukt of `sendMail` een fout geeft), sloeg `scripts/post-merge.sh` de faalmelding stilzwijgend over. René werd dan niet gewaarschuwd bij een mislukte post-merge stap of een mislukte GitHub push.

**Wijziging:**
1. `scripts/post-merge.sh` — nieuwe `_stuur_fallback_melding`-hulpfunctie toegevoegd (vóór `_stuur_faalmelding`):
   - Probeert eerst `SLACK_WEBHOOK_URL` (Slack Incoming Webhook, POST JSON `{text}`).
   - Als dat mislukt of niet ingesteld is, probeert het `NTFY_URL` (ntfy push-service, POST met `Title`/`Priority`/`Tags`-headers).
   - Logt een waarschuwing maar stopt het script nooit bij een fout.
2. `_stuur_faalmelding` roept nu `_stuur_fallback_melding` aan op alle drie de plekken waar voorheen stilzwijgend werd teruggekeerd:
   - Ontbrekende AZURE-variabelen
   - Mislukt Graph-token-verzoek
   - Graph `sendMail` HTTP-fout
3. `docs/PRODUCTION_RUNBOOK.md` — nieuwe aandachtspunt toegevoegd over de fallback-volgorde en vereiste secrets.

**Benodigde actie (optioneel, door René):** Stel `SLACK_WEBHOOK_URL` of `NTFY_URL` in als Replit-secret voor een gegarandeerd alternatief kanaal naast Graph-e-mail.

---

## 2026-07-16 — Document Intelligence Pipeline hersteld (pixel-PDF, multi-pagina vision, Studio-modellen, correctie-leerloop, UI-transparantie)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Aanleiding:** De Document Intelligence-engine classificeerde pixel-based PDFs slecht omdat (1) er een vaste 80-tekens drempel was in plaats van een per-pagina analyse, (2) alleen pagina 1 werd gerenderd, (3) Document Studio referentiemodellen en handmatige correcties niet als context aan de AI werden meegegeven, (4) `document_sjabloon` fout naar `"onbekend"` werd gemapt, en (5) de Slim Upload-balk geen transparantie bood over hoe de classificatie tot stand is gekomen.

**Wijzigingen:**

1. **`lib/db/src/schema/organisatie.ts`** — nieuw: `documentClassificatieCorrectiesTable` (id, bestandshash, originele\_categorie, gecorrigeerde\_categorie, werkmaatschappij, bewijs\_signalen jsonb, aangemaakt\_op). DB-tabel direct aangemaakt via ALTER SQL + index op werkmaatschappij/datum. TypeScript-type `DocumentClassificatieCorrectie` geëxporteerd.

2. **`artifacts/api-server/src/lib/documentIntelligence.ts`** — kern-engine herschreven:
   - Importeert nu `inspecteerDocument` (uit `./documentInspectie`) en `renderPdfPaginas` (uit `./pdfVisie`).
   - `ExtractieResultaat` uitgebreid met `paginaTeksten: string[]`; PDF-extractie geeft die door vanuit `extraheerPdfTekst()`.
   - `DocumentIntelligenceResultaat` heeft nieuw veld `ai_model: string | null`.
   - Vaste 80-tekens drempel verwijderd; stap 3a gebruikt `inspecteerDocument()` met `paginaTeksten` om te bepalen of visuele analyse nodig is en welke pagina's prioriteit hebben.
   - Stap 3 (vision): pixel-based PDFs renderen nu tot 3 prioriteitspagina's via `renderPdfPaginas()`; afbeeldingsbestanden gebruiken `haalAfbeeldingVoorAfbeeldingsbestand()`.
   - Stap 3b: Document Studio-modellen worden opgehaald voor de werkmaatschappij (status='goedgekeurd') en meegegeven aan het AI-prompt.
   - Stap 3c: tot 10 recente correcties voor de werkmaatschappij worden opgehaald en als leervoorbeelden aan het AI-prompt toegevoegd.
   - `aiContentAnalyse()` accepteert nu `afbeeldingen: Array<{paginaNummer, base64}>` (meerdere afbeeldingen), `studioContext` en `correctieContext`; retourneert ook `ai_model: "gpt-4o-mini"`.

3. **`artifacts/api-server/src/routes/inbox.ts`** — twee fixes:
   - `DOC_CATEGORIE_NAAR_INBOX`: `document_sjabloon` mapt nu correct naar `"document_sjabloon"` (was: `"onbekend"`).
   - PATCH `/inbox/items/:id`: bij categorie-wijziging wordt een rij in `document_classificatie_correcties` ingevoegd. Werkmaatschappij wordt live via DB opgehaald (medewerker-join), net als bij de POST-upload. Niet-kritiek: fouten worden gelogd maar blokkeren de response niet.

4. **`artifacts/api-server/src/routes/slim-upload.ts`** — `SlimUploadSuggestie` interface heeft nieuwe velden `tekst_gevonden: boolean` en `ai_model: string | null`; `classificeerBestand()` mapt ze vanuit het analyse-resultaat.

5. **`artifacts/firevault/src/components/slim-upload-balk.tsx`** — `SlimUploadSuggestie` interface bijgewerkt met `tekst_gevonden?` en `ai_model?`; nieuw inklapbaar "Analyse-details" blok toont tekst gevonden / vision gebruikt / AI-model direct in de bevestigingsstap.

6. **`lib/db/scripts/apply-additive.mjs`** + **`schema-healthcheck.mjs`** — document_classificatie_correcties in post-merge migratie.

---

## 2026-07-16 — Slim-upload aanvraag-mail koppelen aan gebouw en offerte aanmaken

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Aanleiding:** Drie gaps in de slim-upload aanvraag-flow: (1) de "aanvraag"-bevestiging deed niets nuttigs; (2) `POST /inbox/offerte-aanvraag` ondersteunde geen bestaand gebouw; (3) de gebouwdetailpagina toonde geen inbox-aanvragen.

**Wijzigingen:**

1. **`lib/api-spec/openapi.yaml`** — `GET /inbox/items` heeft nu een optionele `gebouw_id` query-parameter; `InboxOfferteavanvraagInput` heeft een optioneel `bestaand_gebouw_id` veld.

2. **`artifacts/api-server/src/routes/inbox.ts`** — twee updates:
   - `GET /inbox/items`: filtert nu op `gebouw_id` (via offertesTable.gebouwId + entiteitType=gebouw fallback).
   - `POST /inbox/offerte-aanvraag`: parseert en valideert `bestaand_gebouw_id`; bij aanwezigheid wordt het bestaande gebouw hergebruikt in plaats van een nieuw gebouw aan te maken.

3. **`artifacts/firevault/src/components/slim-upload-balk.tsx`** — aanvraag-formulier in `BeslisScherm`:
   - Wanneer de categorie "aanvraag" is, verschijnt een formulier met werkmaatschappij-dropdown en optioneel gebouw-dropdown (inclusief AI-herkend gebouwnaam als hint).
   - `verzendAanvraag()` stuurt een `FormData` POST naar `/api/inbox/offerte-aanvraag` en navigeert daarna naar de nieuwe offerte of het gebouw.
   - `opBevestigen` slaat de documentbibliotheek-upload over voor categorie "aanvraag" (de API-call is al gedaan in `verzendAanvraag`).

4. **`artifacts/firevault/src/pages/gebouwen/detail.tsx`** — nieuw `GebouwInboxAanvragen` component:
   - Toont alle inbox-items met `document_categorie === "aanvraag"` gekoppeld aan het gebouw.
   - Geplaatst in het "Project & Gebouwgegevens" tabblad, na de documentenlijst.
   - Toont bestandsnaam, status, datum en een directe link naar de offerte.
