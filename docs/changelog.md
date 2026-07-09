# Changelog — FPS Connect

Overzicht van opdrachten, fixes en bouwwerk per datum.
Voor elke taak drie scores:
- **Uitvoering** — volledig / gedeeltelijk / niet

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
- Kanttekening: een hard afgebroken run (kill/workflow-herstart middenin) slaat de opruiming over; de accounts blijven dan actief tot de eerstvolgende voltooide run.
- **Nagekomen fix (release-readiness-check)**: de Pre-Publish Validatie herstelde in haar opruimstap de ww-accounts via `setupE2eWachtwoordAccounts()` maar liet ze daardoor **actief** achter. Nu roept `ruimOp()` daarna ook `archiveerE2eWachtwoordAccounts()` aan; de achtergebleven actieve accounts (ids 40/41) zijn direct gearchiveerd. Eindstand dev: alleen de twee echte accounts actief.

## 2026-07-09 — Loginfouten e2e opgelost: rate-limiter + inbox-schemadrift

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (fixes uitsluitend in dev-omgeving geverifieerd)

Twee oorzaken van falende e2e-webtests gevonden en verholpen:

1. **Login-rate-limiter** telde ook geslaagde logins mee, waardoor opeenvolgende testsuites tegen 429 aanliepen. Fix: `verlaagLoginRateTeller` in `auth.ts` geeft het budget terug bij een geslaagde login (wachtwoordstap én TOTP-stap). Misbruikbeveiliging blijft intact: mislukte pogingen tellen onverminderd mee.
2. **Schemadrift `inbox_items`**: vier kolommen (`ai_organisatie`, `ai_jaar`, `geconsolideerd_override`, `ai_bewijs`) bestonden wel in het Drizzle-schema maar niet in de dev-database → detailpagina gaf 500 → twee inbox-e2e-tests faalden. Kolommen additief toegevoegd via `ALTER TABLE`; beide tests daarna groen.

## 2026-07-09 — GitHub CI groen: lokale main gepusht (TS7030 opgelost op GitHub)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** geen (geen codewijziging; alleen synchronisatie met GitHub)

De GitHub CI faalde op drie TS7030-fouten die lokaal al lang gefixt waren; GitHub stond commits achter omdat het token verlopen was. Uitgevoerd:

1. GitHub-authenticatie hersteld via de Replit GitHub-integratie.
2. Vooraf de exacte CI-stappen lokaal gedraaid: volledige typecheck, api-server build en firevault productie-build — alle groen.
3. `origin/main` bleek één GitHub-zijde mergecommit vooruit te staan, maar de boominhoud daarvan was byte-identiek aan bestaande lokale commits — daarom veilig gemerged (geen force-push, geen contentwijziging) en gepusht.
4. GitHub Actions-run op de gepushte commit `0c9848a` is volledig groen: https://github.com/vinkrene-jpg/fps-one/actions/runs/29007724693

## 2026-07-09 — Pre-Publish Validatie: 10 kritieke identiteitsflows aantoonbaar groen

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** geen (uitsluitend validatie + testscript; geen productiewijziging)

**Wat is gevalideerd (dev-omgeving, alle 10 stappen PASS in één run):**

1. Gebruiker aanmaken — 201, bcrypt-hash in DB verifieert tegen het opgegeven wachtwoord.
2. Gebruiker bewerken zonder wachtwoord — 200, wachtwoordhash byte-voor-byte ongewijzigd (regressiecontrole op de eerder herstelde bug).
3. Wachtwoord wijzigen via Bewerken — 200, hash gewijzigd, oud wachtwoord ongeldig.
4. Wachtwoord-resetflow — beide paden: admin-reset met tijdelijk wachtwoord (moet_wachtwoord_wijzigen=true, login werkt) én publieke resetlink (token aangemaakt, eenmalig gemarkeerd, login met nieuw wachtwoord werkt).
5. Uitnodigingsflow — uitnodigingsmail écht verzonden via Microsoft Graph (mail_logboek: verzonden; plus-adressering naar de eigen gedeelde postbus, dus geen bounce), token geverifieerd, geactiveerd met wachtwoord+taal, 2FA ingericht, status geaccepteerd.
6. Weblogin — wachtwoordstap + TOTP-inrichting, volledige sessie.
7. GET /auth/me — 200 met juiste id/e-mail/rol/bevoegdheden.
8. Rollen laden — hoofdbeheerder krijgt 200 op GET /gebruikers, gebruiker met lege matrix 403.
9. Uitloggen — 204, sessie vernietigd, /auth/me daarna 401.
10. Herlogin met gewijzigd wachtwoord — oud wachtwoord 401, nieuw wachtwoord + TOTP 200.

