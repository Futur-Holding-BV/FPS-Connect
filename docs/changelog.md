## 2026-07-10 — Onderhoudsplanning kalenderweergave (Task #167)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (UI-uitbreiding + API-parameter)

**Nieuw gebouwd:**
- #167 — De onderhoudsmodule heeft nu een "Planning"-tab (`/onderhoud/planning`) met een maand- en kwartaalkalender. Werkbonnen worden als interactieve blokken getoond op hun geplande datum. Gebruikers kunnen filteren op monteur, type onderhoud en status. De `listWerkbonnen` API is uitgebreid met `start_datum` en `eind_datum` parameters om efficiënt alleen de benodigde bonnen voor het gekozen tijdsbestek op te halen.

**Bewijs:** OpenAPI-codegen uitgevoerd; `pnpm run typecheck` groen voor `firevault` en `api-client-react`. Bestanden: `lib/api-spec/openapi.yaml`, `artifacts/firevault/src/pages/onderhoud/index.tsx`, `artifacts/firevault/src/pages/onderhoud/planning.tsx`.

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (UI-verbetering + DMS-koppeling)

**Nieuw gebouwd:**
- #307 — De adviescentrum-pagina (`/one/adviescentrum`) is uitgebreid met directe document-upload functionaliteit. Klanten kunnen nu PDF's en afbeeldingen (JPG, PNG, WebP) tot 20MB uploaden. Geüploade bestanden worden via object-storage opgeslagen en bij het indienen van de aanvraag automatisch als document record aangemaakt en gekoppeld aan de nieuwe opdracht in het DMS. De UI toont nu een bestandenlijst met voortgang-indicatie en validatiefouten via toasts.

**Bewijs:** `pnpm --filter @workspace/firevault run typecheck` en `pnpm --filter @workspace/api-server run typecheck` uitgevoerd.

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (UI-only + documentatie)

**Nieuw gebouwd:**
- #257 — de bestaande "Afdrukken"-knop op de nacalculatie-tab (`opdrachten/detail.tsx`) hergebruikt nu expliciet als "Exporteren als PDF"; header, overzichtkaarten, AI-projectcontroller en tabnavigatie zijn `print:hidden` gemaakt en een print-only kop (opdrachttitel, werknummer, exportdatum) is toegevoegd zodat de PDF/afdruk alleen de nacalculatie-secties toont in plaats van de volledige portal-chrome.
- #249 — de `: Promise<void>` + `return void res.json()`-conventie voor route-handlers (opgelost in de 354 TS7030-fixes) is vastgelegd in `docs/ontwikkelfilosofie.md`. Er is bewust geen ESLint toegevoegd (geen bestaande ESLint-infrastructuur in de monorepo); handhaving loopt via `pnpm run typecheck` (dat een ontbrekend returntype al afvangt) en code review.

**Bevindingen (al aanwezig, geen wijziging nodig):**
- #256 — de opdracht-materiaal-tab (`opdrachten/materiaal-tab.tsx`) toont al een tabel met alle uitgiftes (artikel, hoeveelheid, datum, kosten) via `GET /magazijn/mutaties?opdracht_id=...`.

**Bewijs:** `pnpm --filter @workspace/firevault run typecheck` groen voor de gewijzigde bestanden.

## 2026-07-10 — Magazijn: instelbare signaleringstijd/marge, snooze per artikel en dashboard-banner (Task #145/#146/#147)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additieve tabellen + routes, gated op bestaande bevoegdhedenmatrix)

**Nieuw gebouwd:**
- #145 — `magazijn_instellingen` (singleton: signalering_uur/minuut/marge) toegevoegd. `GET/PATCH /magazijn/instellingen` (PATCH vereist `magazijn`-niveau beheer). De dagelijkse signaleringsjob leest nu de instellingen uit de DB i.p.v. een vast tijdstip, past de marge toe bovenop de minimumvoorraad-drempel, en herplant zichzelf direct na een PATCH (`herplanMagazijnSignalering`). UI: kaart "Signalering-instellingen" onderaan het magazijndashboard (alleen zichtbaar bij beheer-niveau).
- #146 — `magazijn_snoozes` (uniek per artikel) toegevoegd. `GET /magazijn/snoozes`, `POST/DELETE /magazijn/artikelen/:id/snooze` (schrijven-niveau). Gesnoozede artikelen worden uitgesloten van de dagelijkse signaleringsmail. UI: klok-knop per kritiek artikel in het dashboard (7/14/30 dagen) + kaart met actieve snoozes en een opheefknop.
- #147 — de kritieke-voorraadbanner op het beheerdersdashboard (`MagazijnWaarschuwingsbanner`) had een foutieve geneste `<a>` binnen wouter's `Link`; gefixt door de wrapper direct aan `Link` te geven.

**Bewijs:** DB-schema gepusht en geverifieerd via `psql \d`; OpenAPI-codegen groen; api-server + firevault `typecheck` groen; `/api/healthz` bevestigt 200 na herstart.

## 2026-07-10 — Bedrijfsdocumenten AI: opslagbevestiging en volledig leergeschiedenis-beheer (Task #142/#143/#144)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additief; #143 bleek al aanwezig)

**Bevindingen (al aanwezig, geen wijziging nodig):**
- #143 — het onBlur-patroon (`handleVeldBlur`) was al op alle relevante AI-invoervelden aangesloten; geen wijziging nodig.

**Nieuw gebouwd:**
- #142 — `stuurCorrectie`/`stuurVeldCorrectie` geven nu `Promise<boolean>` terug (op basis van `resp.ok`); bij succes toont een toast ("Correctie opgeslagen") dat de gebruiker bevestigt dat zijn correctie is opgeslagen voor het AI-leerproces (`handleVeldBlur`, `kiesCategorieHandmatig`).
- #144 — het AI-leergeschiedenis-scherm in Beheer › Bedrijfsdocumenten toonde alleen categorie-correcties. Veldcorrecties (`ai_veld_correcties`) hadden alleen een POST-endpoint. Toegevoegd: `GET`/`DELETE /organisatie/bedrijfsdocumenten/veld-correcties(/:id)` (OpenAPI + Express-handlers, spiegelt het bestaande categorie-correctiepatroon) en een tweede, inklapbaar paneel "AI-leergeschiedenis — veldcorrecties" met tabel (datum/veld/AI-voorstel/gekozen waarde/tekstfragment) en verwijderknop + bevestigingsdialoog, analoog aan het categorie-paneel.

**Bewijs:** OpenAPI-codegen + `typecheck:libs` groen; typecheck (`api-server`, `firevault`) groen; api-server herstart en `/api/healthz` bevestigt 200 na de routewijziging.

## 2026-07-10 — Klantportaal/offertes: notificaties, badges en dubbele-handtekening-veiligheidsnet (Task #123/#124/#125/#126/#129/#130/#131)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (grotendeels bevestiging van bestaande functionaliteit + één additieve DB-constraint)

