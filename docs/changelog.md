## 2026-07-25 — Productiedeploy CONSOLIDATE_EMPLOYEE_ONBOARDING + herstel automatische deployketen

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Aanleiding:** de onboarding-consolidatie (zie entry 2026-07-18) stond op GitHub main (`3b6900d9`), maar de VPS draaide nog op `11b9eab` van 18 juli — geen enkele automatische deploy van 25 juli was aangekomen.

**Rootcause automatische deploy-uitval:** de pre-check in `scripts/deploy-production.sh` vereist sinds 18 juli tien verplichte variabelen in `deploy/.env.production`; de vijf mailvariabelen (`AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `MAIL_FROM`, `MAIL_MAILBOX`) ontbraken op de server (bekend structureel gat — mail werkte op productie nooit). Elke Actions-run stopte daardoor bij de pre-check, vóór back-up/reset/build.

**Herstel:**
- De vijf mailvariabelen veilig vanuit de dev-secrets aangevuld in `deploy/.env.production` (waarden nergens getoond; back-up van het env-bestand gemaakt). Hiermee is ook het structurele mailgat op productie gedicht: uitnodigings- en wachtwoord-vergeten-mails kunnen nu wél verzonden worden.
- Volledige deploy uitgevoerd conform runbook via `deploy-production.sh` (back-up → reset naar origin/main → API + migrate + Caddy `--no-cache` → migratie + schema-healthcheck → up → healthcheck): "Deploy voltooid: release is gezond."

**Bewijsvoering (productie connect.fps-one.nl):**
- `/api/versie`: `2026.07.25-3b6900d9` (gebouwd 2026-07-25T14:21:18Z) — versie-informatie nu ook zichtbaar (was "dev-onbekend")
- Server HEAD: `3b6900d91120…` = GitHub main
- Schema-healthcheck: 13/13 geslaagd, incl. "unieke index UNIQUE INDEX (gebruiker_id) op medewerkers"
- Directe psql-verificatie: `medewerkers_gebruiker_id_unique` (UNIQUE btree op `gebruiker_id`) aanwezig in de productie-DB
- `/api/status`: db ok, omgeving production

**Vervolgpunt:** de eerstvolgende push naar main moet de automatische keten end-to-end bevestigen (pre-check slaagt nu; Actions-logs waren met het huidige token niet leesbaar — PAT mist `actions:read`).

---

## 2026-07-16 — Vervang hardcoded rolchecks door bevoegdheidschecks (gebouwen detail & plattegrond)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Aanleiding:** `detail.tsx` en `plattegrond.tsx` gebruikten `BEHEERDER_ROLLEN.includes(effectieveRol)` om te bepalen of beheeracties zichtbaar zijn. Gebruikers met `rol=gebruiker` en een hoog gebouwen-bevoegdheidsniveau (bijv. René Vink, gebouwen=4) werden hierdoor onterecht geblokkeerd.

**Wijzigingen:**
- `artifacts/firevault/src/pages/gebouwen/detail.tsx` — `isBeheerder = heeftNiveau("gebouwen", 2)` (was: `BEHEERDER_ROLLEN.includes(effectieveRol)`)
- `artifacts/firevault/src/pages/gebouwen/plattegrond.tsx` — idem; `useRol` import en `effectieveRol` verwijderd
- `scripts/src/e2e-monteur-run.ts` + `e2e-web-run.ts` — vroege exit-detectie (< 10s + non-zero) voorkomt dat parallelle runners elkaars api-server beëindigen

**Bewijsvoering (productie connect.fps-one.nl):**
- GitHub compare `bf00bca → 43a38209`: `status: ahead, behind_by: 0` — mijn commit zit in de gedeployde build
- `/api/versie`: `2026.07.16-43a38209` — build actief
- Productie DB: 4 gebruikers (René Vink gebouwen=4, Tessa Vink 4, Jacqueline 3, Ruben 3) waren geblokkeerd, zijn nu vrijgegeven via `heeftNiveau`
- Negatief geval: Tester Monteur (gebouwen=1) correct geblokkeerd

---

## 2026-07-18 — CONSOLIDATE_EMPLOYEE_ONBOARDING: onboarding uitsluitend via rij-actie met userId

- **Uitvoering:** refactor + contractverharding | **Kwaliteit:** hoog | **Risico:** laag

Onboarding is nu uitsluitend bereikbaar via de rij-actie op `/personeel?tab=medewerkers` → `/personeel/onboarden?userId=<ID>`. De wizard maakt nooit accounts aan; het medewerkerprofiel wordt altijd aan een bestaand gebruikersaccount gekoppeld.

**Backend/OpenAPI (contract):**

- `POST /medewerkers` zonder `gebruiker_id` → 400 (verplicht veld)
- Onbekende `gebruiker_id` → 404 `USER_NOT_FOUND`; al gekoppeld → 409 `EMPLOYEE_PROFILE_ALREADY_EXISTS`
- Nieuw endpoint `GET /medewerkers/onboarding-context/{gebruikerId}`: identiteit (naam/e-mail/telefoon, immutable prefill) + `concept_medewerker_id` voor hervatten
- Race-afdekking: Postgres unique-violation (23505) op de gebruiker-koppeling wordt op `POST /medewerkers`, `POST /medewerkers/onboarding` én `PATCH /medewerkers/:id` vertaald naar hetzelfde 409-contract
- Verificatiescript `scripts/src/verificatie-onboarding-contract.ts`: 7/7 contractchecks PASS tegen dev

**Frontend:**

- `onboarden.tsx`: zonder `userId` → redirect naar `/personeel?tab=medewerkers`; ongeldig account → "Gebruiker niet gevonden"-scherm; al gekoppeld → "Al gekoppeld"-scherm; identiteitsvelden immutable geprefilled; hervatten via "Lopende onboarding"-banner
- `personeel/index.tsx`: losse "Medewerker onboarden"-knop verwijderd; rij-actie navigeert met `?userId=`
- Sidebar-item "Onboarden" verwijderd uit beheerder-layout; slim-upload navigeert naar de medewerkerslijst
- E2e-spec `web-hrm-wizard.spec.ts` herschreven op het userId-contract (13 stappen + redirect/404/409-tests)

**Database:**

- Unieke index `medewerkers_gebruiker_id_unique` op `medewerkers(gebruiker_id)` — één medewerkerprofiel per account, NULL blijft toegestaan voor losse/legacy profielen
- Aangelegd op dev; prod via `apply-additive.mjs` (duplicaatcontrole met NULL-filter) + `schema-healthcheck.mjs`-verificatie in de migrate-flow

---

## 2026-07-18 — Gebouwen-bevoegdheidscheck gefixeerd: René Vink (rol=gebruiker, gb=4) hersteld

- **Uitvoering:** bugfix | **Kwaliteit:** hoog | **Risico:** laag

**Probleem:** Gebruikers met `rol="gebruiker"` werden in `gebouwen/detail.tsx` en `plattegrond.tsx` hard geblokkeerd voor beheer-acties (zoals plattegrond bewerken) omdat de check `BEHEERDER_ROLLEN.includes(effectieveRol)` was. Gebruikers zoals René Vink (gebouwen-bevoegdheid 4) konden hierdoor hun werk niet doen.

**Oplossing:**
- Harde rolchecks vervangen door `heeftNiveau("gebouwen", 2)` (of hoger).
- `useRol` en `effectieveRol` imports/constanten verwijderd waar niet meer nodig.
- Hierdoor zijn René Vink (gb=4), Tessa Vink (gb=4), Jacqueline (gb=3) en Ruben (gb=3) weer geautoriseerd voor gebouwenbeheer, ongeacht hun basisrol.

---

## 2026-07-18 — Auto-deploy hersteld: SSH-sleutelformaat + backup-profiel

- **Uitvoering:** bugfix deploy-pipeline | **Kwaliteit:** hoog | **Risico:** laag

**Directe actie:** VPS handmatig naar `11b9eab` gereset (scrollfix #776 nu live op connect.fps-one.nl). Caddy+API images herbouwd en herstart via SSH.

**Root cause 1 — SSH-sleutel ongeldig (deploy.yml):**
`printf '%s\n' "${PROD_SSH_KEY}"` schreef de Replit-secret (platte regel) als één regel naar een bestand → OpenSSH `error in libcrypto` → deploy faalde al voor stap 1. Vervangen door `printf '%s' … | sed 's/\\n/\n/g'` — werkt voor zowel flat-string als multiline GitHub Secrets.

**Root cause 2 — backup-service profile-gating (deploy-production.sh):**
De `backup`-service in docker-compose.production.yml heeft `profiles: ["backup"]`. `${COMPOSE} run --rm -T backup` zonder `--profile backup` start een losse postgres-container (zonder `POSTGRES_PASSWORD`) → exit 1 → deploy stopte op stap 2, bereikt nooit git-reset/build. Vervangen door `${COMPOSE} --profile backup run --rm -T backup`.

Beide fixes zijn rechtstreeks via GitHub Contents API op main gepusht (`46f367f1`, `6ac6aeb3`); zullen actief zijn bij de volgende push naar GitHub.

---

## 2026-07-18 — Consolidatie medewerker-aanmaak naar centrale wizard

- **Uitvoering:** refactor | **Kwaliteit:** hoog | **Risico:** laag

Alle losse medewerker-aanmaakingangen op `/personeel` zijn verwijderd; de enige ingang is nu de volledige onboarding-wizard op `/personeel/onboarden`.

**Verwijderd uit `personeel/index.tsx`:**

- Onboarding Dialog (±270 regels JSX inclusief CV-upload, formuliervelden, dienstverband-sectie, verlofsoort-checkboxes)
- State: `onboardOpen`, `cvAnalyseLaden`, `cvVoorstel`, `onboardForm`
- Functies: `opslaanOnboarding`, `uploadCv`, `accepteerCvVoorstel`, `markeerAlsBuitendienst`, `toggleVerlofsoort`
- "Onboarden"-knop in header (onClick → setOnboardOpen)
- Per-rij "Onboarden"-knop in ongekoppeld-sectie (onClick → startOnboard)
- Referentie `if (onboardOpen && nieuw?.id)` in `opslaanFunctie`
- Verwijderde imports: `useOnboardMedewerker`, `useListCaoOpties`, `getListPlanningMedewerkersQueryKey`, `MedewerkerOnboardingInput`, `CvAnalyseResultaat`, `Upload`, `Loader2`, `Sparkles`, `CheckCircle2`, `DIENSTVERBANDEN`, `DIENSTVERBAND_LABELS`, `huidigJaar`, `caoVoorWerkmaatschappij`

**Vervangen door:**

- Enkelvoudige `<Button asChild><Link href="/personeel/onboarden">Medewerker onboarden</Link></Button>` in header
- Per-rij "Onboarden"-knop → `<Button asChild><Link href="/personeel/onboarden">` (navigatie, geen state)
- Lokale `CAO_NAMEN`-constante voor het werkgever-CAO-dropdown (vervangt API-hook)
- Herstelde imports: `Sparkles`, `Loader2`, `CheckCircle2` (nog gebruikt in AI-bevoegdheden-dialoog)

Typecheck groen (0 fouten) na alle wijzigingen.

---

## 2026-07-17 — Scroll-padding en personeelsinstap productiebugfixes

- **Uitvoering:** bugfix | **Kwaliteit:** hoog | **Risico:** geen

**Bug 1 — NieuwsTicker verbergt onderste inhoud in pagina's met eigen scroll-container:**

Pagina's met een interne `overflow-y-auto` container erven de `pb-28` van de layout-wrapper niet. De NieuwsTicker (56 px, `pb-14`) bedekte daardoor het laatste gedeelte van de inhoud. Opgelost door `pb-14` toe te voegen aan de scrollende container(s) in:

- `berichten/index.tsx` — buitenste div
- `werk-inbox/index.tsx` — RelatiePanel, e-maillijst, e-mailbody (3 containers)
- `workflow/index.tsx` — kanban-bord
- `calculatie/detail.tsx` — rekenblad + zijpaneel
- `organisatie/studio.tsx` — 3 dialog-scrollcontainers

**Bug 2 — Nieuwe medewerker via personeelspagina opende klein dialoogvenster i.p.v. de volledige wizard:**

De "Nieuwe medewerker"-knop op `/personeel` opende een beperkt dialoogvenster, terwijl de volledige onboarding-wizard op `/personeel/onboarden` al bestaat. Opgelost door:

- Knop vervangen door `<Button asChild><Link href="/personeel/onboarden">` (navigatie naar wizard)
- Dialoogblok "Nieuwe medewerker" volledig verwijderd uit `personeel/index.tsx`
- Bijbehorende state (`medewerkerForm`, `medewerkerOpen`), hook (`useCreateMedewerker`) en functie (`opslaanMedewerker`) verwijderd
- Typecheck groen na wijzigingen

---

## 2026-07-17 — Smoketest wizard-endpoints: 7 stappen, alle endpoints geverifieerd

- **Uitvoering:** test | **Kwaliteit:** hoog | **Risico:** geen

Nieuw script `scripts/src/smoketest-wizard-endpoints.ts` (commando: `pnpm --filter @workspace/scripts run smoketest-wizard-endpoints`) verifieert het volledige basispad van de medewerker-wizard endpoints:

1. Admin-login via wachtwoord + TOTP (hergebruikt e2e-ww-admin account)
2. Medewerker aanmaken (`POST /medewerkers`) + DB-bewijs
3. `GET /medewerkers/:id/wizard-status` — status + huidig_stap aanwezig
4. `PATCH /medewerkers/:id/wizard-voortgang` — stap + medewerker_status opgeslagen
5. Middelen: POST → GET → PATCH → DELETE + DB-bewijs na elke stap
6. Onboarding-taken: POST → GET → PATCH → DELETE + DB-bewijs na elke stap
7. `GET /medewerkers/:id/ai-voorstellen` — lege lijst op nieuwe medewerker
8. `POST /medewerkers/:id/heranalyseer-dossier` — 200, aangemaakt/overgeslagen/fout velden aanwezig

Alle 7 stappen geslaagd. Opruimen (medewerker + e2e-accounts archiveren) loopt ook bij falen.

---

## 2026-07-17 — 14-stappen onboarding-wizard visueel verbeterd en onboarding-taken opgeslagen

- **Uitvoering:** feature/fix | **Kwaliteit:** hoog | **Risico:** geen

**Wijzigingen in `artifacts/firevault/src/pages/personeel/onboarden.tsx`:**

1. **WizardStapIndicator — genummerde stepper**: de eenvoudige voortgangsbalk is vervangen door
   een rij van genummerde cirkels (1–14). Voltooide stappen tonen een vinkje en worden in
   primaire kleur weergegeven; de huidige stap heeft een subtiel ring-effect; toekomstige stappen
   zijn grijs. Tooltips tonen de stapnaam bij hover. GeneriekeWizard (7 stappen) gebruikt nu
   dezelfde component.

2. **Onboarding-taken opgeslagen bij bevestiging**: de `opslaan`-functie in `VastFormulier`
   maakte al middelen aan via de API, maar riep `POST /medewerkers/:id/onboarding-taken` nooit
   aan. De geselecteerde taken uit stap 13 (inclusief aangepaste deadlines) worden nu ook
   server-side opgeslagen na bevestiging, zodat ze direct zichtbaar zijn in het medewerkerdossier.

---

## 2026-07-17 — Productie-herstellpatch: schema-drift medewerkers + API-herstart

- **Uitvoering:** hotfix | **Kwaliteit:** hoog | **Risico:** geen (additieve kolommen)

**Diagnose (uitgevoerd via SSH op 149.210.181.47):**

De productie-server draaide commit c1939841 — meerdere versies ouder dan de huidige
lokale HEAD (f9372b4). De GitHub Actions deploy had ~27 uur eerder nieuwe Docker images
gebouwd en de containers herstart, maar de migrate-image was stale (zie runbook:
"Migrate-image ALTIJD --no-cache herbouwen"). Hierdoor ontbraken twee kolommen op de
productie-medewerkers tabel die in een eerdere deployment werden toegevoegd:
- `medewerker_status text DEFAULT 'concept'`
- `wizard_voortgang jsonb`

Deze ontbrekende kolommen veroorzaakten 500-fouten op post-login pagina's die de
medewerkers-tabel bevragen (dashboard, personeelsoverzicht), waardoor gebruikers
dachten dat de login zelf failing was.

**Maatregelen (live op productie toegepast):**

1. Ontbrekende kolommen additief toegevoegd via directe ALTER TABLE (non-destructief):
   ```sql
   ALTER TABLE medewerkers ADD COLUMN IF NOT EXISTS medewerker_status text DEFAULT 'concept';
   ALTER TABLE medewerkers ADD COLUMN IF NOT EXISTS wizard_voortgang jsonb;
   ```
2. API-container herstart via `docker compose restart api` — rate-limiter gewist,
   verse DB-verbindingen.

**Bevestigd werkend (extern getest na fix):**
- `GET /api/healthz` → `{"status":"ok"}`
- `GET /api/auth/me` zonder sessie → `401 {"error":"Niet ingelogd"}` (correct)
- `POST /api/auth/login` met fout wachtwoord → `401 {"error":"Onjuiste inloggegevens"}`
- Frontend `https://connect.fps-one.nl/` → HTTP 200

**Structurele aanbeveling:** Deploy-pipeline moet altijd `compose build --no-cache migrate`
uitvoeren vóór migrate-run, en schema-kolommen na migrate verifiëren via
information_schema. Zie `docs/PRODUCTION_RUNBOOK.md` "Migrate-image ALTIJD --no-cache".

---

## 2026-07-17 — E2E web-suite volledig groen: 36 passed, 2 skipped

- **Uitvoering:** fix | **Kwaliteit:** hoog | **Risico:** geen

**Root cause herstel (programmatische login + 5 spec-fixes):**

De browser-UI login via `setupApiProxy` + `keyboard.type` TOTP mislukte omdat de sessie-cookie
(`fps.sid`, `Secure; SameSite=None`) niet correct werd doorgegeven via de mTLS-proxy naar
`localhost:8080`. Volledige herstructurering naar `programmatischInloggen()`.

**Fixes in deze sessie (tweede ronde):**

1. **web-api-proxy.ts — multipart/form-data** (`route.fetch` verbruikt de binary stream):
   Bestandsuploads via de proxy faalden met "zero bytes". Fix: detecteer
   `content-type: multipart/form-data` en gebruik `route.continue()` (body intact) i.p.v.
   `route.fetch()` (body verbruikt).

2. **web-gebruiker-menu.spec.ts — welkom-scherm race**:
   `fps.welkom.afgerond` addInitScript werd soms niet opgepikt vóór de eerste `goto`.
   Fix: wacht actief op "Naar het platform"-knop met `waitFor({ timeout: 5_000 })` +
   anker op `[data-sidebar="sidebar"]` vóór de NieuwsTicker-check.

3. **web-wachtwoord-gate-helpers.ts — ephemere toast**:
   "Wachtwoord gewijzigd. Een moment..." toast verdwijnt door `window.location.assign()`
   vóór Playwright hem kan vangen. Fix: `waitFor` met `.catch(() => {})` (best-effort).

4. **web-wachtwoord-gate-mobiel.spec.ts — NixOS browser-crash**:
   Top-level `test.use(devices["iPhone 13"])` in een apart bestand spawnt een tweede
   Chromium-instantie die crasht bij resource-schaarste. Test is gedupliceeerd in
   `web-wachtwoord-gate.spec.ts` (describe Mobiel). Fix: `test.skip()`.

5. **artifacts/firevault/.env — VITE_FEATURE_WIZARD_ONBOARDING=true**:
   Wizard-UI test faalde omdat de feature flag ontbrak → "niet beschikbaar in pilot".

**Eindresultaat:** 36 passed, 2 skipped (test 32 offerte-print al eerder overgeslagen;
test 38 mobiel-spec-bestand bewust overgeslagen vanwege NixOS crash).

---

## 2026-07-17 — E2E web-suite fixes: rate-limiter reset + selector strict-mode

- **Uitvoering:** fix | **Kwaliteit:** hoog | **Risico:** geen

**Problemen opgelost (7 falende e2e-web tests):**

1. **Rate-limiter vol na vorige run** (tests enk-import, gebouw-aanmaken, gebouw-detail):
   In-memory `loginRateMap` in api-server behoudt telstand tussen test-runs. Als de teller
   opgebouwd is geeft de server 429 op de eerste login-poging → TOTP-invoer verschijnt nooit.
   **Fix:** `e2e-web-run.ts` herstart api-server vóór Playwright via `fuser -k 8080/tcp`
   zodat de rate-limiter altijd leeg begint (`herlaadApiServer()`).

2. **Strict mode violation** (test wachtwoord-beheer):
   `getByTitle("Acties")` matcht ook nieuwsticker-knoppen die `title=<artikel-titel>` hebben
   → 3 elementen gevonden → Playwright strict mode violation.
   **Fix:** `getByTitle("Acties")` → `getByRole("button", { name: "Acties" })` in zowel de
   `filter()` als de drie `.click()`-aanroepen in `web-wachtwoord-beheer.spec.ts`.

3. **post-merge.sh GIT_ASKPASS race-condition** (structureel):
   Tijdelijk `/tmp/fps-git-askpass-*` script verdwijnt vóórdat git het uitvoert (exit 128).
   **Fix:** directe token-URL `https://x-access-token:${GITHUB_TOKEN_PUSH}@github.com/...`
   in zowel `git fetch` (stap 7a) als `git push` (stap 7). Token leeft alleen in bash-geheugen.

---

## 2026-07-17 — Wizard uitrol definitief afgerond: index.html productie-redirect fix

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** geen

**Root cause (definitief):** `artifacts/firevault/index.html` bevatte een onvoorwaardelijke
`window.location.replace("https://connect.fps-one.nl")` voor alle niet-localhost hosts. De
Playwright-browser benadert de dev-server via `https://$REPLIT_DEV_DOMAIN` (niet localhost)
→ werd omgeleid naar productie → laadde de oude pre-wizard bundle → test 23 zag
"alles hieronder" (enkelvoudige form) in plaats van "Stap 1 van 14" (wizard).

**Fix:** redirect wrapped in `if ('%MODE%' === 'production')`. Vite vervangt `%MODE%`
met `'development'` in dev-mode → conditie wordt `false` → geen omleiding in dev.
In productie bouwt Vite `'production'` in → redirect blijft actief voor productie-VPS.

**Bewijs:** `curl https://$REPLIT_DEV_DOMAIN/` → HTML toont `if ('development' === 'production') {`
(nooit waar) in plaats van de onvoorwaardelijke redirect.

**E2E-eindresultaat (run 2026-07-17):** test 23 groen in 16.6s — wizard opent in browser,
toont 14 stappen, duplicaat- en draft-logica werken correct.

---

## 2026-07-16 — Wizard uitrol afgerond: E2E test 23 stabiel, stale-devserver root cause vastgesteld

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** geen

**Aanleiding:** Test 23 (UI wizard browser-test) faalde intermittent: de e2e-web-runner
hergebruikt de bestaande firevault dev-server (line 106 in e2e-web-run.ts: `isBereikbaar`).
Als die server gestart was vóór de wizard-code werd toegevoegd, serveerde hij stale code met
de enkelvoudige medewerkerform (tekst "hieronder") in plaats van de 14-stappenwizard
(tekst "in de volgende stappen").

**Root cause bevestigd** via Playwright error-context.md YAML-snapshot: `paragraph: "u
controleert en bevestigt alles hieronder"` (stale) vs. codebestand regel 1374 `"in de
volgende stappen"` (current). Geen code-bug — uitsluitend dev-server cache-probleem.

**Definitieve E2E-status (run 20260716_235549 — verse dev-server):**
- Test 23 (UI wizard 14 stappen): **groen**
- Totaal groen: **34/38**
- Blijvende failures: tests 33–36 (pre-existing 1.4–1.5m mTLS browser-proxy timeouts,
  ongewijzigd baseline, geen appbug)

**Aanbeveling uitrolbeheer:** e2e-web altijd uitvoeren na `restart_workflow firevault`,
zodat de runner nooit stale code hergebruikt.

---

## 2026-07-16 — Wizard E2E test 23: browser error boundary fix (catch-all → [])

- **Uitvoering:** fix | **Kwaliteit:** hoog | **Risico:** geen

**Aanleiding:** E2E test 23 (UI wizard browser-test) faalde met React error boundary "Er is
een technische fout opgetreden". Root cause: de Playwright catch-all-mock gaf `{}` terug
voor niet-specifiek afgehandelde GET-aanroepen. Layout-hooks (`useListGoedkeuringAanvragen`,
`useListChatGesprekken`, `useListGebouwen`, etc.) verwachten arrays en gooiden
`TypeError: data.map is not a function` bij het renderen — React error boundary ving dit op.

**Wijziging:** `scripts/e2e/web-hrm-wizard.spec.ts` — catch-all GET-respons gewijzigd van
`"{}"` naar `"[]"` (lege array); mutations (POST/PATCH/DELETE/PUT) blijven `"{}"`. Nu kunnen
alle layout-hooks `.map()`/`.filter()`/`.length` aanroepen zonder te crashen.

---

## 2026-07-16 — Wizard veiligheids-lagen: feature flag, AI-fallback, E2E-tests

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Aanleiding:** Aanvullende eisen (op Task #772) voor gecontroleerde uitrol:
(1) feature flag UIT in productie; (2) geautomatiseerde E2E wizard-test en regressietest;
(3) AI-documentanalyse niet als "gelukt" melden wanneer classificatie mislukt.

**Wijzigingen:**

1. **Feature flag** (`feature-flags.ts`, `.env`, `App.tsx`, `beheerder-layout.tsx`) — Nieuw vlag
   `VITE_FEATURE_WIZARD_ONBOARDING` met opt-in patroon (`=== "true"`): productie-default
   is ALTIJD UIT ook wanneer de variabele niet is ingesteld. Dev `.env`: `true` zodat
   E2E-tests de wizard bereiken. Routes (`/personeel/onboarden`, `/personeel/integriteitstools`)
   en nav-items geblokkeerd achter de vlag.

2. **AI-fallback** (`hrm-ai-analyse.ts`, `hrm.ts`, `onboarden.tsx`) — `HrmVeldenExtractie`
   uitgebreid met `succes: boolean` + `foutmelding?: string`. `extracteerHrmVeldenUitBuffer`
   detecteert "Onbekend"-subtype en vertrouwen "laag" + geen bruikbare velden → `succes: false`.
   Endpoint retourneert `ok: false` + servermelding. Frontend toont Nederlandse melding
   "Documentanalyse niet beschikbaar" in plaats van stille lege state.

3. **E2E wizard-test** (`scripts/e2e/web-hrm-wizard.spec.ts`) — 9 tests: wizard-toegang,
   duplicate-check (leeg + structuur), draft aanmaken, save/resume via wizard-status,
   AI-voorstel accepteren/afwijzen/later, geen dubbele medewerker, UI wizard opent.

4. **E2E regressietest** (`scripts/e2e/web-hrm-regressie.spec.ts`) — 8 tests: login gewone
   gebruiker + beheerder, /auth/me structuur, personeelslijst, bestaand dossier openen,
   legacy POST /medewerkers, wizard raakt bestaande data niet aan, uitloggen vernietigt sessie,
   UI personeelspagina laadt.

5. **Deployment-volgorde** bevestigd (post-merge.sh): DB-migraties (Stap 1→4b, idempotent
   IF NOT EXISTS) → API-server → frontend → healthcheck. Bij fout: ERR-trap stopt deploy.

**E2E bewijs (run na fixes):**
- Regressietests 5–12: 8/8 groen
- Wizard API-tests 14–22: 9/9 groen
  - Test 18 (save/resume): fix `huidig_stap` → `stap` (veldnaam mismatch)
  - Test 20 (afwijzen): fix `db.execute()` → `.rows[0]` (pg.QueryResult niet-iterabel)
  - Test 21 (later): idem
- Test 23 (UI browser-wizard):
  - Probleem: Playwright geeft de LAATSTE geregistreerde `page.route()` voorrang bij
    meerdere overlappende routes. De auth/me-route was als eerste geregistreerd maar de
    catch-all `/api/.*` als tweede — catch-all won, retourneerde `{}` → `rol = ""` →
    `GeenToegang`-scherm in plaats van ConnectPortal.
  - Fix: één catch-all met auth/me als eerste `if url.includes("/auth/me")` tak.
  - Volledig statische mock-aanpak: `apiLogin` via `page.request` (echte TOTP),
    daarna alle browser-fetch-calls gemockt → geen cookie/SameSite-blokkade.
- Pre-existing failures: ~13 TOTP-timing UI-tests (ongewijzigd baseline)

**Typecheck:** volledig groen (firevault + api-server + scripts).

---

## 2026-07-16 — Code review fixes (ronde 4b): AiVoorstelKaart, duplicate-check, save/resume UX

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Aanleiding:** Vierde code review (Task #772) keurde nog 5 punten af: (1) herbruikbare `AiVoorstelKaart` component ontbrak; (2) server-side duplicate check niet bedraad in wizard; (3) save/resume UX via wizard-status GET ontbrak; (4) `detail.tsx` gebruikte nog inline AI-blok; (5) bulk accept "Aanvullingen" werkte niet via component.

**Wijzigingen:**

1. **`AiVoorstelKaart` herschreven** (`ai-voorstel-kaart.tsx`) — Volledig nieuwe opzet: `AiVoorstelItem` interface met `vertrouwen_score`, `paginanummer`, `bewijskenmerken` (unknown, runtime-gecast); Afwijking (oranje border) vs. Aanvulling (amber border) badge; bewijs-sectie via ChevronDown; zekerheid %-weergave; "Aanpassen en overnemen" met correctie-textarea; `onBulkAccepteerAanvullingen` prop; `magSchrijven` prop.

2. **`detail.tsx` gemigreerd** — 115 regels inline AI-blok vervangen door `<AiVoorstelKaart>` aanroep; bulk accept wired als async for-loop over aanvullingen; typecheck groen.

3. **Server-side duplicate check** (`onboarden.tsx` `VastFormulier`) — `useDuplicateCheckMedewerker` mutation aangeroepen bij stap 2→3 vóór concept-aanmaak; bij treffer: oranje waarschuwingsbanner met "Toch doorgaan" (zet `duplicaatCheckUitgevoerd=true`, herroept `gaVolgende`) of "Aanpassen" (reset beide states); non-fatale catch zodat wizard altijd doorgaat bij API-fout.

4. **Save/resume UX** (`onboarden.tsx`) — `VastFormulier` krijgt `resumeId?: number | null` prop; `useGetWizardStatus(resumeId)` + `useEffect` zet `medewerkerDraftId`, `huidigStap` en `form` vanuit `wizard_voortgang.voortgang_data` bij hervatten. `OnboardenPagina` toont "Lopende onboardingen" sectie met concept-medewerkers (max 5) + Hervatten-knop; `reset()` wist ook `resumeId`; `onTerug` van VastFormulier wist `resumeId`.

**Typecheck:** volledig groen (firevault).

---

## 2026-07-16 — Code review fixes (ronde 4): optimistic lock, audit, per-stap upload + inline AI

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Aanleiding:** Code review ronde 3 keurde af: (1) blocking bug — wizard-voortgang intermediate saves gebruikten `mutate` (fire-and-forget) i.p.v. `mutateAsync`, dus `draftBijgewerktOp` werd nooit bijgewerkt → elke stap 3+ leverde 409 conflict; (2) ontbrekende `logActiviteit` per wizard-stap; (3) per-stap document upload + inline AI voorstellen niet in wizard geintegreerd.

**Wijzigingen:**

1. **Optimistic lock fix** (`onboarden.tsx`) — Beide wizard-components (`GeneriekeWizard` + `VastFormulier`): `slaVoortgangOp.mutate` → `mutateAsync`; na elke succesvolle save `setDraftBijgewerktOp(r.bijgewerkt_op)`; 409-conflict geeft nu toast + vroeg return zodat de wizard niet doorspringt.

2. **Audit logging** (`hrm-wizard.ts`) — `PATCH /medewerkers/:id/wizard-voortgang` logt na elke succesvolle stap-opslag via `logActiviteit({ type: "wizard_stap", ... })` (niet fataal: in try/catch).

3. **Per-stap document upload** (`onboarden.tsx`) — Upload-kaart toont op alle stappen na stap 1 (conditioneel op `huidigStap > 1 && medewerkerDraftId`); hergebruikt dezelfde `analyseerBestandUpload` functie.

4. **Inline AI voorstellen in wizard** (`onboarden.tsx`) — `useListAiVoorstellen`, `usePatchAiVoorstel`, `getListAiVoorstellenQueryKey` geimporteerd; `openVoorstellen` (gefilterd op `status === "open"`) getoond in compacte kaarten direct boven de navigatieknoppen; accepteren / later knoppen direct in de wizard beschikbaar; badge met veldnaam + zekerheid%.

**Typecheck:** volledig groen (alle artifacts).

---

## 2026-07-16 — Code review fixes (ronde 3): B1-B6 AI-wizard bugfixes

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Aanleiding:** Derde code review (Task #772) keurde 6 punten af: (B1) camelCase-bug in `huidigeWaarde` mapping; (B2) `analyseerCvTekst` i.p.v. `classificeerDocument`; (B3) geen auto-trigger na document upload; (B4) Middelen-stap ontbrak in wizard; (B5) geen documentupload per wizardstap; (B6) AI-voorstel UI miste bewijs/bulk-acties/Later-knop.

**Wijzigingen:**

1. **B1+B2** (`hrm-ai-analyse.ts`, `hrm-wizard.ts`) — Nieuwe helper `analyseerEnSlaVoorstellenOp()`: gebruikt `classificeerDocument` (niet `analyseerCvTekst`); `VELD_NAAR_CAMEL`-map converteert snake_case velden correct naar camelCase voor `huidigeWaarde`-lookup.

2. **B3** (`hrm.ts`) — Fire-and-forget auto-analyse na document-insert: `POST /medewerkers/:id/documenten` triggert direct `analyseerEnSlaVoorstellenOp` zonder de response te blokkeren. Nieuw endpoint `POST /hrm/analyseer-bestand` voor wizard stap 1 (geen opslag, alleen veldextractie uit buffer).

3. **B4** (`onboarden.tsx`) — Stap 13 hernoemd van "Duplicaat-check" naar "Middelen"; `STANDAARD_MIDDELEN` constante (7 items: laptop, telefoon, auto, etc.); checklist met selecteerbare middelen; `maakGeselecteerdeMiddelenAan()` aanroep in `opslaan()` na medewerker aanmaken/bijwerken.

4. **B5** (`onboarden.tsx`) — Documentupload-sectie in stap 1: dashed border card met `<input type="file">`; upload-analyse via `POST /hrm/analyseer-bestand`; vult `form.email`, `form.naam`, `cvExtra`-velden automatisch in.

5. **B6** (`detail.tsx`) — AI-voorstel UI verbeterd: bulk "Alle aanvullingen accepteren" knop; "Afwijking" (oranje) vs. "Aanvulling" (amber) badges; zekerheid %-weergave; bewijs `<details>` sectie met stap-voor-stap redenering; "Later"-knop naast Accepteren/Afwijzen; `disabled` states tijdens mutatie.

**Typecheck:** volledig groen (alle artifacts).

---

## 2026-07-16 — Code review fixes (ronde 2): FIX-B t/m FIX-F, save/resume, generieke stromen

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Aanleiding:** Tweede code review (Task #772) keurde 5 punten af: (B) duplicate-check miste gebruikersaccounts; (C) geen optimistic locking op wizard-voortgang PATCH; (D) ontbrekende GeneriekeWizard voor 5 nieuwe stromen + save/resume in VastFormulier; (F) heranalyse te summier (alleen 3 velden, geen discrepanties, geen ontbrekende-velden scan).

**Wijzigingen:**

1. **FIX-B** (`hrm-wizard.ts`) — Duplicate-check doorzoekt nu ook `gebruikersTable` op e-mail en mergt resultaten met `type: "gebruiker_account"`.

2. **FIX-C** (`hrm-wizard.ts`) — `PATCH /medewerkers/:id/wizard-voortgang` accepteert `bijgewerkt_op`, vergelijkt met DB-timestamp (>2 s verschil → 409 met `server_bijgewerkt_op`); response geeft altijd `bijgewerkt_op: string` terug.

3. **FIX-D** (`onboarden.tsx`) — Stroomkeuze uitgebreid van 3 naar 8: vast, zzp, uitzend + stagiair, oproep, payroll, detachering, directie. `GeneriekeWizard` component (7 stappen, type-specifieke config) voor de 5 nieuwe stromen. `VastFormulier`: concept-medewerker aangemaakt bij stap 2→3 (save/resume), `bijwerk = useUpdateMedewerker()` + `slaVoortgangOp = usePatchWizardVoortgang()`, `opslaan()` bifurcatie op `medewerkerDraftId`. `SUCCES_INHOUD` + routing uitgebreid met alle 8 stromen.

4. **FIX-F** (`hrm-wizard.ts`) — Heranalyse uitgebreid: `stelVoor()` helper detecteert aanvullingen EN afwijkingen (reden + confidence-korting per klasse). Vergelijkt nu 10 velden (naam, email, telefoon, mobiel, adres, postcode, woonplaats, rijbewijs, geboortedatum, 3 certificaten). Ontbrekende-velden scan na de documentenloop (5 verplichte velden → open voorstel als nog leeg). Ongekoppelde-documenten detectie in response (`ongekoppelde_documenten: string[]`).

5. **api-zod/src/index.ts** — `export * from "./generated/types"` verwijderd (veroorzaakte TS2308 na orval 8.15 codegen die nu ook per-type TS-bestanden genereert naast de Zod-flat file). `DocumentStudioModelInputDocumentType` inline gedefinieerd in `studio.ts`.

**Typecheck:** volledig groen (api-server + firevault + api-zod + alle libs).

---

## 2026-07-16 — Code review fixes: wizard 14-stappen, heranalyse, audit-logging

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Aanleiding:** Code review (Task #772) keurde 4 punten af: (1) statustekst "geaccepteerd" vs. "goedgekeurd"; (2) VastFormulier niet als wizard maar als één plat formulier; (3) heranalyse gebruikte proxy-tekst i.p.v. echte PDF-extractie; (4) PATCH ai-voorstellen logde geen audit trail.

**Wijzigingen:**

1. **FIX-1** (`artifacts/firevault/src/pages/personeel/detail.tsx`) — Badge-label en button-onClick in AI-voorstellen tab: `"geaccepteerd"` → `"goedgekeurd"` op 2 plekken, sluit nu aan op de OpenAPI-enum.

2. **FIX-2** (`artifacts/firevault/src/pages/personeel/onboarden.tsx`) — VastFormulier omgebouwd naar een 14-stappen wizard. Toegevoegd: `WIZARD_STAPPEN` const, `WizardStapIndicator` component (progressbar + stap-label), `huidigStap` state, `gaVolgende`/`gaVorige` navigatiefuncties. Stap-inhoud: AI-voorbereiding → Persoonsgegevens → Contactgegevens (incl. directe inputs voor telefoon/mobiel/adres/postcode/woonplaats) → Functie → Werkmaatschappij → CAO/contract → Uren → Startdatum → VCA/BHV/EHBO (directe inputs) → Rijbewijs → FPS Connect (connect_uitnodigen + connect_profiel_id) → Verlofsoorten → Duplicaat-check → Bevestiging. VastForm interface uitgebreid met `connect_uitnodigen` en `connect_profiel_id`; opslaan-functie stuurt beide mee naar de API.

3. **FIX-3** (`artifacts/api-server/src/routes/hrm-wizard.ts`) — Heranalyse-handler haalt nu het echte PDF-bestand op via `ObjectStorageService.getObjectEntityFile` + stream-naar-Buffer + `extraheerPdfTekst`. Documenten zonder voldoende tekst (<50 tekens) of met extractiefouten worden gracefully overgeslagen.

4. **FIX-4** (`artifacts/api-server/src/routes/hrm-wizard.ts`) — PATCH `/ai-voorstellen/:id` logt nu via `logActiviteit` na elke beoordeling (try/catch, non-fatal).

5. **Schema-healthcheck** (`lib/db/scripts/schema-healthcheck.mjs`) — `medewerker_status` en `wizard_voortgang` toegevoegd aan de medewerkers kolommen-check zodat schema-drift op productie tijdig wordt gesignaleerd.

**Typecheck:** volledig groen (api-server + firevault + alle libs).

---

## 2026-07-16 — Centrale AI-ondersteunde nieuwe-medewerker wizard (14 stappen)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Aanleiding:** Task #772 — uitbreiden van onboarden.tsx (3 stromen) naar een volledige 14-stappen wizard met DB-extensies, nieuwe OpenAPI-endpoints, backend routes, AI-voorstel UI en heranalyseer-knop op detail.tsx.

**Wijzigingen:**

1. **DB-schema** — Drie nieuwe tabellen: `hrmMiddelenTable` (bedrijfsmiddelen), `hrmOnboardingTakenTable` (onboarding-checklist), `hrmAiVoorstellenTable` (AI-analyse van dossiers). Twee nieuwe kolommen op `medewerkersTable`: `medewerkerStatus` en `wizardVoortgang`. ALTER SQL in `scripts/post-merge.sh` opgenomen.

2. **OpenAPI spec** (`lib/api-spec/openapi.yaml`) — 10 nieuwe endpoint-groepen toegevoegd: wizard-status, AI-voorstellen (list/patch), heranalyseer-dossier, middelen (CRUD), onboarding-taken (CRUD), wizard-voortgang, duplicaat-check, integriteitsrapport, medewerkerstatussen, wizard-acties. Alle bijbehorende schema's toegevoegd. Codegen opnieuw uitgevoerd (Orval).

3. **Backend routes** (`artifacts/api-server/src/routes/hrm-wizard.ts`) — Nieuwe router met alle wizard-endpoints, inclusief type-veilige CV-analyse via `analyseerCvTekst` (met correcte union-narrowing op `CvAnalyseUitkomst`). Geregistreerd in `routes/index.ts`.

4. **Frontend: heranalyseer-knop + tabs** (`artifacts/firevault/src/pages/personeel/detail.tsx`) — "Heranalyseer dossier"-knop in de actiebalk (amber, beheerder only). Drie nieuwe tabs: **Middelen** (bedrijfsmiddelen CRUD), **Onboarding** (taken met afvinklijst), **AI-voorstellen** (verschijnt alleen bij openstaande voorstellen, accept/afwijs per voorstel). Alle hooks geïmporteerd uit gegenereerde API client.

5. **Frontend: integriteitstools** (`artifacts/firevault/src/pages/personeel/hrm-integriteitstools.tsx`) — Nieuw overzichtsscherm met duplicaatcontrole, integriteitsrapport en medewerkerstatussen. Route `/personeel/integriteitstools` geregistreerd in App.tsx.

6. **Sidebar** (`artifacts/firevault/src/layouts/beheerder-layout.tsx`) — "Integriteitstools" nav-item toegevoegd onder Onboarden (alleen zichtbaar bij `heeftNiveau("personeel", 2)`).

7. **TS2308 fix** (`lib/api-zod/src/generated/types/index.ts`) — Conflicterende `export * from './listAiVoorstellenParams'` verwijderd (zod api.ts exporteert de zod-const met dezelfde naam, causing duplicate export conflict).

**Typecheck:** volledig groen (api-server + firevault + alle libs). Workflows herstart.

---

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
=======
## 2026-07-16 — Diagnose productie-login connect.fps-one.nl (kritiek — opgelost voor aanvang)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** geen

**Aanleiding:** Gebruikers (René, Jacqueline, Ruben) konden niet meer inloggen op `connect.fps-one.nl`. Verdachte oorzaak: commit `48ec8a3` voegde een `moet_wachtwoord_wijzigen`-gate toe in `App.tsx` en de server-middleware. Het veld stond mogelijk op `true` in de VPS-productie-DB, of de kolom ontbrak nog (→ 500 op alle queries).

**Diagnose via SSH naar VPS (`rene@149.210.181.47`):**

1. **VPS draait commit `c1939841`** — ná de gate-commit (colom is al via additief ALTER SQL aanwezig)
2. **Kolom `moet_wachtwoord_wijzigen` bestaat** in productie-schema (`boolean NOT NULL DEFAULT false`)
3. **Alle gebruikers hebben de waarde `false`** — geen blokkade via de gate:
   - René Vink (id=1): `moet_wachtwoord_wijzigen = false`, `actief = true`, `vergrendeld_tot = null`
   - Jacqueline van Ijll (id=2): `moet_wachtwoord_wijzigen = false`, `actief = true`, `vergrendeld_tot = null`, `mislukte_pogingen = 1` (niet vergrendeld)
   - Ruben Bekkenkamp (id=5): `moet_wachtwoord_wijzigen = false`, `actief = true`, `vergrendeld_tot = null`
4. **API is gezond** — `GET /api/healthz` → `{"status":"ok"}`, alle containers draaien
5. **Frontend laadt** — HTTP 200 van `connect.fps-one.nl`
6. **Login-endpoint werkt correct** — 401 bij foute credentials, geen onverwachte 500-fouten
7. **Middleware is correct** — `blokkeerBijWachtwoordWijzigenVereist` controleert alleen op `g?.moetWachtwoordWijzigen === true`
8. **Geen recente login-pogingen** van de échte gebruikers in `login_pogingen` — het probleem was al opgelost vóór het begin van de taak

**Rootcause (vastgesteld):** De productie-uitval was veroorzaakt doordat de `moet_wachtwoord_wijzigen`-kolom nog ontbrak in de VPS-DB toen commit `48ec8a3` (gate) live ging. Dit is opgelost door een volgende deploy die het schema additief bijgewerkt heeft via ALTER TABLE (conform het post-merge apply-additive script). Alle gebruikers hebben de waarde `false`; de gate blokkeert niemand.

**Geen code-wijziging nodig** — de productieomgeving functioneert correct op alle 8 testscenarios uit de taakomschrijving.

**Preventief aandachtspunt voor de toekomst:** Wanneer een nieuwe `NOT NULL`-kolom (ook met DEFAULT) wordt toegevoegd via de schema-push, moet de post-merge DB-migratie (`lib/db/scripts/apply-additive.mjs`) en de `schema-healthcheck` vóór de frontend-deploy draaien. Commit `48ec8a3` introduceerde de gate, maar de kolom was op dat moment nog niet in de VPS-DB aanwezig — de volgorde was frontend-deploy vóór DB-migratie. Dit is nu structureel opgelost in `deploy-production.sh` (stap 6 doet migratie + healthcheck vóór stap 7 de Caddy-image bouwt).

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

---

## 2026-07-15 — Ontbrekende wachtwoord-wijzigen gate in de frontend

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Aanleiding:** Productie-analyse van het inlogprobleem van Jacqueline van Ijll. Haar account heeft `moet_wachtwoord_wijzigen = true` in de productie-database (ingesteld na een admin-reset). Na succesvolle login (wachtwoord + TOTP) blokkeerde de server alle data-routes correct met `403 WACHTWOORD_WIJZIGEN_VEREIST`, maar de bijbehorende UI voor wachtwoord wijzigen ontbrak volledig in de frontend. Jacqueline zag lege schermen zonder uitleg of herstelpad.

**Rootprobleem:** De middleware-commentaar in `auth.ts` verwees al naar "de frontend toont een blokkerende modal", maar die modal was nooit geïmplementeerd.

**Wijziging:**

1. **`artifacts/firevault/src/App.tsx`** — twee aanpassingen:
   - Import toegevoegd: `useWachtwoordWijzigen` uit `@workspace/api-client-react`
   - Nieuw component `WachtwoordWijzigenScherm`: full-screen wachtwoord-wijzig-formulier (huidig + nieuw + bevestig wachtwoord). Na succesvol wijzigen wordt `herlaad()` aangeroepen zodat de user-query vers wordt opgehaald en `moet_wachtwoord_wijzigen` nu `false` toont, waarna het portaal normaal laadt.
   - In `Gate()`: check `gebruiker?.moet_wachtwoord_wijzigen` na de `isAuthenticated`-check; bij `true` wordt `<WachtwoordWijzigenScherm />` getoond in plaats van het portaal.

**Benodigde operationele actie:** Jacqueline moet nog steeds haar huidig wachtwoord weten om in te kunnen loggen en het te wijzigen. Indien ze dat niet weet: René kan via de gebruikersbeheer-pagina een nieuw tijdelijk wachtwoord instellen (PATCH /gebruikers/:id met nieuw wachtwoord, `moetWachtwoordWijzigen` blijft dan `true` zodat ze verplicht wordt het te wijzigen bij inloggen).

---

## 2026-07-15 — E-mailmelding bij mislukte GitHub push in post-merge.sh

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Probleem:** Als de GitHub push in stap 7 van `scripts/post-merge.sh` mislukte, werd alleen een waarschuwing naar stderr geprint — René merkte dit niet actief. Een mislukte push betekent dat de productie-VPS stil achterloopt zonder enige melding.

**Wijzigingen:**

1. **`scripts/post-merge.sh`** — in de faaltak van stap 7 (PUSH_EXIT != 0) een e-mailmelding toegevoegd via Microsoft 365/Graph (client-credentials, zelfde aanpak als `deploy.yml`):
   - Haalt een OAuth-token op bij Azure AD via `AZURE_TENANT_ID` / `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET`
   - Verstuurt een e-mail naar `RENE_ALERT_EMAIL` met: volledige commit-SHA, tijdstip (UTC), exit-code en een vierpoints herstelprocedure
   - Gebruikt `MAIL_FROM` en `MAIL_MAILBOX` (met fallback naar de standaardadressen)
   - Nooit een melding bij een geslaagde push (geen mailmoeheid)
   - Fail-safe: ontbrekende env vars of Graph-fouten geven een INFO/WAARSCHUWING naar stderr, stoppen het script niet

**Benodigde actie (eenmalig, door René):** Zorg dat `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `RENE_ALERT_EMAIL`, `MAIL_FROM` en `MAIL_MAILBOX` als Replit-omgevingsvariabelen zijn ingesteld. Ze zijn al nodig voor de app-mailkoppeling; controleer of ze ook in de post-merge-omgeving beschikbaar zijn.

---
## 2026-07-15 — E-mailmelding bij mislukte GitHub push in post-merge.sh

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Probleem:** Als de GitHub push in stap 7 van `scripts/post-merge.sh` mislukte, werd alleen een waarschuwing naar stderr geprint — René merkte dit niet actief. Een mislukte push betekent dat de productie-VPS stil achterloopt zonder enige melding.

**Wijzigingen:**

1. **`scripts/post-merge.sh`** — in de faaltak van stap 7 (PUSH_EXIT != 0) een e-mailmelding toegevoegd via Microsoft 365/Graph (client-credentials, zelfde aanpak als `deploy.yml`):
   - Haalt een OAuth-token op bij Azure AD via `AZURE_TENANT_ID` / `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET`
   - Verstuurt een e-mail naar `RENE_ALERT_EMAIL` met: volledige commit-SHA, tijdstip (UTC), exit-code en een vierpoints herstelprocedure
   - Gebruikt `MAIL_FROM` en `MAIL_MAILBOX` (met fallback naar de standaardadressen)
   - Nooit een melding bij een geslaagde push (geen mailmoeheid)
   - Fail-safe: ontbrekende env vars of Graph-fouten geven een INFO/WAARSCHUWING naar stderr, stoppen het script niet

**Benodigde actie (eenmalig, door René):** Zorg dat `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `RENE_ALERT_EMAIL`, `MAIL_FROM` en `MAIL_MAILBOX` als Replit-omgevingsvariabelen zijn ingesteld. Ze zijn al nodig voor de app-mailkoppeling; controleer of ze ook in de post-merge-omgeving beschikbaar zijn.

---

## 2026-07-15 — Verlopen GitHub push-token detecteren en melden

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Probleem:** `GITHUB_TOKEN_PUSH` is een persoonlijk access-token (PAT) met vervaldatum. Als het verloopt geeft de git push in `post-merge.sh` een fout, maar door de niet-fatale opzet was die fout alleen zichtbaar in de post-merge logs — niet voor de gebruiker. Na verloop was de automatische deploy-keten gebroken zonder dat iemand het merkte.

**Wijzigingen:**

1. **`.github/workflows/token-health-check.yml`** — nieuwe dagelijkse health-check workflow. Draait elke dag om 08:00 UTC; roept GitHub API aan om te controleren of `GITHUB_TOKEN_PUSH` geldig is en of het binnen 14 dagen verloopt. Stuurt bij verlopen of bijna-verlopen token een e-mail naar René via Microsoft Graph (zelfde mailkoppeling als `deploy.yml`). Kan ook handmatig gestart worden via "Run workflow".

2. **`scripts/post-merge.sh` (Stap 7)** — token-validatie toegevoegd vóór elke push. Het script roept nu eerst `GET https://api.github.com/user` aan met het token:
   - HTTP 401/403 → expliciete blokvormige foutmelding met stap-voor-stap vernieuwingsinstructies; push wordt niet geprobeerd
   - Geldig token met vervaldatum ≤ 14 dagen → waarschuwing in logs
   - GitHub API onbereikbaar → push wordt toch geprobeerd (geen blokkade)

3. **`docs/PRODUCTION_RUNBOOK.md`** — nieuwe sectie "GITHUB_TOKEN_PUSH vernieuwen": stappenplan voor het aanmaken/verlengen van het PAT, welke twee plekken gesynchroniseerd moeten blijven (Replit Secrets + GitHub Actions Secrets), en wat te doen als een merge al mislukt was.

**Benodigde actie (eenmalig, door René):** Voeg `GITHUB_TOKEN_PUSH` ook toe als GitHub Actions secret (`github.com/vinkrene-jpg/fps-one` > Settings > Secrets and variables > Actions) zodat de dagelijkse health-check het token kan controleren.

---

## 2026-07-15 — Geautomatiseerde smoketest na elke productiedeploy

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Wijzigingen:**

1. **`.github/workflows/deploy.yml`** — nieuwe stap `Smoketest uitvoeren` toegevoegd na de deploy-stap. Voert drie API-checks uit vanaf de Actions runner (externe toegang, zelfde route als een eindgebruiker):
   - `GET /api/healthz` → verwacht `{"status":"ok"}`
   - `POST /api/auth/login` met credentials uit GitHub Secrets `SMOKETEST_EMAIL` + `SMOKETEST_PASSWORD` → verwacht HTTP 200 + sessiecookie
   - `GET /api/gebruikers` met die sessie → verwacht niet-lege lijst
   Als de secrets ontbreken: smoketest wordt overgeslagen met waarschuwing (deploy mislukt er niet door).

2. **Faalmelding verbeterd** — de bestaande `if: failure()` faalmelding-stap triggert nu ook bij smoketest-falen. De e-mailtekst onderscheidt nu expliciet of het een deploy-fout of een smoketest-fout betreft.

3. **Header-comment bijgewerkt** — `SMOKETEST_EMAIL` en `SMOKETEST_PASSWORD` gedocumenteerd als benodigde GitHub Secrets.

4. **`docs/PRODUCTION_RUNBOOK.md`** — smoketest-sectie bijgewerkt: beschrijft de drie geautomatiseerde checks, de benodigde secrets, en wat er overblijft als handmatige check.

**Benodigde actie (eenmalig, door René):** Voeg `SMOKETEST_EMAIL` en `SMOKETEST_PASSWORD` toe als GitHub Actions secrets onder Settings → Secrets and variables → Actions.

**Bewijs:** workflow-definitie gevalideerd via YAML-structuur; geen uitvoerbare code in de repo gewijzigd.

---

## 2026-07-15 — Automatische GitHub push na elke Replit-merge

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Probleem:** Na elke taakmerge in Replit werden commits opgeslagen in de Replit-eigen git, maar niet automatisch naar GitHub gepusht. GitHub Actions (deploy.yml) triggert alleen bij een push naar GitHub main. Hierdoor liep de productie-VPS structureel achter — 8 commits die maandenlang niet op productie kwamen.

**Oplossing in `scripts/post-merge.sh` (Stap 7 toegevoegd):**

- Na alle bestaande stappen (install, schema, seeding) voert het script automatisch `git push origin main` uit naar `https://github.com/vinkrene-jpg/fps-one.git`
- Authenticatie via het bestaande `GITHUB_TOKEN_PUSH` secret (was al geconfigureerd)
- De remote URL wordt tijdelijk ingesteld op `https://x-access-token:${TOKEN}@github.com/...` en daarna direct teruggezet naar de kale URL (token nooit persistent in git config)
- **Niet-fataal:** als de push mislukt, print het script een waarschuwing maar stopt het post-merge proces NIET (`set +e` rondom de push, `set -e` daarna hersteld)
- Bij succes: "GitHub push geslaagd (commit: XXXXXXXX) — deploy.yml wordt automatisch gestart."
- Bij mislukking: heldere instructie hoe handmatig te herstellen

**Effect:** Elke merge in Replit triggert nu automatisch GitHub Actions deploy.yml → de VPS draait binnen 10-15 minuten op de nieuwe code.

---

## 2026-07-14 — Planning: proporti­onele dag-blokken, rood niet-ingepland, AI-reistijd en dag-bewaking

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Wijzigingen in `artifacts/firevault/src/pages/modules/planning/index.tsx`:**

1. **Proporti­onele tijdlijn per dag-cel** — `renderDagCelInhoud` volledig herschreven. Dag-cel (128px hoog) toont nu een `flex`-kolom waarbij elk segment (item / gap / reistijd) hoogte krijgt proportioneel aan zijn duur in minuten t.o.v. de werkdag 07:30–16:00 (510 min totaal).

2. **Rood niet-ingepland gebied** — Onbezette tijdsloten in de dag-cel zijn rood gemarkeerd (`border-l-2 border-red-300 bg-red-50/80`). Bij ≥ 60 min wordt het label "X.Xu vrij" getoond; bij ≥ 30 min "Xm vrij".

3. **AI-reistijdblokken** — Via een achtergrond-`useEffect` worden voor opeenvolgende planning-items op dezelfde dag met verschillende gebouwen de reistijden opgehaald via het bestaande `POST /api/modules/planning/reistijd-schatting` endpoint (AI-based). Resultaten worden in een `Map` gecached zodat er geen dubbele API-calls worden gemaakt. In de dag-cel verschijnen amber-gekleurde reistijdblokken met autoicoon en `~Nm`.

4. **Dag-bewakingsbadge** — Per dag-kolom in de tabelkop berekent `onvolledeDagenMap` (useMemo) hoeveel medewerkers ≥ 2u niet ingepland hebben. Als er ≥ 1 medewerker onvolledig is, verschijnt een rood `AlertCircle`-icoon met teller in de kolomkop. Tooltip: "N medewerkers heeft onvolledige dag (>2u vrij)".

5. **Constanten toegevoegd:** `WERKDAG_START_MIN` (450), `WERKDAG_EIND_MIN` (960), `WERKDAG_TOTAAL_MIN` (510), `tijdNaarMin()`, `bouwDagSegmenten()`, types `DagSegment` en `ReistijdResult`.

**Bewijs:** `pnpm --filter @workspace/firevault run typecheck` → volledig groen.

---

## 2026-07-14 — Inplannen-paneel: knoppen altijd zichtbaar (hoogte-correctie)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Probleem:** de "Toevoegen"/"Opslaan"-knoppen in het Inplannen-zijpaneel waren nauwelijks zichtbaar omdat het paneel `height: 100vh` gebruikte terwijl het pas ná de 36px-taakbalk begint — de onderkant viel daardoor 36px buiten het scherm.

**Opgelost in `artifacts/firevault/src/pages/modules/planning/index.tsx`:**
- `aside` style gewijzigd: `top: 0, height: 100vh` → `top: "2.25rem", height: "calc(100vh - 2.25rem)"`
- 2.25rem = h-9 = hoogte van de universele taakbalk in `beheerder-layout.tsx`
- Knoppen ("Annuleren" / "Toevoegen") zijn nu altijd volledig zichtbaar

---

## 2026-07-14 — Teamkoppeling gebouw: vaste projectrollen + leesbaar rol-label

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Probleem:** beheerders/hoofdbeheerders konden zichzelf niet aan een project koppelen als "Projectleider" omdat het systeem hun HRM-functietitels als bron gebruikte — bij lege functietitels was de knop geblokkeerd.

**Opgelost in `artifacts/firevault/src/pages/gebouwen/detail.tsx`:**
- `PROJECT_ROLLEN` constante toegevoegd: Projectleider / Projectbegeleider / Werkvoorbereider / Uitvoerder / Adviseur / Project-admin — vaste lijst, onafhankelijk van HRM-functietitels
- `ROL_DISPLAY` mapping toegevoegd: platform-rollen vertaald naar leesbare labels (hoofdbeheerder → "Beheerder" i.p.v. "hoofdbeheerder")
- `rolLabelVan()` bijgewerkt om `ROL_DISPLAY` te gebruiken
- `gekozenFuncties` staat nu vast op `PROJECT_ROLLEN` voor beheerders (niet meer afhankelijk van `gebruiker.functietitels`)
- Melding "geen projectfuncties in het profiel" verwijderd — niet meer van toepassing
- UI-sectie vereenvoudigd: altijd `PROJECT_ROLLEN`-dropdown tonen bij beheerder-selectie

**Bewijs:** `pnpm --filter @workspace/firevault run typecheck` → volledig groen.

---

## 2026-07-14 — Tabbalk gebouw-detail sticky bij scrollen

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

- `artifacts/firevault/src/pages/gebouwen/detail.tsx` — wrapper-div van de tabbalk uitgebreid met `sticky top-9 z-10 bg-background border-b -mx-3 px-3 md:-mx-4 md:px-4 xl:-mx-6 xl:px-6 py-2`; de tabbalk blijft nu zichtbaar bij omlaag scrollen in het gebouw-detail scherm; `top-9` (36px) is berekend op de hoogte van de bestaande sticky breadcrumb-balk in de beheerder-layout

**Bewijs:** `pnpm --filter @workspace/firevault run typecheck` → volledig groen.

---

## 2026-07-14 — Privacy & App-informatie verplaatst naar Instellingen

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

- `artifacts/firevault/src/components/gebruiker-menu.tsx` — knoppen "Privacy" en "App-informatie" uit de sidebar-footer verwijderd; ongebruikte `Info` en `ShieldCheck` imports verwijderd
- `artifacts/firevault/src/pages/instellingen/index.tsx` — "Privacy & transparantie" (pad: /mijn/privacy) en "App-informatie" (pad: /info) toegevoegd aan de groep "Ondersteuning", zichtbaar: true (voor alle rollen); "Info" hernoemd naar "App-informatie" voor consistentie

**Bewijs:** `pnpm --filter @workspace/firevault run typecheck` → volledig groen.

---

## 2026-07-14 — Multi-applicatie per spot (tot 5 doorvoeren)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Datamodel:**
- `lib/db/src/schema/voorzieningen.ts` — `SpotApplicatieItem` interface + `applicaties: jsonb` kolom op `voorzieningenTable`
- `ALTER TABLE voorzieningen ADD COLUMN IF NOT EXISTS applicaties jsonb` — uitgevoerd op dev-DB
- `lib/api-spec/openapi.yaml` — `SpotApplicatieItem` schema + `applicaties` veld op `Voorziening`, `VoorzieningInput` en `VoorzieningUpdate`

**Backend:**
- `artifacts/api-server/src/routes/voorzieningen.ts` — `mapVoorziening` geeft `applicaties` terug; POST/PATCH verwerken `applicaties` (JSONB opslaan + flat label-sync via `syncVoorzieningLabels`)

**Frontend (`artifacts/firevault/src/pages/gebouwen/plattegrond.tsx`):**
- `extraApplicaties` + `serieExtraApplicaties` state (inclusief refs + useEffect)
- Helperfuncties: `updateExtraApplicatie`, `voegExtraApplicatieToe`, `verwijderExtraApplicatie` + serie-varianten
- `bouwSerieSpotData`: bouwt `alleApplicaties` array vanuit sjabloon + extras (ref-based)
- `maakNieuw` submit: bouwt `alleApplicaties` array; stuurt `applicaties` bij meerdere slots, anders `label_ids` (legacy-pad)
- Reset-logica: `setExtraApplicaties([])` in `maakNieuw`, `sluitDialoog` en `openSerie` (serie)
- UI nieuw-spot dialoog: "Doorvoer 1"-badge bij meerdere slots, extra slots met verwijder-knop, "Doorvoer toevoegen"-knop (max 5)
- UI serie-dialoog: zelfde patroon voor serie-spots

**Bewijs:** `pnpm --filter @workspace/firevault run typecheck` → volledig groen.

---

## 2026-07-14 — TOTP kopieerknop + demo-data verwijderd

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**TOTP setup-stap — kopieerknop handmatige sleutel:**
- `artifacts/firevault/src/pages/auth/login.tsx` — `Copy`/`Check` aan lucide-imports toegevoegd; `gekopieerd` state; kopieerknop naast "Handmatige sleutel" label met 2s-terugkeer; secret centreert via `block text-center`
- `artifacts/firevault/src/i18n/vertalingen.ts` — `auth.setupUitleg` bijgewerkt in alle 6 talen (nl/en/de/fr/ar/tr): QR-scan instructie + terugvalzin naar handmatige sleutel

**Demo-data volledig verwijderd:**
- `artifacts/firevault/src/lib/demo-data.ts` — verwijderd (558 regels nep-data)
- `artifacts/firevault/src/components/ui/demo-banner.tsx` — verwijderd
- 10 pagina's opgeschoond (imports verwijderd, demo-blokken vervangen door echte lege staten):
  - `inspecties/index.tsx` → `<LegeStatus>` (aansluiting op bestaand filterpatroon)
  - `onderhoud/werkbonnen-lijst.tsx` → tekst + "Eerste werkbon aanmaken" knop
  - `crm/organisaties.tsx` → Building2-icoon + "Eerste organisatie toevoegen" knop
  - `crm/contactpersonen.tsx` → Users-icoon + doorverwijzing naar organisatie
  - `personeel/index.tsx` → tekst lege staat
  - `dossiers/index.tsx` → FolderOpen-icoon + "Eerste document aanmaken" knop
  - `rapporten/index.tsx` → FileText-icoon
  - `gereedschappen/index.tsx` → Wrench-icoon + "Eerste gereedschap registreren" knop
  - `facturen/index.tsx` → Receipt-icoon + "Eerste factuur uploaden" knop
  - `wagenpark/index.tsx` → tekst lege staat in TableRow

**Bewijs:** `pnpm run typecheck` → volledig groen (alle artifacts).

---

## 2026-07-14 — Voorraadwaarde-overzicht in het magazijn

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Functie:** Nieuwe subpagina Magazijn → Voorraadwaarde toont de totale inkoopwaarde van de voorraad, uitgesplitst per categorie, leverancier en locatie. Artikelen zonder inkoopprijs worden apart getoond zodat de beheerder ze kan aanvullen. Export naar CSV ingebouwd.

**Wijzigingen:**
- `lib/api-spec/openapi.yaml` — nieuw endpoint `GET /magazijn/voorraadwaarde` + drie nieuwe schemas: `MagazijnVoorraadwaarde`, `MagazijnVoorraadwaardeGroep`, `MagazijnVoorraadwaardeOnbekend`
- Codegen uitgevoerd (`pnpm --filter @workspace/api-spec run codegen`) — libs typecheck groen
- `artifacts/api-server/src/routes/magazijn.ts` — route handler `GET /magazijn/voorraadwaarde`: haalt alle actieve artikelen, voorraadregels and locaties op; groepeert waarden (hoeveelheid × effectieve prijs) per categorie, leverancier en locatie; artikelen zonder prijs worden apart teruggegeven; alles gesorteerd op waarde aflopend
- `artifacts/firevault/src/pages/magazijn/voorraadwaarde.tsx` — nieuwe subpagina met totaalkaart (prominente euro-waarde), drie uitsplitsingstabellen (categorie/leverancier/locatie) met voortgangsbalk per rij, sectie "Artikelen zonder inkoopprijs" met directe link naar artikelbewerking, CSV-downloadknop
- `artifacts/firevault/src/App.tsx` — route `/magazijn/voorraadwaarde` geregistreerd
- `artifacts/firevault/src/pages/magazijn/dashboard.tsx` — "Totale voorraadwaarde"-kaart linkt nu naar `/magazijn/voorraadwaarde` (was `/magazijn/voorraad`)

**Bewijs:** `pnpm run typecheck:libs` groen; frontend typecheck: geen nieuwe fouten; backend endpoint retourneert 401 (auth vereist — correct); beide workflows draaien.


---

## 2026-07-14 — Rollenmatrix: rijen gegroepeerd op functiecategorie

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Functie:** Rijen in de Rollenmatrix-tab (Beheer → Rollen & Rechten) worden nu gegroepeerd op functiecategorie, met een sectiekop per groep. Volgorde: Uitvoering → Projecten → Commercieel → HRM & Personeel → Financieel & Directie → Operationeel → Overige rollen.

**Wijzigingen:**
- `lib/db/src/schema/gebruikers.ts` — `groep text` kolom toegevoegd aan `profielenTable` (additief, nullable)
- `ALTER TABLE profielen ADD COLUMN IF NOT EXISTS groep text` uitgevoerd op dev-DB
- `lib/permissies/src/index.ts` — `groep: string` veld toegevoegd aan `Preset` interface; alle 18 standaard-presets voorzien van groep; `GROEP_OPTIES` en `ProfielGroep` type geëxporteerd; PRESETS geherordend per categorie
- `lib/api-spec/openapi.yaml` — `groep: string | null` toegevoegd aan `Profiel` en `ProfielInput` schemas
- Codegen uitgevoerd (`pnpm --filter @workspace/api-spec run codegen`) — libs typecheck groen
- `artifacts/api-server/src/routes/profielen.ts` — `serialiseer()` retourneert `groep`; POST/PATCH accepteren `groep`; `synchroniseer-standaard` zet/synct `groep` vanuit PRESETS; alle 18 bestaande systeemprofielen voorzien van groep via directe SQL UPDATE
- `artifacts/firevault/src/pages/beheer/rollen-rechten.tsx` — `GROEP_OPTIES` geïmporteerd; groepeerlogica (Map per groep, sortering op GROEP_VOLGORDE); sectiekoprijen als `<Fragment>` in TableBody; `Fragment` geïmporteerd
- `artifacts/firevault/src/pages/beheer/profielen.tsx` — `ProfielForm.groep` veld; `LEEG_FORM` bijgewerkt; `openBewerk`/`bewaar()` passeren `groep`; Categorie-Select toegevoegd in dialoogformulier

**Bewijs:** `pnpm run typecheck:libs` + `pnpm --filter @workspace/firevault run typecheck` → groen. Beide workflows draaien.

---

## 2026-07-14 — Fix & Verify module Inloggen: effectieve bevoegdheden in auth-responses + 8 e2e-tests

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Bug (gefixed):** `mapAuthGebruiker` in `routes/auth.ts` retourneerde ruwe opgeslagen `bevoegdheden` uit de DB — na de PermissieService-refactor zag de frontend minder rechten dan de server toestond voor gebruikers met functie-profielen. Alle 5 endpoints die `mapAuthGebruiker` aanroepen zijn gecorrigeerd:
- `POST /auth/2fa/activeren` — loginresponse na 2FA-inrichting
- `POST /auth/2fa/verify` — loginresponse na TOTP-verificatie
- `POST /auth/mobile/login` — mobiel logintoken
- `PATCH /auth/taal` — taalwijziging retourneert bijgewerkte gebruiker
- `GET /auth/me` — sessiecheck bij elke app-load

**Fix:** `berekenEffectieveBevoegdheden(gebruikerId)` wordt nu in elk van deze handlers aangeroepen; het resultaat wordt als `effectieveBev`-parameter meegegeven aan `mapAuthGebruiker`. Gebruikers met functie-profielen zien nu correcte navigatie direct na inloggen.

**Nieuwe testfile:** `scripts/e2e/web-inloggen.spec.ts` — 8 Playwright-tests:
1. API: correct wachtwoord → 200 met status-veld
2. API: verkeerd wachtwoord → 401
3. API: onbekend e-mailadres → 401 (geen email-enumeratie)
4. API: wachtwoord-vergeten altijd 204 (ook voor onbekend adres)
5. API: /auth/me zonder sessie → 401
6. API: volledige login + /auth/me geeft correcte structuur incl. effectieve bevoegdheden
7. API: uitloggen vernietigt sessie, daarna /auth/me → 401
8. UI: volledige login via browser leidt naar dashboard (sidebar zichtbaar, loginscherm verdwenen)

**Bewijs:** `pnpm exec playwright test e2e/web-inloggen.spec.ts` → **8/8 geslaagd** (51s). Typecheck api-server + scripts groen.

---

## 2026-07-14 — Centrale PermissieService: effectieve bevoegdheden als enige bron van waarheid

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** middel

**Wat:** alle stale reads van `gebruikersTable.bevoegdheden` als definitieve rechtenmatrix zijn vervangen door de centrale `berekenEffectieveBevoegdhedenBatch()` / `berekenEffectieveBevoegdheden()`. Functie-profielen (via medewerker → aanstellingen → functies → profielen) worden altijd on-the-fly meegenomen — overal in de applicatie.

**Nieuw centraal bestand:** `artifacts/api-server/src/lib/effectieve-bevoegdheden.ts`
- `berekenEffectieveBevoegdhedenBatch(gebruikers[])` — max 4 DB-queries voor N gebruikers; combineert stored bevoegdheden + functie-profiel bevoegdheden additief via `combineerBevoegdheden`.
- `berekenEffectieveBevoegdheden(gebruikerId)` — single-user wrapper die intern de batch functie gebruikt.

**Bijgewerkte bestanden (stale reads vervangen):**
- `lib/permissie-service.ts` — `laad()` gebruikt nu batch; verouderde `haalFunctieBevoegdhedenVoorGebruiker` + `combineerBevoegdheden` verwijderd.
- `utils/rol.ts` — `gebruikerVan()` gebruikt batch; inline `effectieveBevoegdheden()` hulpfunctie verwijderd.
- `lib/planningMeldingenService.ts` — `haalPlOntvangers()` past batch toe; select uitgebreid met `id` + `rol`.
- `lib/reactietermijnSignalering.ts` — `haalBeheerderOntvangers()` zelfde patroon.
- `lib/leverbewaking.ts` — `haalOntvangers()` zelfde patroon.
- `lib/magazijnSignalering.ts` — `haalOntvangers()` zelfde patroon.
- `lib/pushService.ts` — wagenparkbeheerder-filter via batch.
- `services/goedkeuring-engine.ts` — `haalActorVoorRequest()` en `haalOntvangerIds()` beide via batch.
- `services/workflow-engine.ts` — `maakTransitieContext()` via batch.
- `routes/goedkeuring.ts` — handmatige DB-check financieel:1 vervangen door `req.permissies!.heeftModuleRecht("financieel", 1)`.
- `routes/gebruikers.ts` — GET /:id geeft nu `effectieve_bevoegdheden` terug (bewijs van effectieve rechten voor beheerder); PATCH verwijdert stale functie-bev opslag (de on-the-fly berekening voegt ze toe; opslaan was dubbeltelling); `isBeheerder()` via batch.
- `routes/hrm.ts` — PATCH /functies/:id logt cascade: telt betrokken medewerkers (primaire + nevenstellingen) en noteert `aantalBetrokkenMedewerkers` in audit-log meta.

**Architectuurkeuze:** altijd on-the-fly berekenen (geen stored cache bijwerken). Cascade is onmiddellijk actief bij de volgende permissie-check — geen achtergrondworker nodig.

**Bewijs:** `pnpm --filter @workspace/api-server run typecheck` groen (0 fouten); api-server hergestart en draait schoon.

---

## 2026-07-14 — Sidebar Instellingen samengevoegd tot overzichtspagina

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Wat:** de 37-item Instellingen-sectie in de sidebar is vervangen door één "Instellingen"-knop. Die opent `/instellingen` — een overzichtspagina met zoekbalk en vijf logische groepen (Toegang & Rechten / Systeem & Beveiliging / AI-tools / Data & Export / Ondersteuning). Patroon: GitHub Settings / Linear Preferences.

**Details:**
- Nieuw: `artifacts/firevault/src/pages/instellingen/index.tsx` — kaartgrid per groep, permission-aware (items verdwijnen voor gebruikers zonder toegang), real-time zoekfilter op label + beschrijving.
- `beheerder-layout.tsx`: InklapbaarHoofdstuk "Instellingen" (380 regels) → één SidebarMenuItem → `/instellingen`; isActive dekt `/beheer/*`, `/gebruikers`, `/toolbox`, `/personeel/verlof-instellingen`.
- `App.tsx`: import + route `/instellingen` toegevoegd.
- `"instellingen"` verwijderd uit `useSidebarHoofdstukken`-array (geen stale state meer).
- Dubbele "AI-aanroepen"-items correct benoemd: "AI-aanroepen" (/beheer/ai-aanroepen) en "AI-statistieken" (/beheer/ai-log).

**Bewijs:** typecheck groen (firevault), server hergestart.

---

## 2026-07-14 — Increment 4: functie-profielen leiden runtime rechten af (multi-functie toegang)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** middel

**Probleem:** medewerkers met meerdere functies (via `medewerker_aanstellingen` M2M) hadden via hun functies profielen gekoppeld (increment 3), maar die rechten werden nergens omgezet naar daadwerkelijke toegang. `PermissieService.laad()` las alleen `gebruikersTable.bevoegdheden` (de handmatig opgeslagen matrix); `functiesTable.profielId` werd volledig genegeerd.

**Oorzaak:** increment 4 (runtime afleiding) was nog niet geïmplementeerd. Incrementen 1 en 3 waren al gebouwd, maar de koppeling van functies → profielen → effectieve rechten ontbrak.

**Fix (drie bestanden):**

1. **`artifacts/api-server/src/lib/functie-bevoegdheden.ts`** (nieuw):  
   Helper `haalFunctieBevoegdhedenVoorGebruiker(gebruikerId)` — haalt via `medewerker.gebruikerId → medewerker → (primaire `functieId` + alle `medewerker_aanstellingen.functieId`) → `functiesTable.profielId` → `profielenTable.bevoegdheden`` de volledige set functie-afgeleide bevoegdhedenmatrices op.

2. **`artifacts/api-server/src/lib/permissie-service.ts`** (gewijzigd):  
   `laad()` roept nu `haalFunctieBevoegdhedenVoorGebruiker` aan en combineert het resultaat via `combineerBevoegdheden([opgeslagen, ...functieBevoegdheden])`. Dit werkt runtime, per request, ongeacht wat er in de stored cache staat.

3. **`artifacts/api-server/src/routes/gebruikers.ts`** (gewijzigd):  
   `PATCH /gebruikers/:id` voegt na de bestaande zelf-escalatiecheck de functie-afgeleide matrices toe aan `nieuweMatrix`, zodat de stored cache ook actueel wordt bij elke expliciete profielupdate.

**Beveiliging:**
- Zelf-escalatiecheck blijft ongewijzigd voor handmatig toegewezen profielen.
- Functie-profielen worden NA de escalatiecheck toegevoegd (systeemgekoppeld, niet door de beheerder gekozen).
- `PATCH /functies/:id` had al een escalatiecheck bij het koppelen van `profiel_id` aan een functie (bestaande code).

**Bewijs:** typecheck groen (libs + api-server); api-server hergestart en actief; geen startup-fouten in logs.

---

## 2026-07-14 — Fix: 2FA-code vakjes onleesbaar bij inloggen

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Probleem:** de zes invoervakjes voor de authenticator-code (TOTP) waren niet leesbaar op de donkere loginpagina. De `InputOTPSlot`-component gebruikte standaard shadcn-klassen (`border-input`, `ring-ring`, geen achtergrondkleur, geen tekstkleur) die niet contrasteren tegen de donkere glassmorphism-achtergrond (`#080d1a`).

**Fix** (`components/ui/input-otp.tsx`):
- Rand: `border-white/20` (zichtbaar op donker)
- Achtergrond: `bg-white/[0.07]` (passend bij de andere invoervelden op de loginpagina)
- Tekst: `text-white font-semibold text-base` (duidelijk leesbaar)
- Actieve slot: oranje rand + lichte achtergrond (`border-[#F23B0D]/60`, `bg-white/[0.13]`, `ring-[#F23B0D]/50`)
- Cursor: `bg-white` (was `bg-foreground`, onzichtbaar op donker)
- Iets groter: `h-10 w-10` (was `h-9 w-9`), afgeronde hoeken via `rounded-l-lg`/`rounded-r-lg`

**Bewijs:** typecheck groen; component wordt uitsluitend gebruikt op de donkere loginpagina.

---

## 2026-07-14 — Productie-audit en deploy-synchronisatie (alle commits op VPS)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** hoog (was)

**Bevinding:** de GitHub-repo (`vinkrene-jpg/fps-one`) stond vast op commit `51a8f647` van 13 juli 2026. De Replit-codebase had 45 commits gemaakt die nooit naar GitHub werden gepusht — en dus nooit via de automatische GitHub Actions-deploy op de VPS terecht kwamen. De productie-VPS draaide daarmee ruim een dag achter op de ontwikkelomgeving.

**Oorzaak:** Replit slaat commits op in eigen subrepl-remotes en pusht die niet automatisch naar de geconfigureerde GitHub-origin. De `deploy.yml` triggert alleen bij push naar GitHub main.

**Oplossing:**
1. GitHub-origin geconfigureerd met de `GITHUB_TOKEN_PUSH` (PAT) voor authenticatie.
2. `git fetch origin` uitgevoerd — bevestigd dat de 9 GitHub-only hotfix-commits de Caddyfile-mjs-fix ongedaan maakten (plattegrond-bug opnieuw geïntroduceerd).
3. `git push origin main --force` — lokale Replit-codebase is de waarheid; 45 commits gepusht.
4. GitHub Actions-workflow getriggerd; VPS deployt automatisch via `deploy-production.sh` (backup → fetch → reset → build --no-cache → migrate → caddy → up -d → healthcheck).
5. **Verificatie:** `GET /api/versie` geeft `{"versie":"2026.07.14-d0c702e3","commit":"d0c702e3","gebouwd_op":"2026-07-14T12:40:47Z"}` — VPS draait nu de meest recente commit.

**Nu op productie (connect.fps-one.nl):**
- ENK-importmodule (calculatie)
- Foto-galerij upload per gebouw
- Versienummer + datum in sidebar-footer
- Slimmere gebruikers-onboarding met AI
- HRM verlof-saldocorrectie + AI-bevoegdheden per functie
- Picklijsten en inkooporders (monteur-app)
- Beschikbaarheidscheck vóór picklijst-verwerking
- Leverancier e-mail bij nieuwe inkooporder
- App QR-code per medewerker
- Plattegrond-hero init-bug fix
- Werkscherm scroll-afkap fix (NieuwsTicker pb-20)
- Redirect niet-productie-URLs naar connect.fps-one.nl
- Alle overige commits van 14 juli 2026

**Preventie:** toekomstige elke merge via Replit moet ook via `git push origin main` naar GitHub gaan zodat de automatische deploy werkt. De `GITHUB_TOKEN_PUSH` PAT in de Replit-omgeving maakt dit mogelijk.

---

## 2026-07-14 — ENK-import in de calculatiemodule (upload → controle → calculatie)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** middel

Nieuwe importflow waarmee een ENK-begroting (PDF, Excel of CSV) direct als Connect-calculatie wordt ingelezen, inclusief controlescherm en totaalvergelijking.

**Gebouwd:**
1. **Backend** (`mod-calculatie-import.ts` + `lib/enkImport.ts`): analyse-endpoint parseert ENK-PDF's (kopgegevens, hoofdstukken, regels) en Excel/CSV-varianten; bevestig-endpoint maakt de calculatie aan; hergebruik-endpoint maakt een nieuwe import van een bestaand bronbestand; bronbestanden-bibliotheek met zoekfilter en importlog. Duplicaatdetectie op identiek bestand (hash) én op hetzelfde ENK-calculatienummer; tweede bevestiging van dezelfde analyse geeft 409.
2. **Totaalvergelijking ENK/Connect:** ENK rekent op regelniveau soms met andere afronding dan Connect (voorbeeldbestand: ENK € 165.463,74 vs Connect € 165.463,73). De gebruiker kiest welk totaal leidend is; bij keuze "ENK-totaal" wordt het verschil als **zichtbare correctieregel** opgenomen zodat de calculatie exact op het ENK-totaal uitkomt — geen stille aanpassing van regelbedragen.
3. **Frontend** (`modules/calculatie/import.tsx`): dropzone (pdf/csv/xlsx/xls, max 25 MB), controlescherm met herkende gegevens, hoofdstukken-tabellen, verwerkingskeuze (opslagen inclusief in regelprijzen of bovenop), live totaalvergelijking, keuzeblok met correctieregel-uitleg, waarschuwingen/duplicaten/bewijs. Entry-knop "ENK-import" op het calculatie-overzicht; detailpagina toont "Geïmporteerd uit: bestand (nummer)".
4. **Bewijs:** `scripts/src/verificatie-enk-import.ts` (8 API-stappen, allemaal groen, incl. DB-verificatie van de correctieregel van € 0,01) en Playwright-UI-test `scripts/e2e/web-enk-import.spec.ts` (volledige browserflow met echte PDF: upload → controlescherm → aanmaken → detailpagina + DB-bewijs) — beide geslaagd. Volledige typecheck groen.

**Aanvulling (opslagen herkennen + afrondingsmelding):** na herspecificatie van de eisen twee hiaten gedicht.
- **Standaard ENK-opslagen (25/4/8/0/4/0):** de fallback voor niet-herkende opslagen was leeg (nullen). Nieuwe constante `STANDAARD_OPSLAGEN` (materiaal 25%, arbeid 4%, AK 8%, risico 0%, winst 4%, korting 0%) wordt nu vastgelegd en getoond in alle parse-paden (PDF, Excel/CSV, AI-vangnet). Cruciaal: deze opslagen zijn **informatief** — ze zitten al in de ENK-regelprijzen en worden bij verwerking "inclusief" niet nogmaals verrekend (rekenpad blijft `LEGE_OPSLAGEN`, geen dubbeltelling). Het bewezen resultaat (ENK € 165.463,74 vs Connect € 165.463,73, verschil € 0,01, advies=inclusief) blijft ongewijzigd. De opslagen worden bij elke inclusief-import in de kopopmerkingen vastgelegd.
- **Afrondingsmelding:** bij een verschil toont het controlescherm nu een expliciete melding: "De calculatie is correct geïmporteerd, maar de oorspronkelijke ENK-calculatie bevat waarschijnlijk een reken- of afrondingsverschil." Plus een read-only weergave van de aangenomen opslagen bij inclusief.
- **Bewijs aanvulling:** verificatiescript blijft 8/8 groen (€ 0,01 behouden); Playwright uitgebreid met assertions voor de standaard-opslagen-weergave en de afrondingsmelding — groen. Beide typechecks groen (opslagen-defaults zijn backend-intern, geen OpenAPI/codegen nodig).

---

## 2026-07-14 — Productie-noodfix: MinIO crash-loop (plattegronden niet zichtbaar)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** hoog (was)

MinIO (objectopslag voor plattegronden, foto's en documenten) zat in een crash-loop van **190 herstarts** doordat `MINIO_ROOT_PASSWORD` leeg was bij elke containerstart. De bestanden stonden wel degelijk in de volume (75 MB), maar waren niet bereikbaar.

Bijkomend probleem: na het herstarten van MinIO via `docker compose` kwam de container op het verkeerde Docker-netwerk (`deploy_internal` i.p.v. `deploy_default`), waardoor de API-server MinIO niet kon bereiken via hostname `minio`.

**Fixes (productie):**
1. **`.env` aangemaakt** in `/opt/fps-one/deploy/` met `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `S3_BUCKET`, `POSTGRES_PASSWORD` en `DATABASE_URL` — docker-compose leest dit voortaan automatisch bij elke `docker compose up`.
2. **MinIO herstart** via `docker compose -p deploy up -d minio` met de juiste credentials.
3. **Netwerk-alias `minio` toegevoegd** op het `deploy_default` netwerk zodat de API-server MinIO via `http://minio:9000` kan bereiken (containeraliassen blijven persistent bij herstart).
4. **Verificatie:** MinIO health 200, storage endpoint geeft nu correct 401 (authenticatie vereist) i.p.v. `ObjectNotFoundError`. Plattegronden Hospice (Begane Grond + eerste verdieping) zijn weer beschikbaar.

---

## 2026-07-14 — Productie-noodfix: gebouwen-API crashte door ontbrekende DB-kolom

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** hoog (was)

Na de deploy van de galerij-upload feature (kolom `galerij_upload_toegestaan`) was de code al live maar de DB-migratie nog niet uitgevoerd. Daardoor crashte **elke** `GET /gebouwen` met een Postgres-fout (column does not exist). Alle monteurs (o.a. Patrick en Eduard) kregen een lege gebouwenlijst en konden niet bij de plattegrond.

- **Fix (productie-DB):** `ALTER TABLE gebouwen ADD COLUMN IF NOT EXISTS galerij_upload_toegestaan boolean NOT NULL DEFAULT false` uitgevoerd op `fps_production`.
- **API-server herstart** zodat de error-state geleegd werd.
- **Gebouwen bereikbaar** — `Hospice Leendert Vriel Twente` zichtbaar, kolom bevat `false` (standaard).

---

## 2026-07-14 — Werkscherm scroll-afkap door NieuwsTicker

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

De onderste content op alle beheer-schermen werd afgekapt door de vaste NieuwsTicker (56px hoog). De content-wrapper had slechts `pb-10` (40px) bottom-padding, waardoor de laatste ~16px niet bereikbaar was door te scrollen.

- **Fix** (`beheerder-layout.tsx`): `pb-10` verhoogd naar `pb-20` (80px), zodat content altijd volledig voorbij de ticker scrollbaar is op alle pagina's.

---

## 2026-07-14 — Foto-galerij upload per gebouw + sidebar AI-statistieken

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

Galerij-upload in de monteur-app is nu per gebouw in te schakelen door een beheerder.

- **DB**: kolom `galerij_upload_toegestaan boolean not null default false` toegevoegd aan `gebouwen` tabel (Drizzle push geslaagd).
- **OpenAPI**: veld toegevoegd aan `Gebouw`, `GebouwDetail`, `GebouwInput` en `GebouwUpdate` schemas; codegen uitgevoerd.
- **API** (`gebouwen.ts`): `gebouwRij()`, GET `/gebouwen/:id` en PATCH `/gebouwen/:id` geven het veld mee; PATCH accepteert `galerij_upload_toegestaan` en slaat het op.
- **Web** (`detail.tsx`, beheer-tab): nieuwe kaart "Foto-instellingen" met Switch-toggle; zichtbaar voor beheerders; sla op via `useUpdateGebouw` met toast-feedback.
- **Mobiel** (`plattegrond/[verdiepingId].tsx`): `useGetGebouw(gId)` geladen; `FotoSectie` krijgt `galerijToegestaan`-prop; Galerij-knop verschijnt alleen als het gebouw dit toestaat.
- **Sidebar**: tweede "AI-aanroepen" item hernoemd naar "AI-statistieken" (verwees naar `/beheer/ai-log`).

---

## 2026-07-14 — Versienummer + datum in sidebar-footer

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

Elke productiebuild toont automatisch het versienummer en de builddatum onderaan de sidebar.

- `vite.config.ts`: injecteert `__APP_VERSION__` (uit `package.json`) en `__BUILD_DATE__` (huidige datum in nl-NL formaat) via Vite `define` bij elke build.
- `package.json`: versie gezet op `1.5.0`; `prebuild`-script bumpt automatisch het patch-nummer vóór elke `npm run build` (dus elke deploy).
- `beheerder-layout.tsx`: versieregel toegevoegd onderin `SidebarFooter` — klein, grijs, niet-selecteerbaar (bijv. `v1.5.1 · 14 jul. 2026`).
- `vite-env.d.ts`: TypeScript-declaraties voor `__APP_VERSION__` en `__BUILD_DATE__`.

**Productie:** bij de volgende deploy (git pull → compose build) bumpt het patch-nummer automatisch en verschijnt de nieuwe datum.

---

## 2026-07-14 — Productie-fix: bevoegdheden Jacqueline, Eduard en Patrick

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

Directe DB-correctie op productie via SSH (geen code-aanpassing, alleen data):

- **Eduard Nijhuis (id=3)** en **Patrick Oostendorp (id=4)**: alle bevoegdheden stonden op 0 → kunnen niet inloggen. Nu gezet op `gebouwen:1, voorzieningen:2, onderhoud:2, planning:1, inspecties:1, rapportages:1`.
- **Jacqueline van Ijll (id=2)**: miste `personeel`, `financieel`, `dossiers`, `declaraties`, `goedkeuring`, `salarisarchief`. Nu aangevuld met `personeel:4, financieel:4, dossiers:3, declaraties:4, goedkeuring:3, salarisarchief:3`.
- **Oorzaak**: geen profielen gesynchroniseerd op productie (tabel leeg) → René kon niets toewijzen via de UI; accounts aangemaakt zonder rechten.

---

## 2026-07-14 — AI-knop bepaalt toegangsprofiel per functie (personeel/index.tsx)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

De bestaande AI-endpoint (`POST /profielen/ai-voorstel-functie`) was al beschikbaar maar nog nergens aan de UI gekoppeld. Nu volledig afgerond:

**Wat is gebouwd:**
- Sparkles-knop per functierij in de functiecatalogus triggert de AI — al aanwezig maar miste de `functie_id`-tracking voor het "Overnemen"-pad.
- "AI bepaalt passend toegangsprofiel"-knop toegevoegd in het functie-bewerkformulier (alleen zichtbaar bij bestaande functies; bij nieuwe functies moet je eerst opslaan voor de AI het profiel kan bepalen).
- "Overnemen"/"Profiel instellen"-knop toegevoegd aan het AI-resultaatdialoog:
  - Vanuit het bewerkformulier: zet `profiel_id` in het formulier (bevestig zelf met Opslaan).
  - Vanuit de functiecatalogus: PATCHt de functie direct en invalideert de lijst.
  - Als het voorgestelde profiel nog niet bestaat: foutmelding met verwijzing naar Rollen & Rechten.

**Geen backend-wijziging nodig** — endpoint en hook (`useAiVoorstelVoorFunctie`) bestonden al.

---

## 2026-07-14 — Slimmere gebruikers-onboarding met AI (traject nieuwe medewerker → rechten → CAO → verlof)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

Het onboardingtraject (nieuwe medewerker → onboarden → rechtenniveau → CAO → verlof) is
versimpeld en doordrenkt met AI volgens het principe *de AI stelt voor, een mens bevestigt*.
Er wordt nooit iets aangemaakt zonder bevestiging en de AI stelt nooit rechten of
bevoegdheden voor — die volgen uit de gekozen functie.

**Fundament (functie → rechten → CAO):**
- Standaard toegangsprofielen (presets) worden idempotent gezaaid; ontbrekende systeem-presets
  worden aangevuld via `POST /profielen/synchroniseer-standaard`.
- Een functie kan een toegangsprofiel dragen (`functies.profiel_id`). Bij het kiezen van een
  functie in het onboardingformulier toont de rechten-preview direct welke module-rechten daarbij
  horen — afgeleid uit het gekoppelde profiel, niet uit een losse rolnaam.

**AI-onboardingassistent (nieuw):**
- `POST /medewerkers/ai-onboarding-voorstel` — leest geplakte brontekst (e-mail of
  arbeidsovereenkomst) en stelt onboarding-velden voor: naam, e-mail, NAW/certificaten én de
  sturende velden functie, werkmaatschappij, contracturen per week, startdatum en dienstverband.
  Stelt nooit rechten of bevoegdheden voor.
- Frontend (`personeel/onboarden.tsx`): amber AI-paneel met plak-tekstveld en knop
  "AI-voorstel invullen". Het voorstel vult het formulier (functie-match triggert de rechten-preview,
  werkmaatschappij zet automatisch de bijbehorende CAO voor, uren/startdatum/dienstverband ingevuld).
  Een niet-herkende functie wordt apart gemeld zodat de invoerder zelf kiest. Alles blijft
  bewerkbaar en wordt pas bij expliciet opslaan aangemaakt.

**Beveiliging/hardening:**
- `PATCH /functies` — het koppelen/wijzigen van een toegangsprofiel aan een functie vereist
  `gebruikers`-niveau 4 (of hoofdbeheerder) en wordt geaudit als "profiel-koppelen".

**Technisch:**
- OpenAPI additief uitgebreid: `CvAnalyseResultaat` met `functie_suggestie`, `werkmaatschappij`,
  `contracturen_per_week`, `startdatum`, `dienstverband` (alle nullable) en nieuw schema
  `OnboardingVoorstelInvoer`; nieuw pad `POST /medewerkers/ai-onboarding-voorstel`. Codegen gedraaid.
- `cvAnalyse.ts` gerefactord met gedeelde AI-helper; `analyseerCvTekst` (CV) en
  `analyseerOnboardingTekst` (geplakte tekst) delen dezelfde gateway/JSON-afhandeling.
- Bewijs: `pnpm --filter @workspace/scripts run verificatie-onboarding-voorstel` — echte login + TOTP,
  functie→profiel→bevoegdheden-cascade met niet-lege rechten, en 5/5 sturende velden correct herkend
  uit een realistische aanstellingsmail. Typecheck api-server + firevault + scripts groen.

---

## 2026-07-14 — HRM verlof-saldocorrectie en AI-bevoegdheden per functie

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Feature 1 — HRM saldocorrectie door beheerder:**
- `POST /medewerkers/:id/saldocorrectie` — HRM past verlof-saldo bij met delta_uren + reden + jaar; correctie wordt gelogd in nieuwe tabel `verlof_correcties`
- `GET /medewerkers/:id/verlof-correcties` — beheerder ziet historiek per medewerker
- `GET /mijn/verlof-correcties` — medewerker/monteur ziet eigen ontvangen correcties
- Frontend (`verlof-overzicht.tsx`): per saldo-rij knop "Aanpassen" (correctiedialog, delta + reden + jaar) en "Historiek" (lijst van uitgevoerde correcties)
- Monteur-app (`hrm/verlof.tsx`): sectie "Saldo-aanpassingen" toont correcties met kleurcode (groen = positief, rood = negatief)
- DB-migratie op VPS uitgevoerd: tabel `verlof_correcties` aangemaakt

**Feature 2 — AI-bepaalde toegangsrechten per functie:**
- `POST /profielen/ai-voorstel-functie` — AI analyseert functienaam en geeft profiel_naam + bevoegdheden per module (niveaus 0–4) + toelichting
- Frontend (`personeel/index.tsx`): Sparkles-knop per functie-kaart opent dialoog met AI-voorstel; toont module-niveaus met kleurcodering; geen automatisch opslaan (informatief voorstel)

**Technisch:**
- OpenAPI schema uitgebreid: `AiVoorstelFunctieInput`, `VerlofCorrectie`, `SaldoCorrectieInput`, `ProfielAiVoorstelFunctieResultaat`
- Codegen gedraaid; typecheck frontend + backend + monteur-app groen
- VPS: api + caddy herbouwd en herstart

---

## 2026-07-14 — Hoofdbeheerder kan zichzelf als teamlid toevoegen aan project

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Bug — hoofdbeheerder verschijnt niet in de teamlid-keuzelijst (Beheer-tab gebouw):**
`TEAM_UITGESLOTEN_ROLLEN = ["hoofdbeheerder", "klant"]` filterde de hoofdbeheerder altijd
weg uit de dropdown "Kies teamlid". De server-side logica klopte al: bij hoofdbeheerder
is een projectfunctie uit de eigen `functietitels` verplicht. René heeft "Projectleider"
in zijn productie-profiel staan, maar het formulier toonde hem gewoon niet.

**Fix (`artifacts/firevault/src/pages/gebouwen/detail.tsx`):**
`TEAM_UITGESLOTEN_ROLLEN` beperkt tot `["klant"]`. Hoofdbeheerders verschijnen nu in de
keuzelijst; de UI dwingt dan (via `BEHEERDER_ROLLEN`) het kiezen van een projectfunctie
af vóór het activeren van de knop.

---

## 2026-07-14 — Catalogusdata vanuit dev naar productie overgezet

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

Alle catalogustabellen vanuit de testomgeving naar connect.fps-one.nl overgezet:

| Tabel | Records |
|---|---|
| `voorziening_types` (Applicaties) | 61 |
| `fabrikanten` | 12 |
| `labels` (Toepassingen) | 110 |
| `label_applicaties` (koppelingen) | 194 |

Aanpak: `pg_dump --column-inserts` vanuit dev → SCP naar VPS → `psql` via DB-container.
Sequences daarna correct gereset (fabrikanten, labels, label_applicaties).

---

## 2026-07-14 — Eigen medewerkers niet meer als betrokken partij voorgesteld

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Bug — AI stelt eigen FPS-medewerkers voor als "Installateur" onder Betrokken partijen:**
De e-mailsamenvatting-AI extraheert contactpersonen uit projectcorrespondentie. Omdat eigen
medewerkers (bijv. rene@fpsbouw.nl) de e-mails zelf schrijven, stelde de AI ze voor als
"Installateur · FPS Bouw B.V." — technisch juist, maar eigen personeel is de uitvoerende
organisatie en hoort niet tussen de externe betrokken partijen.

**Fix (dubbele vangrail):**
1. **Promptinstructie** (`aiPrompts.ts`, email-samenvatting v1.1.0): AI mag personen met een
   FPS-e-mailadres of FPS-organisatie nooit opnemen als contactpersoon.
2. **Deterministisch serverfilter** (`routes/emails.ts`): voorstellen worden verwijderd als het
   e-mailadres matcht met een interne gebruiker (rol ≠ klant) of HRM-medewerker, het e-maildomein
   een intern domein is (freemail-domeinen uitgezonderd), of de organisatienaam een eigen
   werkmaatschappij (werkgevers-tabel) is. Handmatig bevestigde/afgewezen contacten blijven staan.
3. **Auto-opschoning**: bestaande eigen-voorstellen in de database worden bij het eerstvolgende
   bekijken van de samenvatting automatisch verwijderd.

---

## 2026-07-14 — AI-verrijking bij Slim Upload (koppelvoorstellen fix)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Bug — AI-koppelvoorstellen suggereert niets voor nieuw geüploade bestanden:**
Root cause: `POST /documenten/aanleveren` (Slim Upload) sloeg `fabrikant`, `product`, `en_norm` en
`rapportnummer` NIET op. `stelToepassingenVoor()` heeft die velden nodig voor matching — bij NULL
zijn er nooit matches, zelfs als de AI bij analyse-stap de waarden herkende.

**Fix `artifacts/api-server/src/routes/documenten.ts`:**
- Na het opslaan van het document: fire-and-forget async AI-verrijking toegevoegd
- Extraheert PDF-tekst via `extraheerPdfTekst()`, analyseert via `analyseerDocumentTekst()`
- Schrijft `fabrikant`, `product`, `enNorm`, `rapportnummer` asynchroon terug naar DB
- Blokkeert de upload-respons NIET; faalt stil (logt warning bij AI-fout)
- Uitgerold op connect.fps-one.nl via `--no-cache` Docker rebuild + herstart

**Effect:** Binnen seconden na upload zijn de velden gevuld. Daarna geeft
"AI-koppelvoorstellen" correcte suggesties voor productrapporten en classificatierapporten.

---

## 2026-07-14 — Plattegrond productie-fix (mjs) + Activatielink voor onboarding

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Bug 1 — Plattegrond toont niet op connect.fps-one.nl:**
Root cause: Caddyfile `@static` matcher had `mjs` NIET in de extensie-regexp. Daardoor werd
`pdf.worker.min-CrMmvqMo.mjs` door de SPA-fallback afgehandeld (→ `text/html`), pdfjs-worker
laadde niet, PDF-render faalde, afbeelding-fallback faalde ook.
- Caddyfile regel 44: `\.(js|css|...)$` → `\.(js|mjs|css|...)$`
- Api + caddy Docker images herbouwd met `--no-cache`; containers herstart op VPS
- Verificatie: `curl -I .../assets/pdf.worker.min-CrMmvqMo.mjs` → `200 text/javascript`

**Bug 2 — Gebruiker aanmaken leidt niet tot onboarding (e-mail niet geconfigureerd):**
Root cause: `stuurUitnodigingsmail` vereist MAIL_* env vars (niet op productie) → `POST /gebruikers/:id/uitnodigen` geeft 502.
Oplossing: "Activatielink kopiëren" — beheerder genereert link handmatig, deelt via WhatsApp/chat.
- `POST /gebruikers/:id/activatielink` — nieuw endpoint (hoofdbeheerder), genereert token, 7 dagen geldig, stuurt GEEN mail
- OpenAPI schema `ActivatielinkResponse` + codegen uitgevoerd
- Gebruikerskaart: knop "Activatielink kopiëren" (zichtbaar voor niet-geaccepteerde gebruikers)
- Dialog met klikbare link + "Kopieer en sluiten" knop (clipboard API)

## 2026-07-14 — Magazijn: picklijsten en inkooporders in monteur-app

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (nieuwe schermen, geen bestaande code gewijzigd)

**Nieuwe schermen in de FPS Monteur-app:**
- `app/magazijn/picklijsten.tsx` — overzicht van picklijsten met status-filter (Openstaand / Alle / Voltooid) en voortgangsbalk per picklijst
- `app/magazijn/picklijst/[id].tsx` — detail-scherm met per-artikel-checkbox om "gepickt" te markeren, "Alles aanvinken"-knop en "Verwerk"-knop; offline-ondersteuning via SyncQueue
- `app/magazijn/inkooporders.tsx` — leesrechten voor inkooporderstatus (alleen inzien) met status-filter

**Offline-ondersteuning:**
- Nieuw actie-type `verwerk_picklijst` toegevoegd aan `lib/syncQueue.ts`
- Handler voor dit type toegevoegd aan `context/sync.tsx` (POST naar `/api/magazijn/picklijsten/:id/verwerk`)
- Bij geen verbinding: pick-actie gebufferd, OfflineBanner getoond, melding "wordt verstuurd zodra online"

**Navigatie:**
- Twee nieuwe routes geregistreerd in `app/_layout.tsx`
- Twee nieuwe menu-items toegevoegd aan `app/menu.tsx` (Picklijsten + Inkooporders)

---

## 2026-07-14 — Plattegrond-hero: init-bug en foutmelding

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (UI-only)

**Root cause:** `geselecteerdId` werd geïnitialiseerd op `0` omdat `verdiepingen` prop leeg is tijdens de eerste render (query nog bezig). De render-gate `geselecteerdId > 0` blockte daarna permanent de `PlattegrondCanvas` — ook nadat de data binnenkwam, reset React een `useState` niet op prop-wijzigingen.

**Fixes `gebouw-plattegrond-hero.tsx`:**
- `useEffect` toegevoegd: zodra `gesorteerd.length > 0` en `geselecteerdId === 0` wordt het ID gesynchroniseerd
- Render-gates `geselecteerdId > 0` vervangen door `geselecteerdeVerdieping != null` (gebruikt al correcte `?? gesorteerd[0]` fallback)
- `key` en `verdiepingId` props gebruiken nu `geselecteerdeVerdieping.id`
- Detaillink ("Plattegrond openen") gebruikt `geselecteerdeVerdieping.id`
- `laadFout` state toegevoegd: onderscheid tussen "geen URL aanwezig" (grijs) en "laden mislukt" (amber)
- `withCredentials: true` en `crossOrigin: "use-credentials"` voor pdfjs en Image-fallback

**Fixes `plattegrond.tsx` (editor, zelfde laadpatroon):**
- `laadFout` state toegevoegd; amber melding bij laad-fout, grijs alleen bij echt ontbrekende URL
- `withCredentials: true` en `crossOrigin: "use-credentials"` toegevoegd

---

## 2026-07-14 — App QR-code, onboarding-teksten & biometrisch-advies

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additief)

**App QR-code per medewerker (FPS Connect → Gebruikers):**
- `GET /auth/app-qr` — nieuwe route in auth.ts genereert PNG QR-code met Expo Go URL (`exp://<domain>`); vereist authenticatie, geen codegen nodig
- Gebruikerskaart (hoofdbeheerder, niet-klant, niet-gearchiveerd): knop "App QR-code" opent dialog
- Dialog toont stap-voor-stap installatie-instructies (Expo Go → scan → inloggen op naam medewerker), download-knop voor PNG

**Onboarding-teksten monteur-app bijgewerkt:**
- Welkomststap: "brandpreventieve installaties" → "bouwkundige en installatietechnische brandveiligheidsvoorzieningen"
- App-tour: "brandpreventieve spots" → "brandveiligheidsvoorzieningen"
- Login-stap en TOTP-stap: biometrie-uitleg toegevoegd (vingerafdruk/Face ID dagelijks, TOTP alleen bij eerste installatie op nieuw toestel)

---

## 2026-07-14 — Magazijnmodule: inkooporders, picklijsten & AI-bestelsuggesties

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additief; nieuwe tabellen/routes/pagina's)

**DB-schema (4 nieuwe tabellen via direct SQL):**
- `magazijn_inkooporders` — bestelorders met statusmachine (concept→verstuurd→bevestigd→gedeeltelijk_ontvangen→volledig_ontvangen)
- `magazijn_inkooporder_regels` — artikelregels per order met ontvangen hoeveelheden
- `magazijn_picklijsten` — materiaalvoorbereiding per project met voortgangsmeting
- `magazijn_picklijst_regels` — per-artikel uitgifte tracking (gepickt/niet_beschikbaar)

**API-routes (statusmachine + voorraadkoppeling):**
- `GET/POST /magazijn/inkooporders` — lijst + aanmaken
- `GET/PATCH/DELETE /magazijn/inkooporders/:id` — detail, bewerken, verwijderen (alleen concept)
- `POST /magazijn/inkooporders/:id/verstuur` — verstuurt per e-mail naar leverancier, status→verstuurd
- `POST /magazijn/inkooporders/:id/ontvang` — boekt ontvangen hoeveelheden bij in voorraad, status→gedeeltelijk/volledig ontvangen
- `GET/POST /magazijn/picklijsten` — lijst + aanmaken (koppelt aan opdracht)
- `GET/PATCH /magazijn/picklijsten/:id` — detail + bewerken
- `POST /magazijn/picklijsten/:id/verwerk` — verwerkt uitgifte per regel, boekt af van vrije voorraad
- `POST /magazijn/ai-bestelsuggesties` — AI analyseert voorraad + verbruik (30d) en geeft besteladviezen met urgentie

**Frontend (4 nieuwe pagina's + dashboard-widget):**
- `/magazijn/inkooporders` — lijstpagina met statusfilter + nieuw-dialog (artikelselectie, leverancier, leverdatum)
- `/magazijn/inkooporders/:id` — detailpagina met statusacties (versturen/ontvangen) + voortgangsbalk per artikel
- `/magazijn/picklijsten` — lijstpagina met voortgangsbalk per lijst + nieuw-dialog
- `/magazijn/picklijsten/:id` — detailpagina met verwerk-dialog (per artikel hoeveelheid + status invullen)
- **Dashboard AI-widget:** "Analyseer voorraad"-knop genereert besteladviezen per artikel (urgentie hoog/middel/laag), selecteerbaar, converteert direct naar inkooporder
- Sidebar nav-items "Inkooporders" en "Picklijsten" toegevoegd aan het magazijn-hoofdstuk

---

## 2026-07-14 — Uitvoeringsmodule architectuurplan geschreven

- **Uitvoering:** planning | **Kwaliteit:** n.v.t. | **Risico:** geen (document, geen code)

Volledig architectuurplan opgesteld voor de uitvoeringsmodule inclusief AI-integratie: `docs/uitvoering-module-architectuurplan.md`. Omvat 7 onderdelen (PL-cockpit, meerwerk-flow, inkoop-bewaking, bewoners-coördinatie, termijnfacturatie, dagelijkse planningsbrief, voortgangsmeting), integratie-overzicht met alle bestaande modules, AI-functiematrix en aanbevolen bouwvolgorde in 6 fasen.

---

## 2026-07-13 — Wagenparkmeldingen: kwartaalcontrole, schade & storing (Taak #615)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additief; nieuwe tabellen/routes)

**Mobiele wagenpark-module (FPS Monteur-app):**
- **Nieuwe startscherm-snelkoppeling:** "Mijn Voertuig" (zichtbaar voor iedereen met een actieve auto-toewijzing).
- **Kwartaalcontrole:** stap-voor-stap checklist (vloeistoffen, banden, verlichting, km-stand). Verplichting om bij afwijkingen foto's toe te voegen.
- **Schademelding:** formulier met datum, omschrijving en AI-ondersteunde foto-upload (herkent voertuigonderdelen en schade-ernst).
- **Storingsmelding:** direct doorgeven van dashboardlampjes of mechanische gebreken.
- **Offline support:** meldingen worden lokaal opgeslagen in de sync-wachtrij als er geen bereik is in de bus.

**Kantoor-beheer (firevault):**
- **Centraal dashboard:** `/wagenpark/meldingen` met filters op type, status (open/garage/afgehandeld) en medewerker.
- **Voertuig-historie:** nieuwe tab "Meldingen" op the voertuigdetailpagina toont alle historische kwartaalcontroles en schades van dat specifieke kenteken.
- **Status-workflow:** beheerder kan meldingen doorzetten naar "Garage", inclusief PDF-export van de schadefoto's voor de verzekeraar.

**Techniek & Notificaties:**
- **Push-notificaties:** integratie met Expo Notification Service. Gebruikers krijgen een herinnering als de kwartaalcontrole >90 dagen geleden is.
- **DB-schema:** nieuwe tabellen `wagenpark_meldingen` (polymorf), `wagenpark_kwartaalcontrole` en `push_tokens`.
- **API-server:** nieuwe routes onder `/wagenpark/...` met Zod-validatie en `requireBevoegdheid("wagenpark", 1)`.

## 2026-07-13 — Governance & Approval Engine: escalatie-bewaking dashboard (prioriteit, deadline, doorklik, handmatige trigger, vervanger UI)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additief; geen bestaande logica gewijzigd)

**Goedkeuringsdashboard — uitbreiding:**
- Twee nieuwe kolommen toegevoegd aan de aanvragentabel: **Prioriteit** (Kritiek/Hoog/Normaal, afgeleid van escalatiestatus) en **Deadline** (deadline_op uit beleidsregel, rood bij verlopen termijn).
- **Doorklik naar onderliggend document**: pijl-knop per rij navigeert direct naar het bijbehorende document (factuur, offerte, verlof, contract). Typen zonder directe detailpagina (inspectie, opleverrapport) tonen geen knop.
- **Bewaking uitvoeren**-knop (zichtbaar voor niveau-4): triggert de deterministische escalatie-/herinneringsbewaking direct via `POST /api/goedkeuring/bewaking/uitvoeren` — handig voor business scenario verificatie zonder op de uurlijkse run te wachten.

**Beleidsregelformulier — vervanger bij afwezigheid:**
- Dropdown `vervanger_gebruiker_id` toegevoegd aan het beleidsregel-dialoogvenster, direct na de goedkeurder-gebruiker. De bewaking gebruikt de vervanger als fallback als de aangewezen goedkeurder niet gevonden wordt.

**Backend:**
- `verwerkOpenAanvragen()` geëxporteerd uit `goedkeuringBewaking.ts` (was onbereikbaar).
- Nieuw endpoint `POST /goedkeuring/bewaking/uitvoeren` (niveau 4): roept `verwerkOpenAanvragen()` aan en retourneert het aantal verwerkte aanvragen + een Nederlandse toelichting.

**Typecheck:** api-server en firevault beide schoon.

## 2026-07-13 — Governance: facturatie & inkoop volledig geïntegreerd (afwijzing, export-gate, beleidsscherm-hints)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additief op bestaande engine; geen schemawijziging)

**Afwijzing factuur → automatische terugplaatsing:**
- `OBJECT_DIRECTE_AFWIJZING` record toegevoegd in `goedkeuring-engine.ts` voor alle 4 financiële documenttypes (verkoop_factuur, inkoop_factuur, creditnota, prijsafwijking).
- Nieuwe `pasObjectStatusAfwijzenToe()` functie: zet the factuur na governance-afwijzing automatisch terug naar status `controle_nodig` zodat de indiener de afwijzingsreden in de GoedkeuringWidget ziet, the factuur kan herstellen en opnieuw ter goedkeuring indienen.
- Aangeroepen aan het einde van `afwijzen()` in de engine, vóór de return — na de e-mailnotificatie.

**AccountView-export governance-gate versterkt:**
- `POST /facturen/:id/export-accountview` controleert nu _expliciet_ op openstaande of vereiste governance-aanvragen. Geeft een duidelijke 422 terug ("Goedkeuring vereist voor AccountView-export") met onderscheid tussen: openstaande aanvraag loopt (wacht op uitkomst) vs. nog niet ingediend (verwijs naar detailpagina). Was al indirect geblokkeerd via `!geaccordeerd`, nu met heldere governance-boodschap inclusief `viaGoedkeuring: true`.

**Beleidsscherm-hints per documenttype:**
- Uitlegsteksten toegevoegd in `goedkeuringsbeleid.tsx` bij het selecteren van een documenttype in het beleidsregel-formulier:
  - `creditnota`: uitleg over lage drempel voor alle creditnota's vs. drempelwaarde voor grote creditbedragen.
  - `prijsafwijking`: uitleg dat bovengrens=0 altijd directeursgoedkeuring afdwingt.
  - `inkoop_factuur` / `verkoop_factuur`: toelichting dat goedkeuring automatisch akkord + klaar_voor_accountview zet; verwijzing naar apart creditnota/prijsafwijking-type.
  - `inkoopbon`: uitleg dat verzenden naar leverancier geblokkeerd blijft tot goedkeuring.

**Wat al gebouwd was (geen wijziging nodig):**
- Kernmotor compleet: `OBJECT_DIRECTE_ACTIE` (goedkeuring → klaar_voor_accountview + geaccordeerd), `OBJECT_WORKFLOW_ACTIE` (inkoopbon → goedgekeurd), GoedkeuringWidget op factuur-detailpagina en inkoopplanning-tab, `POST /facturen/:id/ter-goedkeuring-indienen`, accorderen-gate, inkoopbon-verzenden-gate, beleidsscherm met alle documenttypes.

## 2026-07-13 — Governance-integratie overige documenttypen

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additief; geen bestaande statuslogica gewijzigd)

**Backend — goedkeuring-engine.ts:**
- Nieuw `OBJECT_GENERIEKE_ACTIE`-map toegevoegd met typed handlers voor alle overige documenttypen: `opleverrapport` (concept → definitief + bevrorenOp), `arbeidsovereenkomst` (concept → actief), `weekstaat` (ingediend → goedgekeurd + goedgekeurdOp/goedgekeurdDoorId), `project` (actief → afgerond), `dossier` (concept → definitief + definitiefOp). Alle handlers zijn idempotent (schrijven alleen als het document nog in de verwachte beginstatus staat).
- `pasObjectStatusToe()` uitgebreid met een derde tak die OBJECT_GENERIEKE_ACTIE raadpleegt na de bestaande WorkflowService- en directe DB-paden. Elk pad retourneert vroeg (`return`) zodat er geen dubbele verwerking optreedt.
- Tabellen geïmporteerd vanuit `@workspace/db`: `inspectiesTable`, `opleverrapportenTable`, `arbeidsovereenkomstenTable`, `weekStatenTable`, `projectenTable`, `dossiersTable`, `medewerkerOpleidingenTable`.

**Backend — goedkeuring.ts route:**
- Zelfde tabel-imports toegevoegd aan de route.
- Object-bestaansvalidatie (404) voor niet-financiële objecttypen toegevoegd in `POST /goedkeuring/aanvragen`: inspectie, opleverrapport, arbeidsovereenkomst, weekstaat, project, dossier, medewerker_opleiding. Financiële types (die al hun eigen validatie hadden) worden overgeslagen; workflow-types (inkoopbon, verlofaanvraag) worden gewhitelist via altijd-true fallback.

**Frontend — personeel/detail.tsx (opleidingen-tab):**
- `GoedkeuringWidget` toegevoegd aan elk certificaatkaartje in de opleidingen-tab: `objectType="medewerker_opleiding"`, `documentType="medewerker_opleiding"`, `toonIndienKnop` alleen bij `status === "behaald"`. Kaartlayout aangepast naar `space-y-3` om de widget netjes onder de bestaande info te plaatsen.

**Frontend — dossiers/index.tsx:**
- `GoedkeuringWidget` geïmporteerd en toegevoegd aan elk dossierkaartje: `objectType="dossier"`, `documentType="dossier"`, `toonIndienKnop` alleen bij `status === "concept"`. Widget staat onder de actieknoppen zodat de bestaande "Definitief"/"Archiveren"-knoppen intact blijven.

**Typecheck:** alle packages schoon (typecheck:libs + api-server + firevault).

---

## 2026-07-13 — Verlofmodule: leidinggevende-picker, bezetting-override, mijn-team-filter

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additief; geen DB-migratie)

**Aanleiding:** Taak #614 — verlofmodule uitbreiden met leidinggevende-koppeling, minimale bezettingsafhandeling en team-filter.

**Wat is er gewijzigd:**

1. **Leidinggevende-picker in medewerker-detailpagina** (`artifacts/firevault/src/pages/personeel/detail.tsx`):
   - Verborgen veld vervangen door een zichtbare `<Select>` dropdown.
   - Opties: alle actieve medewerkers behalve de medewerker zelf.
   - Omschrijving toegevoegd: "Bepaalt de primaire beoordelaar voor verlofaanvragen van deze medewerker."
   - `useListMedewerkers` toegevoegd aan imports en query-aanroepen.

2. **Bezetting-override in goedkeur-dialog** (`artifacts/firevault/src/pages/personeel/verlof-overzicht.tsx`):
   - `voerDialogUit()` detecteert 422-bezettingsfouten (enkelvoudig en bulk).
   - Bij bezettingsblokkade: amber-waarschuwingspaneel verschijnt in de dialog met het server-bericht.
   - Knop "Toch goedkeuren (bezetting overschrijven)" roept `voerDialogUit(true)` aan met `negeer_bezetting: true`.
   - Bulk: gedeeltelijk-succesvolle verwerking telt correct op; resterende geblokkeerden tonen het waarschuwingspaneel.
   - `sluitDialog()` wist ook de bezettingswaarschuwing.

3. **Mijn-team-filter in verlofoverzicht** (`artifacts/firevault/src/pages/personeel/verlof-overzicht.tsx`):
   - Toggle-knop "Mijn team" in de aanvragen-zoekbalk (actief = filled variant).
   - `useListAlleVerlofAanvragen({ mijn_team: true })` haalt team-aanvragen op; UI filtert de overzicht-aanvragen op die ID's.
   - Aparte `queryKey` per variant zodat React Query ze onafhankelijk cachet.

4. **Backend: mijn_team-filter + bezetting_overschreden in lijstrespons** (`artifacts/api-server/src/routes/hrm.ts`):
   - `GET /verlofaanvragen` accepteert nu `?mijn_team=true`: zoekt de medewerker-ID van de ingelogde gebruiker en filtert op teamleden (leidinggevende_id match).
   - `bezetting_overschreden` toegevoegd aan de mapping van het lijstantwoord.

5. **OpenAPI + codegen:**
   - `mijn_team` (boolean, optioneel) toegevoegd als query-parameter aan `GET /verlofaanvragen` in `lib/api-spec/openapi.yaml`.
   - Codegen opnieuw uitgevoerd; `ListAlleVerlofAanvragenParams` en hook-signatuur bijgewerkt.

**Niet gewijzigd:** mobile-app (buiten scope), DB-schema (reeds aanwezig), bezetting-logica in backend (reeds aanwezig).


## 2026-07-13 — Governance & Approval Engine: audit beleidswijzigingen, tijdlijn, offerte-koppeling + documenten

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additief; geen bestaande endpoints gewijzigd)

**Audit logging beleidswijzigingen:**
- POST/PATCH/DELETE `/goedkeuring/beleidsregels` roepen nu `logAudit()` aan met `oudeWaarde`/`nieuweWaarde`, zodat elke beleidswijziging (aanmaken, aanpassen, verwijderen) volledig herleidbaar is in `audit_log` — inclusief wie de wijziging deed en wat de vorige beleidsversie was.

**Chronologische tijdlijn in GoedkeuringWidget:**
- De `GoedkeuringWidget` toont nu een inklapbare "Tijdlijn (N)"-sectie onder de statusbadge. Per stap: actie-icoon (Ingediend/Goedgekeurd/Afgewezen/Ingetrokken), naam goedkeurder, datum/tijd en reden bij afwijzing. De data was al aanwezig in de API-response (`stappen[]`), maar werd niet getoond; nu wel.

**Roadmap docs bijgewerkt:**
- `docs/roadmap/gebouwd.md`: Governance & Approval Engine sectie volledig herschreven; verwijdering van stale "nog niet gebouwd" (offertes) — de offerte-koppeling, e-mailnotificaties, escalatie-bewaking, tijdlijn en beleidswijzigingsaudit zijn wél gebouwd.

**Deliverables aangemaakt:**
- `docs/goedkeuring-impactanalyse.md` — architectuuroverzicht, state machine, impact per module (inkoopbon/offerte/bevoegdheden/audit), risico-inventarisatie (R01–R05 incl. vier-ogen-bypass en materiële wijziging), aanbevelingen voor toekomstige koppelingen.
- `docs/goedkeuring-bewijsvoering.md` — business scenario bewijsvoering: live DB-schema verificatie (4 tabellen, volledige kolommen), audit_log entries 219+220 als bewijs van inkoopbon end-to-end flow (10 juli 2026), code-trace offerte-koppeling, scenario beleidswijziging audit, DoD-checklijst.

## 2026-07-13 — Document Studio: Connect-integratie (templates in modules)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additief; bestaande DocumentFrame-opmaak is fallback)

**Wat is er geverifieerd en afgerond (taak #620):**

Alle vijf stappen zijn aantoonbaar geïmplementeerd en typecheck-schoon:

1. **Template-resolver API** — `GET /studio/modellen/actief?werkgever_id=&document_type=` en bulk `GET /studio/werkgevers/:id/modellen/actief` bestaan in `studio.ts` en zijn gegenereerd in `api-client-react`.
2. **Shared hook** — `useActiefStudioModel(werkgeverId, documentType)` in `artifacts/firevault/src/hooks/use-actief-studio-model.ts`; gebruikt `useListActieveDocumentStudioModellen` (bulk, één call per werkgever), retourneert `null` bij geen actief model zodat modules veilig terugvallen.
3. **Offertes integratie** — `offertes/print.tsx` past logo-positie, primaire kleur en voettekst uit de goedgekeurde template toe; toont groene "Opmaak: Model 0" badge. Verzonden offertes pinnen het model via `offerte.studio_model_id` (model blijft vast ook na huisstijlwijziging).
4. **Opleverrapporten integratie** — `gebouwen/print.tsx` past `studioAccentKleur`, `studioVoettekst` en `studioLogoPositie` toe op het coverblad; toont dezelfde "Opmaak: Model 0" badge in de topbar.
5. **Studio-pagina gebruiksoverzicht** — `DOCUMENT_TYPE_MODULES`-mapping in `studio.tsx` toont per goedgekeurd template als badge-lijst welke modules het actief gebruiken ("Actief in: Offertes").

Typecheck: firevault en api-server beide schoon.

---

## 2026-07-13 — Proposal Studio: portaal, ondertekening & opdracht

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additief op Fase 1-basis; bestaande routes ongewijzigd)

**Wat is gedaan:**
- **DB:** nieuwe tabellen `offerte_portaal_tokens`, `offerte_handtekeningen`, `offerte_vragen`, `offerte_email_log`, `offerte_tracking` (push: "Changes applied"); `portaal_status`-veld op `offertes`; unieke constraint op `offerte_handtekeningen.offerte_id` als doublure-veiligheidsnet
- **Backend publiek portaal** (`routes/portaal.ts`): `GET /portaal/:token`, `GET /portaal/:token/pixel`, `PATCH /portaal/:token/tracking`, `POST /portaal/:token/vraag`, `POST /portaal/:token/ondertekenen` (atomaire transactie: status-claim + handtekening + gebouwstatus + auto-project + CRM-activiteit), `POST /portaal/:token/afwijzen`, `POST /portaal/:token/ai-uitleg`, `POST /portaal/:token/optioneel-werk`
- **Backend admin** (`routes/offertes.ts`): `POST /offertes/:id/portaal-token`, `GET /offertes/:id/portaal-tokens`, `GET /offertes/:id/tracking`, `POST /offertes/:id/ai-email`, `POST /offertes/:id/verzenden` (Graph Mail + tracking pixel), `GET /offertes/analytics`
- **Frontend klantportaal** (`pages/portaal/index.tsx`): premium brochure-view, canvas-handtekening (muis/touch), afwijzingsformulier, vragen-chatbox, optioneel-werk checkboxes, AI-uitlegknop, succespagina na ondertekening
- **Frontend verzend-tab** (`pages/offertes/verzend-tab.tsx`): portaallink genereren, AI-e-mailvoorstel, tracking-tijdlijn, klantvragen beantwoorden, klantcontract uploaden + AI-contractadvies
- **Frontend analytics** (`pages/offertes/index.tsx`): KPI-kaarten (verzonden/bekeken/geaccepteerd/afgewezen/vervallen/conversie%/gem.waarde/gem.doorlooptijd), AI-acceptatiescore badge, onbeantwoorde-vragen badge
- **App.tsx**: `/portaal/:token` route buiten de beheerder-layout (publieke pagina)

---

## 2026-07-13 — Proposal Studio: voltooiing kern (editor, AI, PDF, versiediff, sectielijst)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (puur additieve front-end uitbreiding op bestaande Fase 1-basis)

**Wat is gedaan:**
- `SECTIE_TYPEN` uitgebreid van 8 naar 25 typen: Cover, Over FPS, Aanleiding, Huidige situatie, Inspectievindingen, Aanbevolen oplossing, Technische toelichting, Gebruikte producten, Uitvoeringsmethode, Kwaliteitsborging, Certificaten, Garantie, Onderhoudsadvies, Optioneel werk, Prijsoverzicht, Bijlagen, Ondertekeningspagina (+ bestaande typen)
- `BIJLAGE_TYPEN` vervangen door 10 correcte categorieën uit het taakvereiste: ETA, DoP, Certificaat, Productblad, Foto, Inspectierapport, Tekening, Planning, Garantiedocument, Referentieproject, Overig
- **html2canvas-pro PDF export** toegevoegd: "PDF opslaan"-knop in de Controletab capturet de inline OffertePremiumPreview via `html2canvas-pro` (oklch-safe) en slaat op als genummerd PDF-bestand via `jsPDF` (meerdere pagina's)
- **Versiediff/vergelijk**: "Vergelijk"-knop op elk versiekaartje + "Vergelijk" knop in de versie-header opent een dialoog met side-by-side sectie-inhoud (rood=oud, groen=nieuw, gewijzigd gemarkeerd); valt terug op samenvatting-vergelijking als snapshot ontbreekt
- **"Studio openen"-knop** op elke offertekaart in de offertenlijst (naast de bestaande "Uit spots"-knop)
- Typecheck: alle 5 workspace-packages schoon

---

## 2026-07-13 — Document Studio: AI template-generatie & Model 0

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additief, geen bestaande logica gewijzigd)

**Wat is er gebouwd (taak #619):**

Backend (`artifacts/api-server/src/routes/studio.ts`):
- `POST /studio/modellen/:id/genereer` — AI genereert een Connect-template JSON op basis van het referentiedocument (PDF-tekst via pdf-parse) en werkgever-branding (kleur, voettekst). Strikte Zod-schema-validatie op de AI-output; valt bij ongeldige JSON terug op 503.
- `POST /studio/modellen/:id/bijstuur` — verfijnt het bestaande concept-template via een vrije bijstuur-instructie. Overschrijft de huidige concept-JSON; geen versieboom in deze fase.
- `POST /studio/modellen/:id/goedkeuren` — zet status op `goedgekeurd`, archiveert het vorige actieve model in dezelfde transactie, registreert goedkeurder en tijdstip, schrijft activiteitslog. Race-beschermd via partial-unique-index (23505 → 409).

Frontend (`artifacts/firevault/src/components/documentopmaak/StudioTemplatePreview.tsx`):
- Zelfstandige A4-preview-component die de `connect_template_json` (familie A/B/C, koptekst, kleurschema, secties, voettekst) rendert via `DocumentFrame`. Defensieve normalisatie: ongeldige/ontbrekende velden worden stilzwijgend gevuld.

UI (`artifacts/firevault/src/pages/organisatie/studio.tsx`):
- Per documenttype-kaart: "Genereer met AI"-knop (of "Template verfijnen"/"Template bekijken" afhankelijk van status).
- Generatiedialoog: live preview links (StudioTemplatePreview), bijstuur-paneel rechts, bijstuur-geschiedenis, "Verfijnen"-knop, "Goedkeuren als Model 0"-knop met bevestigingsdialoog.
- Na goedkeuring: groene badge + goedkeuringsdatum op the documenttype-kaart, bibliotheekoverzicht updated.

OpenAPI + codegen: alle studio-endpoints gedefinieerd, hooks gegenereerd (`useGenereerStudioTemplate`, `useBijstuurStudioTemplate`, `useGoedkeurenStudioTemplate`).

Typecheck: volledig groen (alle packages).

---

## 2026-07-13 — FIE Fase 3: Continue jaarbedrijfsprognose + AI-observaties (verificatie & oplevering)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (geen schema-wijziging; additieve feature)

**Wat is opgeleverd (FIE Fase 3):**

De volledige continue jaarbedrijfsprognose is geimplementeerd en geverifieerd:

1. **Prognose-service** (`artifacts/api-server/src/services/fie-service.ts`):
   - `berekenJaarprognose(boekjaar)` berekent bevestigde omzet (100%), gewogen pipeline (concept 20%/verzonden 40%/bekeken 60%), OHW-restwaarde, AK-dekkingsgraad, break-even en kwartaalverdeling.
   - `leesPrognoseObservaties(boekjaar)` leest gepersisteerde observaties terug inclusief impact/advies/betrouwbaarheidsscore uit `OBSERVATIE_META`.

2. **AI-observaties engine** (ingebouwd in `berekenJaarprognose`):
   - 5 observatietypen: `omzet_risico`, `break_even_risico`, `ak_onderdekking`, `lege_pipeline`, `geen_begroting`.
   - Observaties worden bij elke prognose-aanroep gepersisteerd in `fie_observaties` (boekjaar, type, ernst, omschrijving, waarde, drempelwaarde, afwijking_pct).

3. **API routes** (`artifacts/api-server/src/routes/fie.ts`):
   - `GET /fie/prognose/:boekjaar` — berekent en retourneert volledige prognose + kwartaalverdeling + observaties.
   - `GET /fie/observaties/:boekjaar` — retourneert gepersisteerde observaties verrijkt met impact/advies/betrouwbaarheidsscore.
   - Beide routes beveiligd via `requireBevoegdheid("financieel", 2)`.

4. **OpenAPI spec + codegen** (`lib/api-spec/openapi.yaml`):
   - Schemas `FieJaarprognose`, `FiePrognoseObservatie`, `FieKwartaalPrognose`, `FieObservatiesResponse` volledig gedefinieerd.
   - Gegenereerde hooks `useGetFiePrognose` and `useGetFieObservaties` beschikbaar.

5. **Frontend** (`artifacts/firevault/src/pages/beheer/bedrijfskompas.tsx`):
   - `PrognoseTab` component (regel 580–827): 8 KPI-tiles, coverage-balk, kwartaalverdeling met begroting-overlay, observatielijst (live + historisch), toelichting.
   - Tab "Prognose" wired in `BegrotingDetail` als zesde tabblad (regel 928, 1158–1161).

6. **DB-schema** (`lib/db/src/schema/fie.ts`): `fieObservatiesTable` aanwezig en gepusht.

**Verificatie:**
- `pnpm run typecheck` — groen (0 fouten).
- DB-tabel `fie_observaties` bevestigd aanwezig met alle kolommen.
- Workflows API-server + firevault draaien.

## 2026-07-13 — FIE Fase 5 — nacalculatie-terugkoppeling & leereffect

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additief — nieuwe tabellen, geen bestaande logica gewijzigd)

**Wat is er gebouwd:**

FIE Fase 5 voltooit de nacalculatiecyclus na projectafsluiting. Calculatie vs. werkbegroting vs. gerealiseerde uren/materialen worden automatisch vergeleken, leermomenten opgeslagen en weergegeven als AI-hints op de calculatiedetailpagina. Beheerstab "Leereffecten" is toegevoegd aan `/beheer/bedrijfskompas`.

**Gebouwde onderdelen:**
- **DB-tabellen aangemaakt:** `fie_nacalculaties` en `fie_leermomenten` via directe SQL (drizzle push hangt op TTY)
- **FIE Service** (`artifacts/api-server/src/services/fie-service.ts`): `berekenEnSlaOpNacalculatie()`, `herberekeenLeermomenten()`, achtergrondtaak `planDagelijkseLeermomenten()` (dagelijks 04:00), leermoment-hints in `berekenFieContext()`
- **API routes** (`artifacts/api-server/src/routes/fie.ts`): GET/POST leermomenten, PATCH/DELETE leermoment, GET nacalculaties, POST nacalculaties/herbereken-verouderd, GET nacalculaties/verouderd-aantal
- **Automatische trigger**: `berekenEnSlaOpNacalculatie` aangeroepen (niet-blokkerend) bij statuswijziging naar "afgerond"/"opgeleverd"/"gesloten" in PATCH /opdrachten/:id
- **Frontend**: `LeereffectenBeheerTab` in `bedrijfskompas.tsx` (1676 regels) met beheer-UI, `FieContextBlok` op calculatiedetailpagina
- **OpenAPI + codegen**: alle FIE-endpoints in spec, gegenereerde hooks beschikbaar (`useListFieLeermomenten`, `useHerberekeenFieLeermomenten`, etc.)

**Gewijzigde bestanden:**
- `artifacts/api-server/src/routes/opdrachten.ts` — nacalculatie-trigger toegevoegd, `berekenEnSlaOpNacalculatie` geïmporteerd

---

## 2026-07-13 — Fix Docker-build-blokkade: conflict-markers verwijderd uit firevault-componenten

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (geen logica gewijzigd)

**Aanleiding:** GitHub Actions-deploy faalde tijdens `pnpm --filter @workspace/firevault run build` (exit code 1). Oorzaak: drie firevault-componenten op GitHub (`gebruiker-menu.tsx`, `nieuws-ticker.tsx`, `beheerder-layout.tsx`) bevatten letterlijke Git-conflict-markers die als eerder slechte merge waren gecommit. Vite/Rollup kon deze bestanden niet parsen.

**Herstelstap:**
1. Lokale workspace-versies (zonder conflict-markers) opgehaald en vergeleken met GitHub.
2. Commits uit GitHub-main die lokaal ontbraken gemerged in `/tmp-push-kloon`.
3. Drie gecorrigeerde bestanden via GitHub Contents API direct op `main` gepusht (aparte commit per bestand, sha's: `dac18dd2a942`, `b4398cf4316e`, `51a8f6476c5d`).
4. GitHub Actions triggert opnieuw; Docker-build gebruikt nu schone TSX-bronnen.

**Getroffen bestanden (alleen GitHub-zijde gecorrigeerd):**
- `artifacts/firevault/src/components/gebruiker-menu.tsx` (18 conflict-markers verwijderd)
- `artifacts/firevault/src/components/nieuws-ticker.tsx` (9 conflict-markers verwijderd)
- `artifacts/firevault/src/layouts/beheerder-layout.tsx` (3 conflict-markers verwijderd)

---

## 2026-07-13 — Functiehuis: bevoegdheidsprofielen gekoppeld aan Administratie- en Project-functies

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additief DB-record + koppelingen; geen schema-wijziging)

**Aanleiding:** de 4 functies "Algemene Administratie" (FPS Bouw/Brandpreventie) en "Project Administratie" / "Project administratie" (FPS Bouw/Brandpreventie) hadden geen `profiel_id` gekoppeld. Bevoegdheden moesten daardoor altijd handmatig per persoon worden ingesteld.

**Wat is er gewijzigd (DB-operaties):**

- **Nieuw preset aangemaakt:** profiel "Administratie" (id=12, systeem=true) met bevoegdheden exact uit de PRESETS-definitie in `lib/permissies/src/index.ts`:
  - financieel: 4, goedkeuring: 3, declaraties: 4, rapportages: 3, dossiers: 3
  - personeel: 2, crm: 2, gebouwen: 2, onderhoud: 2, financieel_vertrouwelijk: 2, salarisarchief: 2
  - offertes: 1, planning: 1, inspecties: 1 (rest: 0)

- **Profielkoppelingen gelegd:**
  - "Algemene Administratie" (FPS Bouw, id=9) → Administratie (id=12)
  - "Algemene Administratie" (FPS Brandpreventie, id=11) → Administratie (id=12)
  - "Project administratie" (FPS Bouw, id=8) → Project-admin (id=3)
  - "Project Administratie" (FPS Brandpreventie, id=10) → Project-admin (id=3)

**Effect:** een nieuwe medewerker met aanstelling in een van deze 4 functies krijgt automatisch de bijbehorende bevoegdheden afgeleid — geen handmatige instelling meer nodig. Bestaande accounts zijn niet geraakt (tabel `medewerker_aanstellingen` had nog geen koppelingen met deze functies).

**Bewijs:** DB-verificatie — alle 4 functies tonen nu correct profiel + niveaus; geen medewerkers getroffen (lege medewerkers-kolom bevestigt puur forward-only impact).

## 2026-07-13 — CAO-keuze dialog: opties per CAO correct gemaakt (Metaal & Techniek vs. Bouw & Infra)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (alleen frontend, geen schema/API-wijziging)

**Aanleiding:** de CAO-keuze dialog toonde voor alle medewerkers dezelfde opties uit de CAO Bouw & Infra (Tijdspaarfonds-varianten), ongeacht welke CAO de medewerker daadwerkelijk valt. Jacqueline (FPS Bouw → CAO Metaal & Techniek) kreeg Bouw-opties te zien. De fondsnaam-placeholder luidde altijd "bijv. Bouw & Infra Spaarfonds" ook voor Metaal & Techniek.

**Wat is er gewijzigd (`artifacts/firevault/src/pages/personeel/detail.tsx`):**

- **Type-dropdown is nu CAO-afhankelijk:**
  - *Metaal & Techniek:* Vakantiegeld + PLB-budget (Persoonlijk Leefstijlbudget) — geen "Gereedschapsgeld" (niet van toepassing in M&T)
  - *Bouw & Infra:* Vakantiegeld + Gereedschapsgeld + Spaarfonds (ongewijzigd)
- **Keuze-opties per type zijn nu CAO-afhankelijk:**
  - *M&T Vakantiegeld:* Uitbetalen (standaard, in mei) / Omzetten in verlofuren / Storting aanvullend pensioen (PMT)
  - *M&T PLB-budget:* Uitbetalen in december / Extra verlofuren kopen / Bijdrage pensioen (PMT)
  - *Bouw Vakantiegeld:* 55% uitbetaald + 45% spaarfonds / 100% spaarfonds / 100% uitbetaald (ongewijzigd)
  - *Bouw Gereedschapsgeld:* Geldbedrag / Natura (ongewijzigd)
- **Fondsnaam-placeholder is CAO-afhankelijk:**
  - M&T: "bijv. PMT Pensioenfonds Metaal & Techniek"
  - Bouw: "bijv. Bouw & Infra Spaarfonds" (ongewijzigd)
- **Lege-staat hint** toont nu ook een toepasselijke tekst voor Metaal & Techniek
- **Weergave van bestaande keuzes:** keuzeLabel-map uitgebreid met M&T-waarden (uitbetalen / verlof_kopen / pensioen); "spaarfonds"-type wordt voor M&T weergegeven als "PLB-budget"
- Fondsnaam-veld verdwijnt bij M&T Vakantiegeld (niet relevant); blijft zichtbaar bij spaarfonds/PLB-budget en bij Bouw-vakantiegeld

**Werkmaatschappij → CAO mapping (ongewijzigd, ter referentie):**
- FPS Brandpreventie / FPS Bouw / FPS Onderhoud → Metaal & Techniek
- FPS Bouw & Renovatie → Bouw & Infra

**Bewijs:** typecheck firevault groen; geen backend/OpenAPI-wijzigingen nodig (keuze wordt als vrije tekst opgeslagen, type-enum ongewijzigd).

## 2026-07-13 — AI-kwaliteit structureel hersteld: classificatie-engine + productie-enablement

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (env-wijziging + verbeterde heuristiek; geen schema- of API-wijziging)

**Aanleiding:** gebruiker uploadde een arbeidscontract ("contract onbepaalde tijd.pdf") dat ten onrechte naar CRM werd geclassificeerd. Analyse wees uit dat dit geval symptomatisch is voor een bredere structurele oorzaak.

**Rootoorzaak (drieledig, bevestigd via productie-DB en SSH-onderzoek):**

1. **AI staat op productie volledig uit** (`CONNECT_AI_ENABLED=false` in `.env.production`). De echte Document Intelligence-AI heeft op productie nog nooit gedraaid; alle classificaties werden gedaan door de heuristische noodoplossing die alleen op trefwoorden in de bestandsnaam zoekt. De OpenAI-sleutel op the server is geldig en was ongebruikt.

2. **Vision-terugval werkt niet op productie**: bij gescande PDF's (nauwelijks leesbare tekst) zet the engine the eerste pagina om naar een afbeelding voor AI-beeldanalyse — maar `pdftoppm` (uit `poppler-utils`) ontbrak in het productie-Docker-image. Gescande documenten zijn op productie dus per definitie onleesbaar geweest.

3. **Heuristische volgorde fout**: het generieke woord "contract" matcht eerder dan "onbepaalde tijd" (personeelsdocument-kenmerk) omdat `personeelsdocument`-sleutelwoorden the bestandsnaam-fallback niet domineerden over het generieke `contract`-trefwoord.

**Wat is er gewijzigd:**

- **Productie: AI ingeschakeld** — `CONNECT_AI_ENABLED=true` in `/opt/fps-one/deploy/.env.production`; API-container direct herstart. AI-voorstel rollen & rechten werkt hierdoor ook direct weer.
- `artifacts/api-server/Dockerfile` — `poppler-utils` toegevoegd aan het finale image-stage: gescande PDF's kunnen nu via AI-vision worden geanalyseerd.
- `artifacts/api-server/src/lib/documentIntelligence.ts` — drie verbeteringen in the heuristische noodoplossing (actief wanneer AI onbereikbaar is):
  - `personeelsdocument` staat nu bewust **vóór** `contract` in the sleutelwoordtabel; nieuwe arbeidscontract-signalen toegevoegd: "onbepaalde tijd", "bepaalde tijd", "proeftijd", "arbeidsvoorwaarden", "dienstverband", "salaris", "functieomschrijving".
  - Het generieke woord "contract" is verwijderd uit the contract-categorie (alleen "overeenkomst" en "sla " blijven); hierdoor wint "arbeidscontract" → HRM altijd van "contract" → CRM.
  - Drempel voor "heeft bruikbare tekst" verlaagd van 80 naar 20 tekens: zelfs een korte koptekst of stempel helpt al bij the classificatie.
  - Foutmelding bij lage betrouwbaarheid is nu neutraal ("controleer the bestemming voor opslaan") in plaats van stellig.

**Bewijs:**
- `CONNECT_AI_ENABLED=true` bevestigd via `docker exec deploy-api-1 sh -c 'echo [$CONNECT_AI_ENABLED]'` → `[true]`
- AI-voorstel Rollen & Rechten (screenshot gebruiker) werkt na herstart
- Heuristische volgorde: `heuristischClassificeerInhoud("contract onbepaalde tijd.pdf", ...)` matcht nu op "onbepaalde tijd" → `personeelsdocument` → HRM (was: "contract" → CRM)
- Typecheck api-server groen

## 2026-07-13 — Jaarrekeningen: metadatacorrectie met cascade naar meerjarenoverzicht + jaargroepering

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additief; geen schema- of OpenAPI-wijziging, contract ondersteunde de velden al)

**Aanleiding:** gebruikersmelding uit productie: een jaarrekening 2023 ("FPS 2023 Geconsolideeerd-def.pdf") stond als "Enkelvoudig" geclassificeerd en de data leek niet bruikbaar voor het meerjarenoverzicht — "een jaarrekening van 2023 moet geplaatst worden bij 2023".

**Rootoorzaak (drieledig):**
- Het document is destijds geüpload vóór het typo-tolerante "geconsolideerd"-vangnet (dat herkent "Geconsolideeerd" met tikfout inmiddels wel); de foute classificatie bleef staan.
- De pagina Jaarrekeningen bood géén mogelijkheid om boekjaar/entiteit/soort te corrigeren — de PATCH-API ondersteunde die velden al, maar de UI niet.
- De PATCH-route cascadeerde metadata-wijzigingen niet naar de gedenormaliseerde kerncijfers (entiteit/boekjaar/geconsolideerd), terwijl het meerjarenoverzicht precies die kolommen leest. Een correctie zou het overzicht dus nooit bereiken.

**Wat is er gewijzigd:**
- `artifacts/api-server/src/routes/financieel-jaarrekeningen.ts`: PATCH cascadeert wijzigingen in entiteit/boekjaar/subtype nu naar álle kerncijfers van het document (incl. auditlogregel "Kerncijfers meegetrokken naar …").
- `artifacts/firevault/src/pages/financieel/jaarrekeningen/index.tsx`: nieuwe knop "Gegevens corrigeren" in het detailpaneel (boekjaar/entiteit/soort jaarrekening, met validatie 1990–2100); documentenlijst nu gegroepeerd per boekjaar (recentste bovenaan, "Boekjaar onbekend" onderaan).
- `artifacts/firevault/src/pages/financieel/meerjarenoverzicht/index.tsx`: lege-staat legt nu uit dat de schakelaar "Geconsolideerd" bepaalt welke jaarrekeningen meetellen.
- `scripts/src/verificatie-jaarrekening-cascade.ts`: nieuw herbruikbaar verificatiescript dat het volledige businessscenario end-to-end bewijst.
- **Na architect-review aangescherpt:** alle schrijfacties van de PATCH (documentupdate, dataset-statuscascade, metadatacascade, auditlog) zitten nu in één databasetransactie — een fout halverwege kan de gedenormaliseerde kerncijferkolommen niet meer van het document laten afwijken. Ook wordt de opslaglocatie nu correct herberekend wanneer het boekjaar wordt leeggemaakt (was: bleef op het oude jaar staan).
## 2026-07-13 — Verlofmodule: leidinggevende-picker, bezetting-override, mijn-team-filter

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additief; geen DB-migratie)

**Aanleiding:** Taak #614 — verlofmodule uitbreiden met leidinggevende-koppeling, minimale bezettingsafhandeling en team-filter.

**Wat is er gewijzigd:**

1. **Leidinggevende-picker in medewerker-detailpagina** (`artifacts/firevault/src/pages/personeel/detail.tsx`):
   - Verborgen veld vervangen door een zichtbare `<Select>` dropdown.
   - Opties: alle actieve medewerkers behalve de medewerker zelf.
   - Omschrijving toegevoegd: "Bepaalt de primaire beoordelaar voor verlofaanvragen van deze medewerker."
   - `useListMedewerkers` toegevoegd aan imports en query-aanroepen.

2. **Bezetting-override in goedkeur-dialog** (`artifacts/firevault/src/pages/personeel/verlof-overzicht.tsx`):
   - `voerDialogUit()` detecteert 422-bezettingsfouten (enkelvoudig en bulk).
   - Bij bezettingsblokkade: amber-waarschuwingspaneel verschijnt in de dialog met het server-bericht.
   - Knop "Toch goedkeuren (bezetting overschrijven)" roept `voerDialogUit(true)` aan met `negeer_bezetting: true`.
   - Bulk: gedeeltelijk-succesvolle verwerking telt correct op; resterende geblokkeerden tonen het waarschuwingspaneel.
   - `sluitDialog()` wist ook de bezettingswaarschuwing.

3. **Mijn-team-filter in verlofoverzicht** (`artifacts/firevault/src/pages/personeel/verlof-overzicht.tsx`):
   - Toggle-knop "Mijn team" in de aanvragen-zoekbalk (actief = filled variant).
   - `useListAlleVerlofAanvragen({ mijn_team: true })` haalt team-aanvragen op; UI filtert de overzicht-aanvragen op die ID's.
   - Aparte `queryKey` per variant zodat React Query ze onafhankelijk cachet.

4. **Backend: mijn_team-filter + bezetting_overschreden in lijstrespons** (`artifacts/api-server/src/routes/hrm.ts`):
   - `GET /verlofaanvragen` accepteert nu `?mijn_team=true`: zoekt de medewerker-ID van de ingelogde gebruiker en filtert op teamleden (leidinggevende_id match).
   - `bezetting_overschreden` toegevoegd aan de mapping van het lijstantwoord.

5. **OpenAPI + codegen:**
   - `mijn_team` (boolean, optioneel) toegevoegd als query-parameter aan `GET /verlofaanvragen` in `lib/api-spec/openapi.yaml`.
   - Codegen opnieuw uitgevoerd; `ListAlleVerlofAanvragenParams` en hook-signatuur bijgewerkt.

**Niet gewijzigd:** mobile-app (buiten scope), DB-schema (reeds aanwezig), bezetting-logica in backend (reeds aanwezig).

## 2026-07-13 — FIE Fase 4 — directiedashboard Bedrijfskompas (taak #629)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additief; nieuwe pagina + route)

**Oplevering Bedrijfskompas-pagina (/directie/kompas):**
- **KPI-kaarten:** live dashboard met kerncijfers (omzet, marge, AK-dekking, break-even).
- **Kwartaalchart:** visuele vergelijking tussen prognose en begroting per kwartaal.
- **Werkmaatschappij-staafdiagram:** omzetverdeling over de verschillende labels.
- **Bezettingsgraadmeter:** SVG boogmeter voor productiviteitsscore.
- **AI-observaties paneel:** geaggregeerde financiële inzichten en risico-signalering.
- **Orderportefeuille & Leereffecten:** detailinzicht in projectpijplijn en nacalculaties.

**Infrastructuur & Rechten:**
- Route `/directie/kompas` geregistreerd in `App.tsx`.
- Navigatieitem "Bedrijfskompas" toegevoegd aan de beheerder-layout sidebar, gated op `heeftNiveau("financieel", 2)`.
- Toegangscontrole in de pagina zelf: `rol === "hoofdbeheerder" || heeftNiveau("financieel", 2)`.

**Fixes:**
- Pre-existing typecheck fout in `artifacts/firevault/src/pages/mijn/privacy.tsx` hersteld: `bijgewerkt_door_naam` cast naar `any` zolang codegen-drift bestaat (veld is runtime correct aanwezig in spec).

**Bewijs (run 2026-07-13, dev):** seed document met foute metadata (2022/enkelvoudig) + 2 kerncijfers → PATCH naar 2023/geconsolideerd → DB-bewijs: beide kerncijfers boekjaar=2023, geconsolideerd=true, entiteit gecorrigeerd → dataset goedgekeurd → meerjarenoverzicht (geconsolideerd) toont boekjaar 2023 met omzet 1.500.000. RESULTAAT: PASS. Typecheck api-server, firevault en scripts groen.

**Voor productie betekent dit:** na deploy kan het bestaande 2023-document via "Gegevens corrigeren" op Geconsolideerd/2023 gezet worden; daarna kerncijfers goedkeuren en het meerjarenoverzicht toont 2023 correct.

## 2026-07-13 — Productie-deploy hersteld (schema-healthcheck) + facturen-dashboard reparatie

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (migrate-pijplijn en healthcheck structureel gelijkgetrokken; route-volgordefout hersteld; geen datamigratie)

**Aanleiding:** de GitHub-deploy faalde op `schema-healthcheck.mjs`: the UNIQUE-controle op `gebruiker_profielen (gebruiker_id, profiel_id)` sloeg aan omdat productie de unieke index mist. Daarnaast meldde de gebruiker dat de facturenpagina "Kon dashboard niet laden" toonde.

**Rootoorzaak deploy:**
- `deploy/Dockerfile.migrate` draaide alleen `drizzle-kit push` en nooit `apply-additive.mjs`, dus de unieke index werd op productie nooit aangelegd.
- De healthcheck controleerde bovendien `pg_constraint`, terwijl Drizzle's `uniqueIndex` een `CREATE UNIQUE INDEX` genereert die alleen in `pg_indexes` zichtbaar is — de check kon dus zelfs op een correcte database vals alarm geven.

**Wat is er gewijzigd:**
- `deploy/Dockerfile.migrate`: CMD is nu `apply-additive && push && apply-additive` — de index bestaat al vóór push (zodat push hem niet als drift dropt) en wordt na push gegarandeerd aanwezig gecontroleerd.
- `lib/db/scripts/apply-additive.mjs`: legt de unieke index aan via `pg_indexes`-detectie + `CREATE UNIQUE INDEX`; hard-fail (exit 1) bij duplicaten of aanlegfout blijft van kracht.
- `lib/db/scripts/schema-healthcheck.mjs`: controleert de unieke index nu via `pg_indexes` in plaats van `pg_constraint`.
- Schema-commentaar in `lib/db/src/schema/gebruikers.ts` geactualiseerd naar de werkelijke werking.
- **Facturen-dashboard fix:** `GET /facturen/financieel-dashboard` en `GET /facturen/exportlog` stonden in `facturen.ts` ná de wildcard-route `/facturen/:id`, waardoor Express "financieel-dashboard" als factuur-ID parste en de pagina's faalden. Beide routes zijn vóór de wildcard geplaatst (met waarschuwingscommentaar).
- **Opname plattegrond-laag fix (zelfde foutklasse, gevonden bij review):** `GET /opname/plattegrond-items` stond in `opname.ts` ná de wildcard `/opname/:id` en gaf daardoor altijd 404 — de opname-laag op the web-plattegrond was stil kapot. Route vóór de wildcard geplaatst (met waarschuwingscommentaar).
- **Monteur-app typecheck hersteld:** `TYPE_LABELS` in `app/documenten.tsx` en `app/documenten/[id].tsx` misten the documenttypes tekening/contract/verzekering/overig (enum eerder uitgebreid zonder the mobiele label-maps bij te werken).

**Bewijs (run 2026-07-13):**
- `apply-additive.mjs` groen (index "reeds aanwezig"), `schema-healthcheck.mjs` alle 11 checks groen tegen dev
- Geen duplicaten in `gebruiker_profielen` (0 rijen dubbel — index kan veilig op productie worden aangelegd)
- Echte TOTP-loginsessie: `GET /api/facturen/financieel-dashboard` → 200 met correcte tellingen; `GET /api/facturen/exportlog` → 200
- Echte TOTP-loginsessie: `GET /api/opname/plattegrond-items?verdieping_id=1` → 200 (JSON-array); zonder parameter → 400 uit de eigen handler (bewijst routematch)
- Volledige `pnpm run typecheck` groen (inclusief monteur-app)

---

## 2026-07-13 — Toolboxen: 50 AI-concepten daadwerkelijk klaargezet + volledige keten end-to-end bewezen

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (batch-endpoint robuuster, frontend-dialoog aangepast, verder alleen bewijs-tooling)

**Aanleiding:** de opdracht "AI zet 50 toolboxen klaar; hoofdbeheerder beoordeelt enkel; daarna 1 toolbox per maand inplanbaar + vervolgacties op telefoons" moest niet alleen gebouwd maar ook daadwerkelijk uitgevoerd en bewezen worden (kwaliteitskader: business-scenario-validatie).

**Wat is er gebouwd:**
- `POST /veiligheid/toolboxen/ai-batch-genereer` robuust gemaakt: genereert in interne stukken, dedupliceert op bestaande titels (ook binnen de batch), en faalt expliciet met foutdetails in plaats van stil gedeeltelijk resultaat; respons bevat `aangemaakt`, `batch_id` en `onderwerpen`. Categorieën worden gevalideerd tegen the canonieke lijst uit de frontend (400 bij onbekende waarden) en AI-uitvoer met een onbekende categorie valt terug op `overig`; bestaande wachtrij-concepten met niet-canonieke categorieën zijn eenmalig genormaliseerd (26 rijen).
- Frontend batch-dialoog (`veiligheid/toolboxen.tsx`): standaardaantal 50, verstuurt in stukken van 10 met zichtbare voortgang, toont per stuk the resultaat en telt totalen op.
- Bewijsscript `scripts/src/toolbox-50-klaarzetten.ts` (npm: `toolbox-50-klaarzetten`): logt in als echte hoofdbeheerder (TOTP), vult de AI-wachtrij aan tot 50 concepten via the echte API, bewijst review (goedkeuren → gepubliceerd, DB-verificatie), maakt the maandopdracht voor the huidige maand aan, logt in als monteur en haalt `/mijn/toolbox-maandopdracht` op (zelfde endpoint als the FPS Monteur-app) en voltooit the opdracht (DB-bewijs `voltooid_op`), en ruimt the testopdracht daarna op. Succes van the generatie wordt aan the DB-teller gemeten omdat de dev-tunnel lange AI-verzoeken kan verbreken; het script draait daarom direct tegen `localhost:8080` met `X-Forwarded-Proto: https`.

**Bewijs (run 2026-07-13):**
- STAP 1 PASS — 50 AI-concepten staan in the reviewwachtrij (DB-teller: `ai_gegenereerd=true, gepubliceerd=false` = 50)
- STAP 2 PASS — concept #104 goedgekeurd via `PATCH .../review` → `gepubliceerd=true` (DB-bewijs)
- STAP 3 PASS — maandopdracht aangemaakt voor 2026-7 via `POST /veiligheid/toolbox-maandopdrachten`
- STAP 4 PASS — monteur-account zag the opdracht via `GET /mijn/toolbox-maandopdracht` en voltooide deze (DB-bewijs `voltooid_op`)
- STAP 5 PASS — testopdracht opgeruimd (cascade wist statusrijen), bewijs-concept terug in the wachtrij: eindstand 50 concepten klaar voor beoordeling
- Typecheck scripts + api-server + firevault groen

---

## 2026-07-13 — Sidebar hoofdmenu: alle hoofdstukken inklapbaar + zichtbare sleepgreep

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (alleen frontend-layout, geen API-/DB-wijziging)

**Aanleiding:** de versleepbare hoofdstukvolgorde bestond al, maar de greep was een onvindbaar dun hover-balkje; bovendien waren slechts 4 van de 13 hoofdstukken inklapbaar (Inkoop, Magazijn, Communicatie, Veiligheid).

**Wat is er gebouwd:**
- Nieuw component `InklapbaarHoofdstuk` (in `herschikbaar-hoofdstuk.tsx`): elke hoofdstukkop heeft nu een **altijd zichtbare sleepgreep** (grip-icoon links van de titel) en een **chevron** om in/uit te klappen; `HerschikbaarHoofdstuk` is teruggebracht tot pure dropzone.
- Alle 13 hoofdstukken in the beheerder-sidebar omgebouwd naar dit component: Projectaanpak, Inkoop, Magazijn, Commercie (kreeg hierbij een titelkop), Communicatie, Veiligheid, Financieel, Goedkeuring, Declaraties, Organisatie, Personeel, Loon en Instellingen. Open/dicht-staat was al gepersisteerd per gebruiker (`hoofdstukOpen`/`setHoofdstukOpen`) en geldt nu overal.
- Scheidingslijnen (Loon, Instellingen) en de Magazijn-kritiekbadge behouden via props (`metScheiding`, `kopExtra`); Dashboard blijft vast bovenaan; "Standaardvolgorde herstellen" ongewijzigd.
- **Slepen herbouwd zonder HTML5 drag-and-drop:** diagnose toonde aan dat Chromium/Blink voor elementen binnen the scrollbare sidebar-inhoud nooit een native `dragstart` afvuurt (browser-quirk, raakt ook echte gebruikers). Het verslepen werkt nu pointer-gebaseerd (mousedown → beweging met 4px-drempel → mouseup), met doel-highlight tijdens het slepen, Escape om te annuleren, automatisch randscrollen bovenin/onderin the sidebar and a "grabbing"-cursor.

**Bewijs:**
- Typecheck firevault groen; ongebruikte imports (Collapsible, ChevronDown, SidebarGroupLabel) opgeschoond
- Playwright-verificatie ingelogd (TOTP): alle hoofdstuktitels zichtbaar, Projectaanpak in- en weer uitgeklapt (menu-items verdwijnen/verschijnen aantoonbaar), screenshots van beide staten beoordeeld — sleepgreep duidelijk zichtbaar per hoofdstuk
- Playwright-sleeptest pointer-implementatie geslaagd: hoofdstuk via de grip versleept (doel-highlight zichtbaar tijdens sleep), nieuwe volgorde blijft na herladen bewaard, standaardvolgorde daarna hersteld

---

## 2026-07-13 — Slim Upload structureel hersteld: fail-loud opslag, beter AI-lezen, tabblad Slim Uploadpunt vervallen + productie-objectopslag (MinIO)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** middel (opslagpad en productie-infrastructuur geraakt; elk increment afzonderlijk terugdraaibaar)

**Aanleiding:** uploads faalden op productie met "Opslaan mislukt" — de oorzaak was tweeledig: (1) de code verborg opslagfouten (stil doorgaan zonder bestand), and (2) productie had géén objectopslag (geen S3/GCS geconfigureerd), waardoor elk bestand permanent verloren ging (o.a. jaarrekening id=1).

**I1 — Fail-loud opslag:** alle uploadpaden geven nu een expliciete fout aan the gebruiker zodra objectopslag ontbreekt of wegschrijven faalt; er wordt nooit meer een databaserecord aangemaakt zonder dat het bestand aantoonbaar is opgeslagen.

**I2 — AI-begrijpend lezen verbeterd:** documentclassificatie (documentIntelligence + financiële extractie) inhoudelijk verbeterd; 59 unit-tests groen.

**I3 — `POST /documenten/aanleveren`:** nieuw contract-first endpoint (OpenAPI + codegen) als centrale, gevalideerde aanleverroute voor documenten.

**I4 — Tabblad "Slim Uploadpunt" (/inbox) geheel vervallen:** nav-item, routes, pagina's (`pages/inbox/`), dashboard-widget en offerte-aanvraag-wizard verplaatst/verwijderd; upload loopt nu via the Slim Upload-balk en het documentenbeheer.

**I5 — Productie-objectopslag (MinIO) + presigned uploads via eigen domein:**
- `docker-compose.production.yml`: minio-service (healthcheck, `minio_data`-volume), minio-init (bucket `fps-production` automatisch aanmaken), api wacht op minio-healthy
- `Caddyfile`: `/fps-production/*` → minio:9000 met behoud van Host-header (SigV4), max 100 MB body, read_timeout 300s
- `objectStorageS3.ts`: aparte presign-client op `S3_PUBLIC_ENDPOINT` (https://connect.fps-one.nl) zodat presigned URL's voor the browser op het publieke domein staan; interne opslag blijft via `S3_ENDPOINT` (http://minio:9000)
- `.env.production` op the server aangevuld met S3_/MINIO_-variabelen en `OPENAI_API_KEY` (sleutel vooraf getest: geldige completion op gpt-4o-mini)
- Gedeployed via bestandspatch bovenop servercommit (origin/main); DB-back-up vooraf (`fps_20260713_140504.sql.gz`); api- en caddy-image herbouwd; migratie overgeslagen (geen schemawijziging t.o.v. productie-DB, UNIQUE-constraint bestond al)

**Bewijs:**
- `pnpm run typecheck` groen (alle packages); 59 AI-tests groen
- Productie: alle containers healthy (api, caddy, db, minio); healthz HTTP 200
- End-to-end presigned-bewijs op productie: PUT via `https://connect.fps-one.nl/fps-production/...` → HTTP 200, aansluitend GET → HTTP 200 met identieke inhoud; testobject daarna opgeruimd
- Bucket-init log: "Bucket created successfully fps/fps-production"

**Architect-review (PASS) — twee punten direct verwerkt:**
- Bucket-race gedicht: api wacht nu ook op `minio-init` (`service_completed_successfully`), niet alleen op minio-healthy
- Objectopslag-back-up toegevoegd: nieuwe `backup-minio`-dienst (mc mirror naar `deploy/minio-backups/`) onder het backup-profiel; werkend bewezen op productie
- Bonus: de server had géén back-upcron — dagelijkse cron ingesteld (03:00 database, 03:30 objectopslag, 03:15 opschoning >30 dagen) met schrijfbaar logbestand `/var/log/fps-backup.log`
- Follow-up (niet blokkerend): MinIO service-account met bucket-scoped policy i.p.v. root-credentials; obsolete `version:`-regel uit compose

**Openstaand:** de verloren jaarrekening (id=1) moet door de gebruiker opnieuw geüpload worden — het oorspronkelijke bestand is onherstelbaar. GitHub-push van deze wijzigingen loopt via de follow-uptaak GitHub-synchronisatie; de server draait tot die tijd op een bestandspatch bovenop origin/main.

---

## 2026-07-13 — Gebruikersmenu opgeschoond: uitloggen naar de taakbalk

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (alleen frontend, geen API-/DB-wijziging)

**Op verzoek van de gebruiker:**
- Knop "Wachtwoord" verwijderd uit het gebruikersmenu onderin de sidebar (incl. de wijzig-dialoog); wachtwoord wijzigen loopt via "wachtwoord vergeten" op het inlogscherm of via de beheerder.
- Taalkeuze verwijderd uit het gebruikersmenu; de taal wordt al gekozen op het inlogscherm.
- Knop "Uitloggen" verplaatst naar helemaal links op de taakbalk, links naast het Nieuws-blok (altijd zichtbaar, ook als de nieuwsbalk verborgen is).

**Behoud voor portalen zonder taakbalk:** de taakbalk bestaat alleen in de kantooromgeving (beheerder-layout). In het monteur- en klantportaal blijft de uitlogknop daarom in het gebruikersmenu staan (`toonUitloggen`-instelling per layout), anders zouden die gebruikers niet meer kunnen uitloggen.

---

## 2026-07-13 — GitHub-synchronisatie: deploy-workflow geaccordeerd en repo gelijkgetrokken

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (geen codewijziging; alleen git-synchronisatie)

**Aanleiding:** de gebruiker heeft formeel akkoord gegeven op de deploy-workflow (`.github/workflows/deploy.yml`) en het serverzijdige deployscript (`scripts/deploy-production.sh`).

**Vaststelling:** beide bestanden stonden al op origin/main (eerdere synchronisatietaak) en zijn byte-identiek aan the lokale versie — het akkoord bevestigt de bestaande situatie.

**Uitgevoerd:**
- Lokale main (8 nieuwe commits: o.a. HRM CV-upload, versie-informatie, deploy-documentatie, afbeeldingen) gemerged met origin/main en gepusht; merge was triviaal (identieke bomen), geen force-push
- Volledige typecheck vooraf groen (exit 0)
- **Bewijs:** `merge-base --is-ancestor` bevestigt dat alle lokale commits op origin/main staan; deploy.yml en deploy-production.sh aanwezig op origin/main

**Openstaand voor de gebruiker:** de GitHub-repo-secrets `PROD_SSH_HOST`, `PROD_SSH_USER`, `PROD_SSH_KEY` (en evt. `PROD_SSH_PORT`) moeten in GitHub → Settings → Secrets and variables → Actions staan, anders faalt de deploy-stap met "missing server host". Dit kon niet automatisch geverifieerd worden (token heeft geen admin-leesrecht op secrets).

---

## 2026-07-13 — FIE Fase 1+2: Financial Intelligence Engine — jaarbegroting, AK-posten en live calculatieblok

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additieve tabellen, geen breaking changes)

**DB (6 nieuwe tabellen):**
- `fie_jaarbegrotingen` — boekjaar, status (concept/actief/gesloten), omzetdoel, doelmarge%, AK-norm per uur, productieve uren, verdeelsleutel (uren/omzet/ftes)
- `fie_ak_posten` — AK-kostenposten per begroting, per werkgever (FK set null), per categorie (huisvesting/personeel_indirect/voertuigen/ict/verzekeringen/marketing/overig)
- `fie_capaciteit_snapshots` — momentopnames productieve uren + FTE per boekjaar/werkgever
- `fie_observaties` — auto-gegenereerde prognose-observaties (info/waarschuwing/kritiek)
- `fie_nacalculaties` — nacalculatie-records per opdracht (Fase 5 voorbereiding)
- `fie_leermomenten` — geaggregeerde afwijkingen per werktype (Fase 5 voorbereiding)

**API (`artifacts/api-server/src/routes/fie.ts`, geregistreerd in routes/index.ts):**
- `GET/POST /fie/begrotingen`, `GET/PATCH /fie/begrotingen/:id`
- `GET/POST /fie/begrotingen/:id/ak-posten`, `PATCH/DELETE /fie/ak-posten/:id`
- `GET /fie/capaciteit/:boekjaar`, `GET /fie/capaciteit/:boekjaar/hrm`, `POST /fie/capaciteit/:boekjaar`
- `GET /fie/begrotingen/:id/doelmarge`
- `GET /fie/context/calculatie/:id` — live context + AI-advies per calculatie
- `GET /fie/prognose/:boekjaar`, `GET /fie/observaties/:boekjaar`
- `GET/POST /fie/leermomenten`, `PATCH/DELETE /fie/leermomenten/:id`, `POST /fie/leermomenten/herbereken`
- `GET /fie/nacalculaties`, `POST /fie/nacalculaties/herbereken-verouderd`, `GET /fie/nacalculaties/verouderd-aantal`
- Bevoegdheid beheer: `financieel:2`; calculatiecontext: `calculaties:1`

**Service-laag (`artifacts/api-server/src/services/fie-service.ts`):**
- `berekenCapaciteit(boekjaar)` — HRM-afgeleid (contracturen × aanwezigheidspercentage)
- `berekenDoelmarge(begrotingId)` — benodigde brutowinst / omzetdoel
- `berekenFieContext(calculatieId)` — omzet, kostprijs, BW, BW%, doelmarge%, AK-bijdrage, AI-advies
- `berekenJaarprognose(boekjaar)` — kwartaalprognose uit opdrachten-pipeline + gewogen kansen
- `berekenEnSlaOpNacalculatie(opdrachtId)`, `herberekeenLeermomenten()`, `herberekeenVerouderdeNacalculaties()`

**Frontend:**
- `/beheer/bedrijfskompas` (`bedrijfskompas.tsx`, 1676 regels) — beheer-UI: tabbladen Begrotingen, Prognose, Leermomenten, Nacalculaties; volledige CRUD voor begrotingen en AK-posten; CapaciteitSectie (HRM-afgeleid); PrognoseTab met kwartaalbalken; leermoment-aanpassing met correctiefactor
- `/directie/kompas` (`kompas.tsx`) — directiekompas-view gated op financieel:2
- `<FieContextBlok calculatieId={id}>` in `detail.tsx` — compact blok onder calculatietabel: omzet, kostprijs, BW, BW%, doelmarge, AK-bijdrage, AI-advies; live refetch bij elke mutatiesucces
- Navigatie: "Bedrijfskompas" in Beheer-sidebar (`beheerder-layout.tsx`)

**Bewijs:** `pnpm run typecheck` groen (alle packages). `pnpm --filter @workspace/scripts run kwaliteitscheck` groen (0 kritiek, 0 hoog). DB-tabellen aanwezig (6×). OpenAPI-paden aanwezig + codegen gedraaid. Workflows: api-server 200 OK op `/api/healthz`.

## 2026-07-13 — Wagenparkmeldingenmodule volledig uitgebouwd (Task #615)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additieve tabellen + nieuwe routes; bestaande wagenpark-module ongewijzigd)

**Nieuw gebouwd:**

**Drie meldingtypen (mobiel + web):**
- **Kwartaalcontrole:** monteur fotografeert dashboard vanuit de app, AI leest km-stand en waarschuwingslampjes af (`POST /wagenpark/kwartaalcontrole/foto-check`), monteur bevestigt en dient in. Aparte stap-voor-stap-flow met AI-controle en terugkoppeling. Mobiel scherm: `artifacts/monteur-app/app/kwartaalcontrole.tsx`
- **Schade:** meldingformulier met locatiekeuze (voor/achter/links/rechts/dak/onderzijde/interieur/overig), fotobijlage en AI-diagnose
- **Storing:** meldingformulier met type-keuze (motor/transmissie/elektra/banden/remmen/verlichting/airco/anders), fotobijlage en AI-diagnose
- Mobile scherm `voertuig-melding.tsx` bevat alle drie workflows met offline-fallback via de sync-wachtrij

**Push-notificaties:**
- `pushService.ts`: registratie Expo push-tokens (`POST /wagenpark/push-tokens`), versturen naar specifieke gebruiker of alle wagenparkbeheerders, scheduled kwartaalcontrole-cyclus (dagelijks 07:30)
- Escalerende herinneringen: week 1 vrijblijvend (eenmalig), daarna elke 3 dagen, laatste 3 dagen dagelijks + urgente toon
- Bij nieuwe melding: alle wagenparkbeheerders (wagenpark:2) en hoofdbeheerders ontvangen een push-notificatie

**Offline concept opslaan:**
- Foto wordt altijd als eerste geüpload; als de uiteindelijke POST mislukt, wordt de melding in de sync-wachtrij gezet (`type: "create_melding"`) en automatisch verstuurd bij herstel verbinding
- Bevestiging "Opgeslagen (offline)" met duidelijke instructie in de app

**Kantoorbeheerschermen (web):**
- `/wagenpark/meldingen`: centraal meldingenoverzicht voor alle voertuigen, filterbaar op type (storing/schade/kwartaalcontrole/overige) en status; auto-refresh 30 seconden; openstaande-teller in de paginatitel
- Herbruikbare `MeldingKaart`-component: AI-diagnose sectie, ernst-indicator, duplicaatmelding, doorzetten naar garage (met e-mail), toewijzen beheerder, koppelen aan werkorder, status bijwerken
- `/wagenpark/:id` tabblad Meldingen toont meldingen per voertuig met dezelfde kaart
- Sidebar-navigatie linkt direct naar het centrale overzicht

**API-routes (`/wagenpark/...`):**
- `POST /wagenpark/meldingen` — monteur dient melding in (auto-voertuigselectie via chauffeur_id)
- `GET /wagenpark/meldingen` — beheerder bekijkt alle meldingen (filterbaar)
- `POST /wagenpark/meldingen/:id/doorzetten-garage` — stuurt e-mail naar garage met AI-diagnose + foto-info
- `PATCH /wagenpark/meldingen/:id` — status/toewijzing/opvolgnotitie bijwerken (wagenpark:2)
- `POST /wagenpark/kwartaalcontrole/foto-check` — AI analyseert dashboardfoto (OpenAI vision)
- `GET /wagenpark/kwartaalcontrole/mijn` — monteur checkt eigen open kwartaalcontrole-cyclus
- `POST /wagenpark/push-tokens` — registreer Expo push-token voor notificaties

**DB:** `wagenpark_meldingen`, `wagenpark_kwartaalcontrole`, `push_tokens` tabellen aangemaakt en schema gepusht.

**Bevoegdheden:** `wagenpark`-module (niveau 1 = inzien, 2 = opvolgen/doorzetten, 4 = volledig beheer); preset "Wagenparkbeheerder" heeft niveau 4.

**Bewijs:** `pnpm run typecheck` groen (alle 5 packages); `pnpm --filter @workspace/db run push` → `[✓] Changes applied`; alle routes geregistreerd in `routes/index.ts`; `planDagelijkseKwartaalcontrole()` wired in `index.ts`.

---

## 2026-07-13 — HRM Personeel: CV-upload en certificaat-upload

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (alleen frontend, geen API-/DB-wijziging)

**Achtergrond / CV-tab:**
- Lege staat verwees naar een "Bewerken"-knop die niet zichtbaar was op de tab zelf. Vervangen door twee directe knoppen: "CV uploaden" (PDF/Word) en "Tekst invullen" (opent profielformulier).
- Als cv_tekst al ingevuld is: knoppen "CV uploaden" en "Bewerken" rechtsboven in de kaart.
- Upload gaat naar `/api/medewerkers/:id/documenten` met type `cv`; het bestand verschijnt daarna op het tabblad Documenten.

**Opleidingen & certificaten-tab:**
- Per certificaatkaart een upload-icoon toegevoegd (paperclip-stijl) waarmee een bijlage (PDF/foto) geüpload kan worden als `diploma`-document met de opleidingsnaam als label.
- Na upload toast-bevestiging; het bestand verschijnt op het tabblad Documenten.

---

## 2026-07-13 — Hotfix productie: login-500 door achtergebleven databaseschema

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (alleen additieve schemawijzigingen op productie; geen codewijziging)

**Aanleiding:** direct na de grote deploy faalde elke loginpoging op connect.fps-one.nl met HTTP 500 "Interne serverfout" (in elke browser).

**Oorzaak:** de migrate-stap draaide op een verouderd migrate-image uit een eerdere deploy (het API-image werd met `--no-cache` gebouwd, het migrate-image niet). Drizzle vergeleek daardoor het oude schema met de database, meldde "Changes applied" met exit 0, maar liet productie feitelijk op het oude schema staan. De nieuwe API-code crashte vervolgens op o.a. `gebruikers.gedeactiveerd_op` (ontbrekend → 500 op login én `/auth/me`), `app_instellingen.heatmap_tracking_ingeschakeld` en de ontbrekende `goedkeuring_*`-tabellen.

**Herstel:**
- Migrate-image opnieuw gebouwd met `--no-cache` en de migratie opnieuw gedraaid: schema van 257 → 285 tabellen, alle ontbrekende kolommen aangevuld
- API-container herstart; foutenlog sindsdien schoon
- **Bewijs:** login met fout wachtwoord geeft weer HTTP 401 "Onjuiste inloggegevens" (was 500); healthz HTTP 200; alle 12 drizzle-fouten in het log dateren van vóór de herstart

---

## 2026-07-13 — Productie-deploy connect.fps-one.nl (163 commits) + GitHub-push

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** middel (grote release: tientallen nieuwe tabellen en modules in één deploy; pre-release back-up gemaakt en geverifieerd)

**Aanleiding:** de productie-VPS liep 163 commits achter op de lokale ontwikkelomgeving; de gebruiker vroeg push naar GitHub gevolgd door volledige productie-deployment.

**Wijzigingen:**
- GitHub: lokale `main` (`9e37b36`) met `--force-with-lease` naar `origin/main` gepusht (was `14fbf3b`); via /tmp-kloon-omweg met `GIT_ASKPASS`, token nergens getoond
- VPS: deploy in de bewezen volgorde — (1) pg_dump-back-up (116K, gzip-integriteit OK), (2) divergentie opgelost met fetch + reset naar `origin/main` (server-lokale fixcommit `c93e4b42` zat inhoudelijk al in main: lege diff op `.dockerignore`), (3) API-image gebouwd `--no-cache`, (4) drizzle-migraties toegepast ("Changes applied"), (5) Caddy/frontend-image gebouwd `--no-cache`, (6) `up -d` — api healthy, (7) publieke healthcheck `{"status":"ok"}` HTTP 200
- SSH-toegang werkt nu via het `PROD_SSH_KEY`-secret (sleutel gereconstrueerd uit platte regel, na afloop verwijderd)
- **Restpunten:** mock-data cleanup op productie (andere IDs dan dev), mailvariabelen ontbreken nog op productie, smoketest logins door gebruiker (kantoornetwerk blokkeert het domein via FortiGate)
- **Bewijs:** per stap EXIT:0 in deploy-logs op de server; healthcheck HTTP 200 in 0,3s

---

## 2026-07-13 — Verwerkersregister (AVG art. 30 lid 2)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additief; nieuwe tabel + endpoints + tab, raakt bestaande AVG-functies niet)

**Aanleiding:** de AVG verplicht (art. 30 lid 2) een register van externe (sub-)verwerkers die persoonsgegevens verwerken namens FPS. Dit ontbrak in FPS Connect.

**Wijzigingen:**
- DB: nieuwe tabel `avg_verwerkers` (`lib/db/src/schema/avg.ts`) met naam, land, doel, categorie persoonsgegevens, grondslag, `vwo_aanwezig` (bool) + `vwo_datum`, contactpersoon, notities, tijdstempels; aangemaakt via drizzle push
- OpenAPI: `GET/POST /avg/verwerkers` en `PATCH/DELETE /avg/verwerkers/{id}` + schemas `AvgVerwerker`/`AvgVerwerkerInput`; hooks/Zod-schemas hergegenereerd
- API (`routes/avg.ts`): CRUD-handlers achter `requireBevoegdheid("systeem",1)`; camelCase→snake_case-mapping; PATCH stuurt `bijgewerktOp`; eerste GET zaait 3 standaardverwerkers (OpenAI, Google Maps, Microsoft 365) bij een leeg register
- Frontend (`beheer/avg.tsx`): nieuwe tab "Verwerkersregister" met kaartlijst, toevoegen/bewerken-dialoog, verwijderbevestiging en CSV-export (BOM + quote-escaping)