**Technische details:**
- Nieuw herhaalbaar script `scripts/src/pre-publish-validatie.ts` (`pnpm --filter @workspace/scripts run pre-publish-validatie`): draait tegen `https://$REPLIT_DEV_DOMAIN` met cookie-jar-sessies, verifieert per stap ook rechtstreeks in de database (hashes, tokens, statussen) en stopt met exitcode 1 bij de eerste afwijking.
- Testgebruikers worden na afloop gedeactiveerd + gearchiveerd; het vaste e2e-doelaccount wordt hersteld.
- Vooraf de api-server herstarten reset de in-memory login-rate-limiter (10/15 min per IP); het script blijft binnen dat budget (~8 rate-gelimiteerde calls).
- Seeder `scripts/src/e2e-wachtwoord-testaccounts.ts` heeft nu een `weigerBuitenDev()`-guard (weigert bij `REPLIT_DEPLOYMENT` of `NODE_ENV=production`); het validatiescript ruimt testgebruikers ook op bij een gefaalde run (failure-path cleanup).

**Aansluitende buildfixes (repo weer volledig typecheck-groen):**
- `artifacts/api-server/src/routes/documenten.ts` en `offertes.ts`: drie reeds bestaande TS7030-fouten ("not all code paths return a value") hersteld zonder gedragswijziging.
- `artifacts/monteur-app/app/pbm.tsx`: gebruikte een niet-bestaand `apiUrl` uit `useAuth` plus cookie-auth (`credentials: "include"`); omgezet naar het vaste mobiele patroon — bearer-token uit `useAuth` + `https://EXPO_PUBLIC_DOMAIN/api/...`. Zonder deze fix werkten de PBM-lijst en foto-inspectie op mobiel überhaupt niet (401, geen sessiecookies in de app).

## 2026-07-09 — Kwaliteits-, Validatie- en Uitvoeringskader verankerd als verplicht referentiedocument

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** geen (uitsluitend documentatie)

**Wat is vastgelegd:**

1. Nieuw verplicht referentiedocument `docs/kwaliteitskader.md`: het door de platformeigenaar vastgestelde Kwaliteits-, Validatie- en Uitvoeringskader, inhoudelijk 1-op-1 overgenomen. Kern: een taak is pas gereed wanneer het volledige bedrijfsproces aantoonbaar correct functioneert — build/typecheck is noodzakelijk maar nooit voldoende. Bevat de vier validatieniveaus (codekwaliteit, architectuur, integratie, business-scenario), verplichte bewijsvoering, root-cause-eerst, regressietesten op eindgebruikersniveau, autonome uitvoering binnen scope, productie-uitrolverbod zonder expliciete goedkeuring en de Definition of Done.
2. Kruisverwijzingen met heldere rolverdeling: `replit.md` (beknopte pointer naast de ontwikkelfilosofie), `docs/ontwikkelfilosofie.md` (wat we bouwen en waarom) en `docs/kwaliteitscontrole.md` (het rapporterende controlescript) verwijzen elk naar het kader (wanneer een taak gereed is).
3. Agent-geheugen bijgewerkt zodat toekomstige sessies het kader kennen en toepassen.

**Bestanden gewijzigd:**
- `docs/kwaliteitskader.md` (nieuw)
- `replit.md`
- `docs/ontwikkelfilosofie.md`
- `docs/kwaliteitscontrole.md`
- `.agents/memory/MEMORY.md` + `.agents/memory/kwaliteitskader.md` (nieuw)

## 2026-07-09 — Bugfix: PDF-tekstextractie hersteld (pdf-parse v2-API)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Wat is hersteld:**