**Bevindingen (al aanwezig, geen wijziging nodig):**
- #123/#129 — `POST /portaal/:token/ondertekenen` en `/afwijzen` versturen al fire-and-forget `stuurOndertekeningNotificatie`/`stuurAfwijzingNotificatie` naar het interne team, met link naar het gebouw/project en (bij afwijzing) de reden.
- #126 — `POST /portaal/:token/vraag` verstuurt al `stuurKlantvraagBevestiging` naar de bezoeker wanneer een e-mailadres is opgegeven.
- #130 — het mail-logboek (`beheer/mail.tsx`) toont "Ondertekening" al als herkenbaar label (`SOORT_LABEL.ondertekening`); geen filteroptie toegevoegd (optioneel, niet vereist).
- #124 — de offertelijst toont al een rode badge met het aantal onbeantwoorde klantvragen per offerte (backend telt al mee in `GET /offertes`, frontend rendert de badge in `offertes/index.tsx`).

**Nieuw gebouwd:**
- #125 — het e-mailadres van de vraagsteller wordt nu naast de naam getoond in de klantvragenlijst (`offertes/verzend-tab.tsx`), niet pas na het openen van het antwoordformulier.
- #131 — `offerte_handtekeningen` had een samengestelde UNIQUE-constraint op `(offerte_id, portaal_token)`, die geen bescherming bood tegen dubbele handtekeningen via twee verschillende tokens voor dezelfde offerte. Vervangen door een enkelvoudige UNIQUE-constraint op `offerte_id` (`uq_handtekeningen_offerte`) — een offerte kan nu op databaseniveau nooit meer dan één handtekening hebben, als veiligheidsnet naast de al bestaande atomaire status-claim in de ondertekenen-handler. Constraintnaam-check in `portaal.ts` bijgewerkt; geen bestaande rijen troffen de wijziging (0 offertes met dubbele handtekening).

**Bewijs:** typecheck (`api-server`, `firevault`) groen; DB-query bevestigt vooraf 0 duplicaten en na `db push` de nieuwe enkelvoudige index (`uq_handtekeningen_offerte` op `offerte_id`).

## 2026-07-10 — Offerte Studio: PDF-export als bijlage bewaard, bevestiging bij onomkeerbare statuswijziging, extra AI-context (Task #108/#109/#110)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additief; bestaand gedrag van directe PDF-download blijft ongewijzigd, opslag is best-effort)

**Wat gebouwd:**
- `GET /offertes/:id/pdf` bewaart de gegenereerde PDF nu ook in object storage (gebouw-gescoped pad, of `algemeen/` zonder gekoppeld gebouw) en koppelt 'm als bijlage (`bijlage_type: "pdf-export"`) aan de offerte — zichtbaar in het Bijlagen-tabblad van de Studio. Bestandsnaam volgt nu het gevraagde formaat `<offertenummer>-<jjjjmmdd>.pdf`. Een opslagfout blokkeert nooit de directe download van de gebruiker (try/catch rond de opslagstap, alleen gelogd).
- Statuswijziging naar een onomkeerbare status ("ondertekend", "vervallen") vraagt nu expliciete bevestiging via een AlertDialog vóórdat de wijziging wordt doorgevoerd; overige overgangen blijven direct.
- AI-schrijven in de Studio heeft nu een optioneel tekstveld "Extra context voor AI-tekst" dat wordt meegestuurd als `context_extra` — de serverkant ondersteunde dit al (top-8 begrotingsregels + uitgangspunten + context_extra in de prompt), alleen de UI-invoer ontbrak nog.

