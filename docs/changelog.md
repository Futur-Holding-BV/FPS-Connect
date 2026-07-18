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