1. Alle PDF-tekstextractie faalde stil: het geïnstalleerde `pdf-parse` v2.4.5 heeft geen default-functie-export meer (alleen de named class `PDFParse`), terwijl vrijwel alle aanroepplekken de oude v1-API gebruikten. Elke extractie gooide `TypeError: pdfParse is not a function`, ingeslikt door try/catch. De AI-documentclassifier (Document Intelligence, Slim Upload, Inbox) ontving daardoor nooit de PDF-inhoud ("Geëxtraheerde tekst: GEEN").
2. Eén centrale extractiehelper toegevoegd (`artifacts/api-server/src/lib/pdfTekst.ts`, v2-API met `getText()`/`destroy()` + paginateller). Alle 10 aanroepplekken gemigreerd: documentIntelligence, pdfVisie (`haalPdfTekst`), rapporten (AI-samenvatting), hrm (2×), studio (huisstijlanalyse), brandstof-import (2×), veiligheid, organisatie en pim. Misleidende `createRequire`-workarounds en "pdf-parse is CJS-only"-commentaren verwijderd.
3. `@types/pdf-parse` (v1-API) verwijderd zodat typecheck de echte v2-API bewaakt in plaats van de oude te maskeren.
4. Regressietest toegevoegd (`src/lib/pdfTekst.test.ts` + mini-PDF-fixture): bewaakt dat extractie echt tekst en paginateller oplevert en dat corrupte input een fout gooit in plaats van stil te falen.

**Verificatie:** typecheck api-server groen (op 3 bekende pre-existing TS7030's na); alle 173 vitest-tests groen; end-to-end via Slim Upload met een echte certificaat-PDF: bewijsketen toont "tekstextractie: gelukt via tekstlaag — 1415 tekens, 1 pagina('s)", AI-analyse draait op inhoud, betrouwbaarheid "hoog" (score 7/8).

**Bestanden gewijzigd:**
- `artifacts/api-server/src/lib/pdfTekst.ts` (nieuw) + `pdfTekst.test.ts` (nieuw) + `__fixtures__/test-document.pdf` (nieuw)
- `artifacts/api-server/src/lib/documentIntelligence.ts`, `pdfVisie.ts`
- `artifacts/api-server/src/routes/rapporten.ts`, `hrm.ts`, `studio.ts`, `brandstof-import.ts`, `veiligheid.ts`, `organisatie.ts`, `pim.ts`
- `artifacts/api-server/package.json` (@types/pdf-parse verwijderd)

## 2026-07-09 — Bugfix: wachtwoord bij "Gebruiker bewerken" werd stilzwijgend genegeerd + methodologie-review

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Wat is hersteld:**

1. De bewerkdialoog in Gebruikersbeheer toonde een wachtwoordveld ("Leeg = ongewijzigd"), maar `verstuurBewerken` stuurde het veld nooit mee in de PATCH-payload. Een door de beheerder ingevuld nieuw wachtwoord werd dus stilzwijgend genegeerd — de oorzaak van het productie-account zonder wachtwoordhash. Fix: één regel in `artifacts/firevault/src/pages/gebruikers/index.tsx` (`wachtwoord: bewerkForm.wachtwoord.trim() || undefined`). Server-side (hashing met bcrypt in de PATCH-handler) en OpenAPI-schema waren al correct.
2. Regressietest op UI-niveau toegevoegd aan `scripts/e2e/web-wachtwoord-beheer.spec.ts`: login als hoofdbeheerder (TOTP), bewerkdialoog openen, wachtwoord invullen, opslaan; daarna bcrypt-hashwijziging in de database geverifieerd én login met het nieuwe wachtwoord (status `setup_2fa`).
3. Nieuw referentiedocument `docs/diagnose-methodologie.md`: bewijs versus inferentie bij storingsonderzoek (positieve kanaalcontrole, dekkingsgaten per kanaal, hypothese-gedreven werken), naar aanleiding van de onterecht stellige conclusie "het request heeft productie nooit bereikt" in het eerdere login-onderzoek.

**Verificatie:** typecheck firevault + scripts groen; API-level end-to-end in dev (PATCH → bcrypt-hash `$2b$10$…` gewijzigd in DB → login nieuw wachtwoord 200/`setup_2fa` → oud wachtwoord 401); Playwright-regressietest groen (1 passed, 40s). Productieverificatie vereist herpublicatie (op verzoek nog niet uitgevoerd).