**Bewijsvoering (#108):** eindtoetsend script tegen de draaiende dev-server (wegwerp-testgebruiker + wegwerp-offerte, achteraf verwijderd) bevestigt: PDF-download geeft 200 met een geldige PDF (`%PDF`-magic, >2MB), er verschijnt precies één nieuwe bijlage met het juiste type/bestandsnaamformaat/URL, en het opgeslagen bestand is via die URL ook daadwerkelijk terug te downloaden (200, `application/pdf`). Typecheck (`api-server`, `firevault`) groen.

## 2026-07-10 — E2E-selector fix: 'Details'-knop conflict opgelost (Task #308)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (alleen test-selector en data-testid toegevoegd)

**Wat gebouwd:**
- De spot-detailknop in de voorzieningenlijst (`artifacts/firevault/src/pages/voorzieningen/index.tsx`) heeft nu een unieke `data-testid="spot-details-knop"`.
- De E2E-test `scripts/e2e/web-gebouw-detail.spec.ts` is bijgewerkt om `getByTestId("spot-details-knop")` te gebruiken in plaats van een generieke `getByRole("button", { name: "Details" })`, die conflicteerde met de nieuws-ticker. Dit lost de "element not stable" fouten op en maakt de test betrouwbaar.

**Bewijs:** `pnpm run typecheck` in zowel de `firevault` als `scripts` package is groen.

## 2026-07-10 — AVG-uitbreiding: verzoektypes, geautomatiseerde opschoning en volledige accountsluiting bij anonimisering (Task #106/#107)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (nieuwe/verbrede AVG-functionaliteit, geen bestaand gedrag afgebroken; schema-wijziging is additief)

**Wat gebouwd:**
- AVG-inzageverzoek uitgebreid van 2 naar 5 types (inzage, verwijdering, correctie, beperking, bezwaar) — backend-validatie, bevestigingsmail, openapi-enum, frontend-labels (`beheer/avg.tsx`, `mijn/privacy.tsx`) synchroon bijgewerkt.
- Geautomatiseerde dagelijkse opschoonjob (`avgOpruiming.ts`, 02:30): verwijdert verlopen activiteitenlog (>365 dagen, configureerbaar) en anonimiseert accounts die >730 dagen inactief zijn (configureerbaar), met een `avg_opschoon_log`-tabel als audittrail en een `GET /avg/opschoon-status` endpoint + statuspaneel in Beheer › AVG.
- Anonimiseringslogica gecentraliseerd in `avgAnonimiseren.ts`, hergebruikt door zowel het handmatige beheerderspad als de automatische job.

**Bevinding tijdens eigen verificatie (business-scenario, niet alleen typecheck):** het handmatige anonimiseringspad zette wél e-mail/naam/telefoon/TOTP op een pseudoniem, maar liet `actief=true` en het wachtwoord-hash intact staan. Omdat `tweeFactorIngeschakeld=false` na anonimisering de login-flow naar `setup_2fa` stuurt (nieuwe QR-code inrichten), kon een geanonimiseerd account — ondanks de bedoeling — nog steeds ingelogd worden door wie het oorspronkelijke wachtwoord kende. Gefixt: `anonimiseerGebruiker()` zet nu ook `wachtwoord: null`, `actief: false` en `gedeactiveerdOp` bij anonimisering, consistent met het bestaande deactiveringspatroon in `gebruikers.ts`.

**Bewijs (echte flow tegen de dev-omgeving, geen mock):** met een tijdelijk verificatiescript (verwijderd na gebruik) ingelogd via het echte 2-staps login/2FA-endpoint, daarna: 3 nieuwe verzoektypes succesvol aangemaakt, dubbel-verzoek-guard gaf 409, `GET /avg/opschoon-status` gaf geldige cijfers terug, en de anonimiseer-actie op een echt verzoek resulteerde in een geverifieerde DB-staat (`geanonimiseerd` gezet, `actief=false`, naam overschreven, verzoek op `afgerond` met `geanonimiseerdOp`). Testdata (2 tijdelijke gebruikersrijen + verzoeken) na afloop opgeruimd; vast e2e-webaccount hersteld en gearchiveerd.

**Bestanden:** `artifacts/api-server/src/routes/avg.ts`, `lib/avgAnonimiseren.ts`, `lib/avgOpruiming.ts`, `services/email.ts`, `routes/gebruikers.ts`, `lib/db/src/schema/{gebruikers,avg}.ts`, `lib/api-spec/openapi.yaml`, `beheer/avg.tsx`, `mijn/privacy.tsx`. Volledige `pnpm run typecheck` (alle packages) groen.

## 2026-07-10 — Eerste automatische productie-deploy geverifieerd (read-only) (Task #497)

- **Uitvoering:** gedeeltelijk (bevestiging uitgesteld tot na de merge) | **Kwaliteit:** hoog | **Risico:** geen (geen deploy uitgevoerd, geen codewijziging)

**Doel:** met eigen ogen bevestigen dat de eerste échte automatische deploy de live site bijwerkt.

**Read-only bevindingen (bewijsgestuurd):**
- Live productie is bereikbaar: `https://connect.fps-one.nl/api/healthz` → `HTTP 200 {"status":"ok"}`, root `/` → 200. Draait nog de oude code (server loopt achter).
- De GitHub Actions-workflow "Deploy naar productie" is nog **nooit groen** geweest: elke run faalde of werd geskipt. De recentste faalde bij de SSH-stap met `error: missing server host`.
- Die falende run draaide nog de **oude** twee-jobs workflow (ghcr build+push → deploy, `workflow_run: [CI]`, `environment: production`). `origin/main` (HEAD `14fbf3b`) bevat nog steeds die oude versie.
- De correctie uit Task #483 (single-job `appleboy/ssh-action` → `/opt/fps-one/deploy` → pull+build+migrate+up, getriggerd op `push: main`) staat nog **niet** op `origin/main`; die landt pas na de merge van deze taak.
- De vereiste secrets `PROD_SSH_HOST/USER/KEY/PORT` bestaan nu op repo-niveau en het `production`-environment heeft geen required reviewers meer. De integriteit van de SSH-private-key kon niet geverifieerd worden.

**Conclusie:** de eerste echte deploy kan niet vanuit deze omgeving bevestigd worden — de fix moet eerst naar `origin/main` (post-merge) en verificatie van de VPS vereist SSH-toegang die de agent niet heeft; conform het kwaliteitskader wordt niet zelf naar productie gedeployed. De gebruiker heeft expliciet "deploy nu"-toestemming gegeven om, zodra de fix op `origin/main` staat, de deploy handmatig te starten (workflow_dispatch) en de GitHub-run te volgen. Dit is als follow-up vastgelegd.

## 2026-07-10 — Post-deploy healthcheck: mislukte release faalt automatisch (Task #496)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (uitsluitend CI/deploy-script; geen app-, DB- of libwijziging)

**Probleem:** de deploy-workflow stopte alleen bij een fout tijdens `git pull` / `build` / `migrate` / `up -d`, maar controleerde daarna niet of de applicatie ook echt gezond draaide. Een deploy kon dus "groen" zijn terwijl de site stuk was (api start niet, halve migratie).

**Wat is toegevoegd (`.github/workflows/deploy.yml`):** een post-deploy healthcheck na `up -d`. Een retry-lus (30 pogingen × 5s = ~150s) pollt `GET /api/healthz` binnen de api-container via de al bestaande node-check (poort 8080 is intern, niet op de host gepubliceerd). Daarna wordt de publieke route via caddy gecontroleerd (`curl -fsSk https://localhost/api/healthz`). Faalt een van beide binnen de timeout, dan print de workflow `docker compose ps` + laatste container-logs en faalt de run (`exit 1`), zodat een kapotte release direct zichtbaar faalt in GitHub Actions. De ruime timeout + retries voorkomen valse positieven bij normale opstarttijd.

## 2026-07-10 — AI Context Service aangesloten op spotherkenning (Task #506)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (één AI-functie omgebouwd, bestaand gedrag/response ongewijzigd; overige AI-functies nog ad-hoc)

**Wat gebouwd:** de eerder gebouwde maar ongebruikte AI Context Service (`bouwContextBundel`, §4.1) is nu daadwerkelijk aangesloten op een echte AI-functie: `POST /voorzieningen/ai-spotvoorstel` (spotherkenning) bouwt vóór de AI-aanroep een geautoriseerde contextbundel rond het gebouw, met `req.permissies` (impersonatie-veilig — "bekijken als" werkt automatisch mee). De geserialiseerde `contextBronnen` worden zowel gelogd (`ai_aanroepen.context_json`) als daadwerkelijk in de model-prompt gezet, niet alleen in de log. Terzijde gefixt: `ai-context.ts` (diagnostisch endpoint) had een dubbele `/api`-prefix waardoor het pad nooit bereikbaar was — router mount al onder `/api` in `app.ts`.

**Bewijs (echte flow, geen typecheck-only):** ingelogd als hoofdbeheerder-testaccount (2FA), een echte foto geüpload naar objectstorage, `POST /voorzieningen/ai-spotvoorstel` aangeroepen met gebouw 14 — resultaat 200 met een echt AI-voorstel. `ai_aanroepen`-rij voor die aanroep (`module=spots`, `functie=spot-analyse`) heeft een gevulde `context_json` met de echte gebouwgegevens (naam, adres, stad, type); eerdere/andere AI-aanroepen in dezelfde tabel hebben `context_json: null` ter vergelijking.

**Bestanden gewijzigd:**
- `artifacts/api-server/src/routes/voorzieningen.ts` — bouwt contextbundel vóór `analyseerSpot`-aanroep
- `artifacts/api-server/src/services/spot-ai.ts` — `tekstUitContextBronnen()` + injectie in AI-prompt
- `artifacts/api-server/src/routes/ai-context.ts` — pad-fix (dubbele `/api`-prefix verwijderd)

**Restscope (niet in deze taak):** overige ~12 AI-functies (gebouw-ai, document-ai, opleiding-ai, email-ai, documentIntelligence) draaien nog op hun eigen ad-hoc `LogContext`; `backups.ts` heeft dezelfde dubbele-prefix-bug als `ai-context.ts` had, nog niet gefixt.

## 2026-07-10 — Slim uploaden jaarrekeningen + Meerjarenoverzicht (Financieel, Task #488)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (nieuwe, geïsoleerde module; bestaande OHW-jaarrekening en `onderhanden-werk.ts` ongemoeid)

**Wat gebouwd:** "Slim uploaden" van (geconsolideerde) jaarrekeningen wordt nu vertrouwelijk opgeslagen onder Financieel → Jaarrekeningen (subpad "Geconsolideerde jaarrekeningen" bij consolidatie) in plaats van het algemene Archief. De volledige keten is gerealiseerd: classificatie → beveiligde opslag met rechten → extractie van kerncijfers mét bewijs per cijfer (document-id, pagina, tabel/sectie, oorspronkelijke tekst, methode, zekerheid) → menselijke validatie (proposed/reviewed/approved/rejected/superseded) → Meerjarenoverzicht met trends en signalen → versie-/duplicaatdetectie → audittrail. Werkt ook zonder AI-gateway via een heuristische fallback.

**Beveiliging:** nieuwe bevoegdheid `financieel_vertrouwelijk` (standaard 0, server-side fail-closed, niveau 1=lezen / 2=schrijven). Alle jaarrekening-routes staan erachter; ongeauthenticeerd geeft 401, zonder recht 403. Nav-items en het Meerjarenoverzicht zijn gated op `financieel_vertrouwelijk` niveau 1; beoordelen/goedkeuren vereist niveau 2.

**Bestanden gewijzigd:**
- `lib/db/src/schema/index.ts` — datamodel financiële documenten + kerncijfers + logboek
- `artifacts/api-server/src/routes/financieel-jaarrekeningen.ts` — routes (upload, lijst, detail, extractie, kerncijfer-patch, dataset-status, meerjarenoverzicht, download, duplicaatcontrole)
- `artifacts/api-server/src/services/financieleExtractie.ts` — extractie-engine met bewijsketen + heuristische fallback
- `artifacts/api-server/src/services/documentIntelligence.ts` — classificatie jaarrekening (geconsolideerd/enkelvoudig)
- `lib/api-spec/openapi.yaml` + gegenereerde hooks/schemas — API-contract
- `artifacts/firevault/src/components/slim-upload-balk.tsx` — jaarrekening routeert naar Financieel i.p.v. Inbox
- `artifacts/firevault/src/pages/financieel/jaarrekeningen/index.tsx` — validatiescherm (master-detail, per-cijfer beoordeling + bewijs, audittrail)
- `artifacts/firevault/src/pages/financieel/meerjarenoverzicht/index.tsx` — meerjarenoverzicht met trends + signalen
- `artifacts/firevault/src/App.tsx` + `layouts/beheerder-layout.tsx` — routes en gated nav-items

**Verificatie:** volledige `pnpm run typecheck` groen (alle packages); `/api/healthz`=200; `/api/financieel/jaarrekeningen` ongeauthenticeerd=401 (fail-closed bevestigd); e2e-web afgerond. De e2e-menu-run faalde op infrastructuur (poort 8080 EADDRINUSE + bekende TOTP-timing), niet op deze web-only wijziging; de monteur-app is niet aangeraakt.

## 2026-07-10 — Inloggen in Firefox hersteld (autofill-bestendige formulieren) (Task #494)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (alleen frontend-formulieren; geen server-, DB- of API-wijziging)

**Probleem:** in Firefox mislukte inloggen met "Onjuiste inloggegevens" terwijl exact dezelfde login in Chrome/Edge werkte. Oorzaak: de inlogformulieren verstuurden de React-state, niet de werkelijke veldwaarden. Bij browser-autofill (met name Firefox) wordt een veld visueel gevuld zonder dat het change-event altijd vuurt, waardoor de state leeg/verouderd bleef en de server terecht 401 gaf.

**Oplossing:** de betrokken formulieren lezen bij verzenden de werkelijke veldwaarden uit via refs op de invulvelden (`ref.current?.value`), met terugval op de bestaande state wanneer de ref nog niet beschikbaar is. **Aanvullend (na terugmelding "werkt nog niet in Firefox"):** de invulvelden zijn omgezet van *gecontroleerd* (`value={state}`) naar *ongecontroleerd* (`defaultValue={state}` + ref). Bij een gecontroleerd React-veld overschrijft React bij elke re-render de DOM-waarde terug naar de (lege) state, waardoor Firefox' automatisch ingevulde waarde weer werd gewist vóór verzenden — precies het verschil met Chrome/Edge, waar de timing anders uitpakt. Met een ongecontroleerd veld raakt React de door de browser ingevulde waarde niet meer aan, en leest de ref bij verzenden altijd de juiste waarde. De getoonde state en `onChange` blijven behouden voor UI (wachtwoord tonen/verbergen, validatie, handmatig typen). Tevens `name`- en `autoComplete`-attributen toegevoegd waar die ontbraken. De TOTP/tweestapsverificatie-flow is niet aangeraakt.

**Bestanden gewijzigd:**
- `artifacts/firevault/src/pages/auth/login.tsx` — e-mail/wachtwoord via refs uitgelezen bij submit.
- `artifacts/firevault/src/pages/auth/wachtwoord-reset.tsx` — nieuw/bevestig wachtwoord via refs.
- `artifacts/firevault/src/pages/uitnodiging/index.tsx` — wachtwoord/bevestig via refs.
- `artifacts/firevault/src/pages/installatie/index.tsx` — naam/bedrijf/e-mail/wachtwoord/bevestig via refs.

## 2026-07-10 — AI Context Service gebouwd (los valideerbaar, nog niet aangesloten) (Task #490)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additief; nieuwe module + handgeschreven beheerdersroute buiten OpenAPI; geen bestaande code/route gewijzigd behalve mount; geen DB-migratie)

**Wat gebouwd:** de centrale AI Context Service uit [architectuur §4.1](architectuur/ai-platform/README.md). Harde eis geborgd: een AI-functie krijgt nooit alleen het huidige formulier — de service stelt automatisch de volledige, geautoriseerde contextbundel samen rond een entiteit.

**Kern:**
- Context-resolvers per entiteit (gebouw, voorziening, offerte, medewerker, document, dossier, onderhoud, klant) die per knoop verwijzingen naar gerelateerde entiteiten teruggeven; de Orchestrator doorloopt die als graaf (BFS, instelbare diepte).
- Scoping uitsluitend via de bevoegdheden-matrix (`heeftModuleRecht`/`heeftObjectRecht`) + gebouwtoewijzing (`magBijGebouw`), nooit rolnaam; impersonatie ("bekijken als") werkt via de bestaande `req.permissies`. Een niet-toegankelijke knoop valt weg én wordt niet verder uitgebreid (autorisatiegrens — geen lek naar wat erachter ligt).
- Tokenbudget-trimming per model-slot (inkorten inkortbare tekst, overloop weglaten, wortel nooit droppen) en een cache van de ruwe (scope-onafhankelijke) knoop met TTL + `invalideerContext`-hook (nog niet aangesloten op mutaties).
- Levering als `contextBronnen: AiContextBron[]` + vlakke LogContext-velden, zoals de gateway verwacht.
- Los valideerbaar: nog NIET aangesloten op AI-functies. Diagnostisch endpoint `GET /api/beheer/ai-context` (hoofdbeheerder, buiten OpenAPI zoals `ai-log.ts`) voor live-controle incl. "bekijken als".

**Bestanden:**
- `artifacts/api-server/src/lib/aiContext/{types,tokenBudget,cache,resolvers,index}.ts` — de service.
- `artifacts/api-server/src/lib/aiContext/aiContext.test.ts` — 14 pure unit-tests (scoping, autorisatiegrens, graaf, budget, flat-velden).
- `artifacts/api-server/src/routes/ai-context.ts` + mount in `routes/index.ts`.

**Verificatie:** `pnpm run typecheck:libs` + api-server typecheck groen; 14/14 unit-tests groen; server boot OK, `/api/healthz` 200, endpoint 401 zonder sessie; live smoke tegen echte DB (voorziening→gebouw graaf, correcte flat-velden, geen lek).
## 2026-07-10 — AI Decision Engine, Prompt Builder en modelrouter (Fase 0, passthrough) (Task #491)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (volledig additief; geen bestaande AI-functie aangeraakt, geen gedragswijziging; alleen nieuwe lib-bestanden, nieuwe routes en één nieuwe DB-tabel)

**Wat gedaan:** de Fase 0-basis uit [`docs/architectuur/ai-platform/README.md`](architectuur/ai-platform/README.md) §7-§8 werkend gemaakt bovenop de bestaande centrale AI-laag (`aiGateway`), zonder enige bestaande AI-functie te wijzigen. Drie nieuwe componenten en de bijbehorende werkende beslislaag:

- **Modelrouter** (`aiModelRouter.ts`): vertaalt een declaratief taakprofiel (vision/redenering/kostengevoelig/embedding) naar een bestaand modelslot, met leesbare reden. `MODEL_REGISTRY` in `aiGateway.ts` blijft de enige plek met modelnamen.
- **Prompt Builder** (`aiPromptBuilder.ts`): stelt prompts samen uit het bestaande promptregister + gedeelde guardrails + optionele contextbundel + optionele outputschema-instructie. Voegt geen tweede promptbron toe.
- **Taakregister** (`aiTaakregister.ts`): declaratieve AI-taken (prompt, taakprofiel, `requiresHumanApproval`, optioneel Zod-outputschema — Fase 0: aangeboden, niet afgedwongen). Twee demonstratietaken die niet aan bestaande routes zijn gekoppeld.
- **Decision Engine** (`aiDecisionEngine.ts`): roept uitsluitend `aiGateway.chat()` aan (governance blijft de eerste poort). Passthrough (`requiresHumanApproval=false`) geeft de ruwe gateway-uitvoer ongewijzigd terug — functioneel identiek aan een directe gateway-aanroep. Human-in-the-loop (`true`) bewaart het voorstel met een eenmalig, tijdgebonden token en status `wacht_op_gebruiker`; een tweede aanroep beoordeelt naar `akkoord`/`afgewezen`. De opslag zit achter een interface (`BeslissingStore`) zodat de engine zuiver testbaar is.

**Contract-first:** nieuwe OpenAPI-paden onder `/ai/...` (`voerAiTaakUit`, `listAiBeslissingen`, `getAiBeslissing`, `beoordeelAiBeslissing`) met named `$ref`-schema's; codegen uitgevoerd. Nieuwe DB-tabel `ai_beslissingen` (Drizzle-schema + directe `CREATE TABLE` want push faalt op TTY).

**Beveiliging (fail-closed):** de token-endpoints (`GET /ai/beslissingen/:token`, `POST .../beoordeling`) doen naast `requireAuth` een module-matrixcheck op de opgeslagen beslissing — het hoogentropische token is geen capability-URL. De engine geeft bij een mislukte statusupdate (race/store-anomalie) een fout in plaats van een mogelijk stale voorstel vrij te geven.

**Bewijsvoering (DoD):** 7 nieuwe unit-tests bewijzen passthrough === directe gateway-uitvoer, de volledige statusmachine (akkoord geeft voorstel vrij, afwijzing niet, reeds-afgehandeld token weigert, onbekende taak/gateway-fout nette fout) én het fail-closed-pad; alle 202 tests groen. `pnpm run typecheck` groen. API-server boot schoon; de nieuwe endpoints zijn live en auth-gated (401 zonder sessie), `/api/healthz` 200.

**Bestanden gewijzigd/toegevoegd:**
- `artifacts/api-server/src/lib/aiModelRouter.ts`, `aiPromptBuilder.ts`, `aiTaakregister.ts`, `aiDecisionEngine.ts` — nieuw.
- `artifacts/api-server/src/routes/ai-beslissingen.ts` — nieuw; geregistreerd in `routes/index.ts`.
- `lib/db/src/schema/ai-governance.ts` — tabel `ai_beslissingen` toegevoegd.
- `lib/api-spec/openapi.yaml` + gegenereerde hooks/Zod — AI-beslislaag-contract.
- `artifacts/api-server/src/__tests__/ai-decision-engine.test.ts` — nieuw.

## 2026-07-10 — Deploybeleid vastgelegd: productie als acceptatieomgeving

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** geen (uitsluitend documentatie)

**Wat is vastgelegd:** het nieuwe, bindende deploybeleid is nu in de projectdocumentatie verankerd. Productie is momenteel de actieve acceptatie-/testomgeving; noodzakelijke fixes gaan direct naar productie zodra GitHub CI groen is — zonder aparte staging-cyclus en zonder aparte reviewer-/productie-goedkeuring per fix. Het oude proces "deploy pas ná goedkeuring van een reviewer" is overal als vervallen gemarkeerd.

**Beleid (canoniek in het runbook):** vijf gates (1. GitHub CI groen, 2. geen destructieve migratie zonder waarschuwing, 3. geen verzwakking van de beveiliging, 4. deploy via de bekende route `rene@149.210.181.47` / `/opt/fps-one`, server pullt zelf), een minimale smoketest na elke deploy (`/api/healthz`, René login, Jacqueline login, Gebruikersbeheer opent, geraakte functionaliteit werkt), en "bij falen: fix → redeploy → retest". Aparte productie-goedkeuring alleen bij destructieve migratie, beveiligingsrisico of deploymentfout.

**Bestanden gewijzigd:**
- `docs/PRODUCTION_RUNBOOK.md` — beleid als leidend deel toegevoegd, inclusief smoketest-checklist en de bekende aandachtspunten (mailvariabelen ontbreken op productie; api-logs leeg → bewijs via `login_pogingen`-tabel).
- `docs/deployment.md` — sectie 7 en 9 herschreven naar het direct-deploy-model met de gates; goedkeuringsvereiste als vervallen gemarkeerd; TOC bijgewerkt.
- `deploy/RELEASE_PRODUCTION_CHECKLIST.md` — gates + smoketest bovenaan; geen aparte goedkeuringsstap meer.
- `replit.md` — korte verwijzing naar het beleid met pointer naar het runbook.
- `.github/workflows/deploy.yml` — reviewer-goedkeuringscommentaar bijgewerkt; de `environment: production`-gate benoemd als aan te passen punt in de docs (mechanisme ongewijzigd gelaten, geen risico).

## 2026-07-10 — AI-platform architectuur ontworpen (nog geen code) (Task #484)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (uitsluitend documentatie toegevoegd; geen code, geen migraties, geen wijzigingen in `artifacts/` of `lib/`)

**Wat gedaan:** een compleet, samenhangend architectuurdocument geschreven onder [`docs/architectuur/ai-platform/README.md`](architectuur/ai-platform/README.md) dat alle ~13 bestaande AI-functies samenbrengt in één gedeelde AI-beslislaag. Harde eis geborgd in het ontwerp: de AI ontvangt nooit alleen het huidige formulier — elk AI-verzoek krijgt automatisch de volledige relevante context via een centrale Context Service.

**Inhoud van het document:**
- Volledige inventarisatie van elke AI-functie (doel, bestanden, modelslot, huidige context, resultaatgebruik);
- Benoeming van de gedupliceerde patronen die worden opgeruimd (per-feature contextopbouw, base64/vision-encoding, "alleen JSON"-instructies, `strOfNull`/`intOfNull`/`numOfNull`, betrouwbaarheidsscoring, handmatig `JSON.parse` zonder Zod, markdown-fence-stripping, ad-hoc modelkeuze);
- Ontwerp van de zeven centrale componenten (Context Service, Decision Engine, Prompt Builder, Knowledge & Context Provider, externe connectorlaag, AI-audit-/redeneerlog, modelrouteringslaag);
- Componentdiagram + datastroom-sequentiediagram (Mermaid);
- Migratiepad per bestaande AI-functie, migratieroadmap (Fase 0–5), implementatievolgorde met expliciete afhankelijkheden, en de secties risico's, achterwaartse compatibiliteit, performancestrategie en beveiligingsstrategie.

**Kaders gerespecteerd:** bouwt voort op de bestaande centrale laag (gateway, promptregister, orchestrator-interfaces, governance/kill-switch, modelregister, `ai_aanroepen`); behoudt "AI stelt voor, mens beslist"; contract-first (OpenAPI → codegen); scoping via bevoegdheden-matrix + gebouwtoewijzing (nooit rolnaam). Bouwen gebeurt pas ná expliciet akkoord, als afzonderlijke terugdraaibare taken.

**Verificatie:** documentatie-only taak; geen build/typecheck relevant (geen code gewijzigd). De `api-server`-workflow stond al op failed vóór deze taak en is niet geraakt (alleen een Markdown-bestand toegevoegd).

## 2026-07-10 — Automatische productie-deploy vanaf GitHub werkend gemaakt (Task #483)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (alleen workflow-configuratie; geen productie-deploy uitgevoerd)

**Aanleiding:** Task #482 stelde vast dat de automatische deploy faalde op ontbrekende GitHub Actions-secrets ("error: missing server host") en dat `.github/workflows/deploy.yml` niet paste bij hoe de VPS werkelijk deployt (verwees naar het niet-bestaande `/opt/fps-connect` en gebruikte een ghcr build-push-pull-model, terwijl de live stack lokaal bouwt vanuit `/opt/fps-one/deploy`).

**Wat gedaan:**

1. **GitHub Actions-secrets gezet** in `vinkrene-jpg/fps-one`: `PROD_SSH_HOST`, `PROD_SSH_USER`, `PROD_SSH_KEY`, `PROD_SSH_PORT`. De aangeleverde privésleutel was misvormd (regeleinden platgeslagen tot spaties → OpenSSH `error in libcrypto`); gecorrigeerd door de base64-body opnieuw op 70 tekens te wrappen en de herstelde sleutel als secret op te slaan. SSH-authenticatie read-only geverifieerd (logt in als `rene`, docker-groep, passwordless sudo).

2. **`deploy.yml` herschreven** naar het bewezen servermodel (na expliciete keuze van de gebruiker): SSH naar de VPS → `cd /opt/fps-one/deploy` → `git pull --ff-only origin main` → images **lokaal** bouwen → `migrate` → `up -d`. Verwijderd: het ghcr build-push-pull-model, alle `/opt/fps-connect`-verwijzingen en de handmatige goedkeuringsstap (`environment: production`). Deploy draait nu automatisch bij elke push naar `main` (plus handmatig via `workflow_dispatch`); bij elke fout stopt de deploy onmiddellijk (`set -euo pipefail`).

**Verificatie (read-only, geen deploy uitgevoerd):**
- server kan non-interactief van GitHub pullen (`git fetch` OK; remote `git@github.com:vinkrene-jpg/fps-one.git`);
- server staat 12 commits achter op `origin/main`, 0 vooruit, schone werkboom → `git pull --ff-only` fast-forward't schoon;
- `docker compose config` slaagt mét `--env-file .env.production` en waarschuwt zonder → `--env-file .env.production` is vereist (interpoleert `${DATABASE_URL}`/`${POSTGRES_PASSWORD}`) en is in alle compose-commando's opgenomen;
- workflow-YAML gevalideerd (js-yaml parse): geldig, geen registry/ghcr-logica, geen goedkeuringspoort.

**Belangrijk voor de gebruiker:** zodra deze wijziging in `main` wordt samengevoegd, triggert de push de nieuwe workflow en draait de **eerste automatische productie-deploy** (haalt de 12 achterstallige commits + deze wijziging op en bouwt lokaal). Dit is exact de gevraagde automatisering. Er is door de agent bewust géén deploy handmatig gestart (kwaliteitskader: nooit zelf naar productie zonder expliciete opdracht).

## 2026-07-09 — GitHub-push voltooid: main gesynchroniseerd, CI groen (Task #482)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (gewone merge, geen force-push; boom byte-identiek aan lokale werkboom)

**Wat gedaan:** de lokale main (10 commits t/m `1705928f`) is samengevoegd met de 11 Docker/release-fix-commits die op GitHub stonden en zonder force-push naar `origin/main` gepusht (merge-commit `14fbf3b9`). Omdat schrijvende git-operaties in deze omgeving geblokkeerd zijn, is de merge uitgevoerd in een tijdelijke kloon buiten de workspace; de workspace-repo is alleen gelezen.

**Verificatie:**
- `git diff` tussen de gepushte boom en de lokale werkboom: **leeg** — GitHub is byte-identiek aan lokaal, inclusief alle 6 deploy-bestanden (.dockerignore + 5 Dockerfiles);
- `origin/main` bevat aantoonbaar zowel de lokale HEAD als de eerdere GitHub-HEAD (ancestor-checks);
- **GitHub CI: groen** (run op `14fbf3b9`, conclusion success);
- e2e na afloop lokaal: e2e-menu 1 passed, e2e-web 6 passed / 1 skipped / 0 failed; api-server workflow herstart, healthz 200.

**Bevinding — automatische productie-deploy faalt op ontbrekende GitHub-secrets:** de push triggert ook `.github/workflows/deploy.yml`. De Docker-images (api + web) zijn succesvol gebouwd en naar de registry gepusht, maar de SSH-deploy-stap faalde met `error: missing server host`: de repo heeft **0 Actions-secrets**, terwijl de workflow `PROD_SSH_HOST`, `PROD_SSH_USER`, `PROD_SSH_KEY` (en optioneel `PROD_SSH_PORT`) verwacht. Zolang die niet in GitHub (Settings → Secrets and variables → Actions) staan, moet de VPS handmatig pullen. Er zijn geen productie-credentials door de agent gezet (bewust: nooit zelf naar productie).

## 2026-07-09 — Productiegereed maken + GitHub-synchronisatie (drift-fixes)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (alleen additieve DB-kolommen en een .dockerignore-regel overgenomen van productie)

**DB-drift volledig hersteld (dev):** na de merges van de afgelopen taken liep de dev-database achter op het Drizzle-schema (drizzle push blijft hangen op de interactieve prompt). Een volledige audit (alle 256 schema-tabellen vergeleken met `information_schema`) vond 7 driftpunten, alle additief gedicht via directe DDL met de schema-defaults en foreign keys:
- `verlofsoorten`: kolommen `hoofdcategorie` + `is_tijd_voor_tijd` (veroorzaakte 500 op `GET /api/mijn/verlofsoorten`);
- `medewerkers`: kolommen `verjaardag_zichtbaar` (veroorzaakte 500 op `GET /api/moments/vandaag`) + `leidinggevende_id`;
- `functies`: kolom `minimale_bezetting`;
- `wagenpark_meldingen`: 10 kolommen (schade/storing/AI-uitkomsten/opvolging);
- ontbrekende tabellen `wagenpark_kwartaalcontrole`, `push_tokens` en `pim_foto_analyses` aangemaakt.

Eindcontrole: audit opnieuw gedraaid — 256 tabellen, **geen drift**.

**Api-server hersteld:** de workflow faalde op `EADDRINUSE :8080` doordat een losgeraakte api-server van een e2e-run de poort bezet hield; na het vrijkomen van de poort herstart — healthz 200.

**GitHub-synchronisatie voorbereid:** origin/main and lokaal zijn gedivergeerd sinds commit `a0f4768` (lokaal 10 commits: increment 2, Task #480 e.a.; GitHub 11 commits: Docker/release-fixes die tijdens de productie-uitrol direct op GitHub zijn gezet). Inhoudelijke vergelijking: 5 van de 6 remote-gewijzigde bestanden zijn byte-identiek aan lokaal; alleen `.dockerignore` verschilde (productie-fix `scripts/*` + `!scripts/package.json` voor Dockerfile.caddy) — die fix is nu lokaal overgenomen, zodat de merge conflictvrij is. Push verloopt via een aparte achtergrondtaak (git-operaties met schrijfacties zijn in deze omgeving geblokkeerd); nooit force-push.

**Kwaliteitscontrole:** volledige kwaliteitscheck groen — 0 kritiek, 0 hoog; stale lib-declaraties opgelost via `typecheck:libs`. Resterende middel-punten zijn bekend en vooraf bestaand (2 niet-patchbare npm-advisories, verwachte pages-directories van het PIM/inkoop-spoor).

## 2026-07-09 — Meerdere rollen per gebruiker (increment 2: rollen als bron van waarheid)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (bestaande gebruikers ongewijzigd via legacy-pad; nieuwe flow end-to-end bewezen)

**Wat gebouwd (conform goedgekeurde architectuur):** een gebruiker kan nu meerdere rollen (bevoegdheidsprofielen) tegelijk krijgen; de effectieve rechten zijn per module het **hoogste niveau over alle toegewezen rollen** en worden **server-side afgeleid** — de rollen zijn de bron van waarheid, een eventueel meegestuurde client-matrix wordt genegeerd.

- **Server (`POST`/`PATCH /gebruikers`):** bij meegestuurde `profiel_ids` wordt de matrix altijd via `combineerBevoegdheden` afgeleid; koppeltabel `gebruiker_profielen` wordt in dezelfde transactie gesynchroniseerd; `herkomst_profiel_id` = het profiel bij exact één rol, anders leeg. Zelf-escalatiecheck draait op de afgeleide eindmatrix. Zonder `profiel_ids` blijft het bestaande gedrag (oude/mobiele clients) ongewijzigd.
- **`POST /profielen/:id/toepassen`:** herberekent gebruikers met meerdere rollen over ál hun rollen (niet alleen het gewijzigde profiel).
- **Frontend Gebruikersbeheer:** rolkeuze is nu een multi-select met chips; het module-grid is een **read-only weergave** van de effectieve rechten ("afgeleid uit de rollen") — handmatige per-module uitzonderingen zijn vervallen; wie andere rechten nodig heeft maakt een eigen rol aan onder Beheer › Rollen & rechten. Detailweergave toont bij meerdere rollen alle rolchips.
- **Gedeelde bron:** frontend en server gebruiken dezelfde `MODULES`/`NIVEAUS`/`combineerBevoegdheden` uit `@workspace/permissies` (lokale kopieën verwijderd).

**Bewijs (end-to-end tegen dev, met DB-verificatie):** POST met 2 rollen + opzettelijk foute client-matrix → matrix = MAX-combinatie, nepmatrix genegeerd; koppeltabel exact [A,B], herkomst leeg; PATCH naar [A] → matrix exact profiel A, herkomst=A, koppeltabel gesynct; PATCH naar [] → geen toegang (alle modules 0), koppeltabel leeg. Testgebruiker opgeruimd. Typecheck volledig groen.

**Architectreview-fixes (zelfde dag, beide end-to-end bewezen):**
1. `POST /gebruikers` met `profiel_ids: []` viel nog in het legacy-pad en nam de client-matrix over — nu consistent met PATCH: lege rollenset = server-afgeleid "geen toegang" (nep-clientmatrix aantoonbaar genegeerd).
2. Stille rechten-wipe voorkomen: het bewerkformulier stuurt `profiel_ids` alleen mee als de gebruiker rolgestuurd is (had rollen of er zijn rollen gekozen). Een legacy-gebruiker met handmatige matrix en zonder rollen behoudt zijn rechten bij het bewerken van losse velden (API + DB bewezen). Daarnaast toont het read-only grid bij een rolgestuurde gebruiker nu de uit de rollen afgeleide matrix — precies wat er na opslaan geldt — zodat een handmatige afwijking nooit onzichtbaar verdwijnt.

## 2026-07-09 — Nieuwsbalk in taakbalk twee keer zo snel

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** geen

De nieuwsticker in de taakbalk onderin scrollt nu twee keer zo snel: de animatieduur is gehalveerd (factor 2,5s → 1,25s per nieuwsitem, minimum 15s → 7,5s). De duur schaalt nog steeds mee met het aantal items; de naadloze herhaling (translateX -50%), hover-pauze en de pauzeknop zijn ongewijzigd. Alleen `artifacts/firevault/src/components/nieuws-ticker.tsx` aangepast. Typecheck groen (na regeneratie van stale lib-declaraties via codegen).

## 2026-07-09 — Onderzoek "Jacqueline kan niet inloggen" (productie) + activatiefix

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** geen (onderzoek read-only op productie; codefix is één gedragscorrectie in de activatieflow, alleen in dev)

**Diagnose met bewijs (productie-DB, read-only):** account Jacqueline (id 2) was actief, niet vergrendeld, wachtwoordhash aanwezig — maar álle ~20 inlogpogingen (8–9 juli) faalden op de wachtwoordcontrole. Oorzaak: de uitnodigingsmail waarmee ze haar wachtwoord moest instellen is **nooit aangekomen, omdat productie geen mailconfiguratie heeft** (geen `AZURE_TENANT_ID`/`AZURE_CLIENT_ID`/`AZURE_CLIENT_SECRET`/`MAIL_FROM`/`MAIL_MAILBOX` in `deploy/.env.production`). Ze had dus nooit een werkend wachtwoord.

**Afloop:** om 12:40:24 is het account alsnog succesvol geactiveerd via de activatielink (wachtwoord gezet, 2FA ingericht, login gelukt — zelfde apparaat/IP als alle eerdere pogingen). Login-registratie id 40: `gelukt=true`.

**Codefix (dev):** `POST /uitnodiging/:token/activeren` zette de vlag `moet_wachtwoord_wijzigen` niet uit, terwijl de gebruiker daar zelf een wachtwoord kiest — de app dwong dan direct na activatie alsnog een wijziging af. Nu wordt de vlag daar uitgezet (consistent met wachtwoord-reset en wachtwoord-wijzigen). Typecheck groen.

**Structureel openstaand:** productie kan géén e-mail versturen — uitnodigingen en wachtwoord-vergeten-mails komen nooit aan. Vereist de Microsoft 365 Graph-variabelen in `deploy/.env.production` op de VPS. Daarnaast: de api-container op productie logt 0 regels (LOG_LEVEL-instelling controleren bij een volgende release).

## 2026-07-09 — Productie-release a8a8dc7c uitgerold naar connect.fps-one.nl

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (back-up vooraf; alle checks groen; rollback-procedure beschikbaar)

**Toegang hersteld (reconstructie):** de originele deploymethode is gereconstrueerd en bewezen: SSH als **`rene`** (niet `fps-beheer`) met de originele sleutel `fps_productie_nieuw`; repo staat in **`/opt/fps-one`** (niet `/opt/fps-connect` zoals het runbook beweerde). Alle eerdere mislukte pogingen testten tegen de verkeerde gebruikersnaam.

**Uitgevoerd volgens checklist:**
1. Pre-release databaseback-up (`~/backups/pre-release-20260709.sql.gz`, integriteit gecontroleerd)
2. `git pull` naar mergecommit `a8a8dc7c` (66 commits achterstand ingelopen)
3. Images gebouwd (api, caddy, migrate) — eerste build faalde op het caddy-doel omdat de upstream `.dockerignore` heel `scripts` uitsloot terwijl `Dockerfile.caddy` `scripts/package.json` kopieert; de bestaande serverfix (`scripts/*` + `!scripts/package.json`) teruggezet en als commit `c93e4b42` naar `main` gepusht zodat volgende deploys dit niet meer raken
4. Migraties toegepast (drizzle: "Changes applied", exit 0)
5. Stack herstart; api healthy, caddy up

**Verificatie:** healthz `{"status":"ok"}`; nieuwe frontend-bundel wordt uitgeleverd; onbevoegde API-toegang geeft 401; foute login geeft 401; API-logs zonder fouten; migrate-container exit 0; draaiende containers gebruiken aantoonbaar de verse images.

**Restpunt voor gebruiker:** handmatige weblogin-check (TOTP-inlog, gebruiker bewerken, AI Inbox upload) — vereist productie-inloggegevens. **Beveiligingsadvies:** de deploysleutel is tijdens deze sessie in de chat gedeeld en daarmee blootgesteld; bij gelegenheid vervangen.

## 2026-07-09 — Onderzoek testgebruikers in preview + automatische e2e-opruiming

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** geen (alleen testscripts + dev-data; productie aantoonbaar onaangetast)

**Aanleiding:** Gebruikersbeheer in de preview toonde e2e-/testaccounts. Onderzocht met bewijs:

1. De preview draait op de Replit **dev-database** (`heliumdb`), niet op productie.
2. Er is **geen mock- of fallbackdata**: de gebruikerspagina toont uitsluitend echte rijen uit `GET /gebruikers` (grep op mock/dummy in de frontend: leeg).
3. De zichtbare accounts waren **echte dev-rijen**: vaste e2e-accounts (`e2e-menu@`, `e2e-ww-admin@`, `e2e-ww-target@fps.local`) die bewust persistent waren voor herhaalbare tests, plus één handmatig testscenario-account (`testgebruiker@fps.local`, opdracht 5 juli).
4. De Pre-Publish Validatie ruimde haar wegwerpaccounts **wél** op (ids 42–45 stonden al op inactief + gearchiveerd); alleen de vaste accounts bleven actief staan.
5. **Productie is onaangetast**: read-only query op de productie-database toont géén enkel e2e-/PrePub-account (alleen de drie oude `@fps-test.nl` accounts uit een eerdere fase).

**Opgeruimd:** alle 8 test-/e2e-rijen in dev staan nu op inactief + gearchiveerd en zijn daarmee uit het standaardoverzicht van Gebruikersbeheer verdwenen (de lijst verbergt gearchiveerden standaard).

**Structureel geregeld (automatische opruiming):**
- Seeders (`e2e-wachtwoord-testaccounts.ts`, `e2e-monteur-testaccount.ts`) hebben nu archiveer-functies; de monteur-seeder zet bij heractivatie ook expliciet `gearchiveerd=false`.
- Beide e2e-runners (`e2e-web-run.ts`, `e2e-monteur-run.ts`) archiveren en deactiveren de testaccounts **altijd** in hun `finally`-blok — ook wanneer tests falen. De volgende run heractiveert ze via de idempotente seeders.
- Beide seeders hebben nu een `weigerBuitenDev()`-guard: e2e-accounts kunnen nooit in een deployment/productie worden aangemaakt of geheractiveerd (de monteur-seeder miste deze guard nog; op advies van de review toegevoegd).
- **Accountsplitsing web/monteur**: de web-suite gebruikte aanvankelijk hetzelfde `e2e-menu`-account als de monteur-suite; bij parallelle runs (zoals in de validatiepijplijn) brak de opruiming van de ene suite de lopende tests van de andere (de API controleert `actief` bij elke request). Opgelost door de web-suite een eigen vast account te geven (`e2e-web@fps.local`, eigen TOTP-secret); elke runner archiveert uitsluitend zijn eigen accounts. Bewezen met een gelijktijdige run van beide suites: beide groen, alle accounts na afloop gearchiveerd.

## 2026-07-10 — AVG-verzoek notificaties en login-blokkade (Task #260/#261)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additieve e-mailfunctionaliteit + extra login-check)

**Nieuw gebouwd:**
- #260 — Automatische e-mailnotificatie bij het afhandelen of afwijzen van een AVG-verzoek. Bij status "afgerond" of "afgewezen" in `PATCH /avg/inzageverzoek/:id` ontvangt de gebruiker nu een e-mail met de status en toelichting. Bij een afgerond inzageverzoek bevat de mail een directe link naar de gegevens-export (`/api/avg/inzageverzoek/:id/export`).
- #261 — Inlogbeveiliging aangescherpt voor geanonimiseerde accounts. De login-routes (`/auth/login` en `/auth/mobile/login`) en het 2FA-setup-endpoint (`/auth/2fa/setup`) controleren nu expliciet op het `geanonimiseerd`-veld in de database en weigeren toegang met een 403-foutmelding. Dit voorkomt dat geanonimiseerde accounts opnieuw geactiveerd of gebruikt kunnen worden.

**Bewijs:** api-server `typecheck` groen; e-mailservice uitgebreid met `stuurAvgVerzoekAfgehandeldMail`; auth-logic geverifieerd op blokkade van geanonimiseerde records.
