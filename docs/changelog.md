# Changelog — FPS Connect

Overzicht van opdrachten, fixes en bouwwerk per datum.
Voor elke taak drie scores:
- **Uitvoering** — volledig / gedeeltelijk / niet

## 2026-07-10 — Post-deploy healthcheck: mislukte release faalt automatisch (Task #496)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (uitsluitend CI/deploy-script; geen app-, DB- of libwijziging)

**Probleem:** de deploy-workflow stopte alleen bij een fout tijdens `git pull` / `build` / `migrate` / `up -d`, maar controleerde daarna niet of de applicatie ook echt gezond draaide. Een deploy kon dus "groen" zijn terwijl de site stuk was (api start niet, halve migratie).

**Wat is toegevoegd (`.github/workflows/deploy.yml`):** een post-deploy healthcheck na `up -d`. Een retry-lus (30 pogingen × 5s = ~150s) pollt `GET /api/healthz` binnen de api-container via de al bestaande node-check (poort 8080 is intern, niet op de host gepubliceerd). Daarna wordt de publieke route via caddy gecontroleerd (`curl -fsSk https://localhost/api/healthz`). Faalt een van beide binnen de timeout, dan print de workflow `docker compose ps` + laatste container-logs en faalt de run (`exit 1`), zodat een kapotte release direct zichtbaar faalt in GitHub Actions. De ruime timeout + retries voorkomen valse positieven bij normale opstarttijd.

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