**Bestanden gewijzigd:**
- `artifacts/firevault/src/pages/gebruikers/index.tsx`
- `scripts/e2e/web-wachtwoord-beheer.spec.ts`
- `docs/diagnose-methodologie.md` (nieuw)

## 2026-07-09 — P2 increment 1: fundament meerdere rollen per gebruiker

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Wat is gebouwd (bewust zonder gedragswijziging):**

1. `combineerBevoegdheden(matrices[])` in `@workspace/permissies`: combineert de matrices van meerdere rollen (profielen) tot één effectieve matrix — per module het hoogste niveau. Lege invoer geeft een lege matrix zodat de bestaande legacy-fallback (`bevoegdhedenVoorLegacyRol`) ongewijzigd blijft. Nog nergens aangeroepen door runtime-code.
2. 18 unit tests (`combineer-bevoegdheden.test.ts`): per-module max over meerdere rollen (incl. echte presets), regressie één rol (identieke rechten voor alle 18 presets), regressie geen rollen/legacy-fallback, onbekende module-sleutels, ongeldige waarden, immutabiliteit.
3. Additieve koppeltabel `gebruiker_profielen` (gebruiker_id FK cascade, profiel_id FK cascade, UNIQUE-paar, indexen) in het Drizzle-schema, `apply-additive.mjs` en `schema-healthcheck.mjs`; aangemaakt op de ontwikkeldatabase. UNIQUE via SQL, niet via drizzle-schema (bekende deployment-validatievalkuil). Bestaande kolommen (`bevoegdheden`, `herkomst_profiel_id`, `herkomst_automatisch`) onaangeroerd.

**Verificatie:** 193/193 vitest-tests groen; typecheck libs + firevault + monteur-app groen (alleen de 3 bekende, reeds bestaande TS7030 in api-server); api-server esbuild-build groen; schema-healthcheck 10/10.

**Bestanden gewijzigd:**
- `lib/permissies/src/index.ts` (+ nieuw `combineer-bevoegdheden.test.ts`)
- `lib/db/src/schema/gebruikers.ts`
- `lib/db/scripts/apply-additive.mjs`
- `lib/db/scripts/schema-healthcheck.mjs`

## 2026-07-09 — P1 Hotfix: klant-reactievelden (typefout + ontbrekende databasekolommen)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Wat is hersteld:**

1. Typecheck-fout in `rapport-melding-reset.test.ts`: het testfixture miste de nieuwe velden `klantReactieOp` en `klantReactieType` uit de ontvangstbevestiging-commit. Beide toegevoegd als `null` — geen gedragswijziging, alle 11 unit tests slagen.
2. Databasedrift: kolommen `klant_reactie_op` (timestamp) en `klant_reactie_type` (text) ontbraken op `opleverrapporten` in de ontwikkeldatabase, terwijl het Drizzle-schema ze wel definieert. Toegevoegd via directe `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, en tevens opgenomen in `apply-additive.mjs` (post-merge herstelt dit voortaan automatisch in elke omgeving) en `schema-healthcheck.mjs` (drift wordt voortaan gesignaleerd).

**Resultaat:** de e2e-webtest "rapportenbibliotheek toont, zoekt en filtert rapporten cross-gebouw" slaagt weer.

**Bestanden gewijzigd:**
- `artifacts/api-server/src/__tests__/rapport-melding-reset.test.ts`
- `lib/db/scripts/apply-additive.mjs`
- `lib/db/scripts/schema-healthcheck.mjs`

## 2026-07-09 — Verlopen reactietermijnen tegel op operationeel dashboard
## 2026-07-09 — Klant kan ontvangst bevestigen van een definitief rapport

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Wat is gebouwd:**

Tegel "Verlopen reactietermijnen" toegevoegd aan het operationele beheerdersdashboard (`beheerder.tsx`):
- Toont het aantal definitieve rapporten met `opleverstatus === "verstreken"`.
- Alleen zichtbaar voor hoofdbeheerder en gebruikers met `rapportages >= 1` bevoegdheid (via `magRapportages`).
- Tegel is altijd aanwezig (ook bij 0 — geen verrassingsverschijning).
- Klikbaar: linkt door naar `/rapporten?status=verstreken`.
- Telt rood als er verlopen termijnen zijn, neutraal bij 0.

URL-param support toegevoegd aan `rapporten/index.tsx`:
- `?status=<waarde>` in de URL overschrijft de sessionStorage-beginwaarde van het statusfilter.
- Maakt een directe deep-link vanuit het dashboard (of elke andere plek) mogelijk.
- Alleen geldige statussen (uit `GELDIGE_OPLEVERSTATUS_WAARDEN`) worden geaccepteerd.

**Bestanden gewijzigd:**
- `artifacts/firevault/src/pages/dashboard/beheerder.tsx`
- `artifacts/firevault/src/pages/rapporten/index.tsx`

## 2026-07-09 — Rapport melding-markering nooit geërfd door nieuwe versie

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Wat is gebouwd / hersteld:**

Een nieuwe conceptversie van een rapport (`POST /nieuwe-versie`) erfde al correct geen `reactietermijn_melding_verzond_op` — het veld werd nooit in de insert-waarden opgenomen. Ter hardening en documentatie zijn twee aanvullende maatregelen genomen:

1. **Expliciete null-reset in de definitief-route** (`POST /definitief`): bij het definitief maken van een concept wordt `reactietermijn_melding_verzond_op` nu expliciet op `null` gezet. Dit borgt dat een herstart scenario (bijv. een concept dat ooit tijdelijk een waarde had) de melding-markering nooit onbedoeld kan doorlaten.
2. **Pure helper-functie + 11 unit-tests**: de insert-logica is geëxtraheerd naar `artifacts/api-server/src/lib/rapport-helpers.ts` (`bouwNieuweVersieWaarden`). Twee tests bevestigen direct dat `reactietermijnMeldingVerzondOp` nooit aanwezig is in de nieuwe versie, ook niet als het bronrapport de kolom gevuld heeft. Aanvullende scenario's dekken versienummer, status en inhoud-continuïteit.

**Technische details:**
- `artifacts/api-server/src/lib/rapport-helpers.ts` — nieuw bestand met geïsoleerde, unit-testbare helper
- `artifacts/api-server/src/routes/rapporten.ts` — definitief-route reset nu expliciet `reactietermijnMeldingVerzondOp: null`; nieuwe-versie-route gebruikt de helper
- `artifacts/api-server/src/__tests__/rapport-melding-reset.test.ts` — 11 tests, alle groen

Klanten kunnen nu in FPS One (klantportaal `/klant/rapportages`) op "Ontvangst bevestigen" klikken bij een definitief rapport. De bevestiging wordt opgeslagen in de database and is direct zichtbaar voor interne gebruikers in de gebouwkaart-rapporten-tab.

- DB: twee nieuwe kolommen op `opleverrapporten`: `klant_reactie_op` (TIMESTAMPTZ) en `klant_reactie_type` (TEXT). Toegevoegd via directe ALTER TABLE (additief, geen drizzle push vereist).
- OpenAPI: `Rapport`-schema uitgebreid met `klant_reactie_op` and `klant_reactie_type`; nieuw endpoint `POST /gebouwen/{id}/rapporten/{rapportId}/klant-reactie` + `KlantReactieInput` schema.
- API server (`rapporten.ts`): nieuw route-handler. Alleen op definitieve rapporten; eenmalig (409 bij tweede poging); klant en interne gebruikers mogen beide bevestigen. `mapRapport` geeft beide velden mee.
- Frontend klant (`klant/rapportages.tsx`): nieuwe `OntvangstBevestigenKnop`-component — toont knop bij definitieve rapporten zonder reactie; toont groene bevestigingsregel daarna.
- Frontend intern (`gebouwen/gebouw-rapporten.tsx`): toont "Klant bevestigd ontvangst op [datum]" in groen bij rapporten met een klantreactie.

## 2026-07-08 — Pre-push typecheck fix: opleverstatus status-strings

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Wat is hersteld:**

Task #424 hernoemde het veld `weergave_status` → `opleverstatus` en de status-strings `definitief_verzonden` → `verzonden` / `termijn_verstreken` → `verstreken`. Twee bestanden waren nog niet meegenomen in die rename: `klant/rapportages.tsx` (5 plaatsen) en `onderhoud/dashboard.tsx` (1 plaats). Gevonden tijdens de pre-push typecheck controle (TS2339 / TS2367). Alle firevault typecheck-fouten zijn nu opgelost.
