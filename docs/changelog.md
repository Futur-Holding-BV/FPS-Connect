## 2026-07-13 — Verwerkersregister (AVG art. 30 lid 2)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additief; nieuwe tabel + endpoints + tab, raakt bestaande AVG-functies niet)

**Aanleiding:** de AVG verplicht (art. 30 lid 2) een register van externe (sub-)verwerkers die persoonsgegevens verwerken namens FPS. Dit ontbrak in FPS Connect.

**Wijzigingen:**
- DB: nieuwe tabel `avg_verwerkers` (`lib/db/src/schema/avg.ts`) met naam, land, doel, categorie persoonsgegevens, grondslag, `vwo_aanwezig` (bool) + `vwo_datum`, contactpersoon, notities, tijdstempels; aangemaakt via drizzle push
- OpenAPI: `GET/POST /avg/verwerkers` en `PATCH/DELETE /avg/verwerkers/{id}` + schemas `AvgVerwerker`/`AvgVerwerkerInput`; hooks/Zod-schemas hergegenereerd
- API (`routes/avg.ts`): CRUD-handlers achter `requireBevoegdheid("systeem",1)`; camelCase→snake_case-mapping; PATCH stuurt `bijgewerktOp`; eerste GET zaait 3 standaardverwerkers (OpenAI, Google Maps, Microsoft 365) bij een leeg register
- Frontend (`beheer/avg.tsx`): nieuwe tab "Verwerkersregister" met kaartlijst, toevoegen/bewerken-dialoog, verwijderbevestiging en CSV-export (BOM + quote-escaping)
- Frontend (`beheer/privacy.tsx`): knop "Bekijk verwerkersregister" in de AVG-matrix-header, linkt naar `/beheer/avg`
- **Buiten scope (bewust):** digitale ondertekening, externe compliance-tools
- **Bewijs:** end-to-end geverifieerd tegen dev via ingelogde admin (TOTP): seed=3, POST=201, PATCH=200 (bijgewerkt_op ververst), DELETE=204, defaults blijven na delete

---

## 2026-07-13 — Onboarding koppelt automatisch salarismutatie + afrondscherm met vervolgstap

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (concept-mutatie; een mens controleert en verzendt naar SCAB — niets gaat automatisch de deur uit)

**Aanleiding:** bij onboarding van een loondienst-medewerker werd geen salarismutatie aangemaakt. Daarmee kon een nieuwe medewerker vergeten worden in de verloning.

**Wijzigingen:**
- `api-server/routes/hrm.ts`: `POST /medewerkers/onboarding` maakt direct na verlofprofielopbouw een concept-salarismutatie "Verloning nieuwe medewerker" aan (ingangsdatum = datum in dienst, periode = jaar/maand van indiensttreding, bron = "onboarding"); niet-blokkerend (warn-log bij falen, onboarding gaat door)
- `personeel/onboarden.tsx`: afrondscherm voor "loondienst"-stroom toont een extra kaart "Salarismutatie klaargezet" met directe knop naar `/salaris-mutaties`
- Codegen gedraaid na merge van taak #582 (beoordeelWerkbegrotingAiVoorstel); stale lib opgelost
- **Bewijs:** api-server typecheck exit 0; firevault typecheck exit 0; api-server gecompileerd en actief

---

## 2026-07-13 — CV herkend in Slim Upload/Inbox: expliciete onboardingvraag + vooringevuld formulier

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (AI stelt alleen voor; een mens controleert en bevestigt — er wordt nooit automatisch een medewerker aangemaakt)

**Aanleiding:** wanneer een CV werd herkend in Slim Upload navigeerde de app automatisch naar het lege onboardingformulier, zonder vraag en zonder de CV-gegevens mee te nemen. Gewenst: een expliciete vraag "onboarding starten?" en een vooringevuld formulier op basis van het AI-voorstel.

**Wijzigingen:**
- `api-server/routes/inbox.ts`: nieuw endpoint `POST /inbox/items/:id/cv-analyse` — hergebruikt de bestaande CV-analyse (`cvAnalyse.ts`) op het opgeslagen inboxbestand; 422 als het item geen CV is (`document_categorie !== "hr_document"` of `document_subtype !== "cv"`)
- DB/OpenAPI: `document_subtype`-kolom op inbox-items (additief), `CvAnalyseResultaat`-schema + hook `useAnalyseerInboxCv` via codegen
- `lib/cv-onboarding-stash.ts` (nieuw): AI-voorstel wordt via sessionStorage doorgegeven aan het onboardingformulier (eenmalig gelezen, gewist bij lezen; versie- en bronvalidatie)
- `slim-upload-balk.tsx`: bij een herkend CV verschijnt een amber vraagblok "CV herkend — onboarding starten?" met twee keuzes: "Ja, onboarding starten" (CV wordt door de AI gelezen, bestand blijft in de inbox bewaard, formulier opent vooringevuld) en "Niet nu — alleen in de inbox bewaren"; de automatische navigatie is verwijderd; CV-herkenning primair op AI-subtype in plaats van bestandsnaam
- `inbox/detail.tsx`: zelfde vraagblok op de inbox-detailpagina voor CV-items (knop alleen zichtbaar met schrijfrecht personeel), analyse via het nieuwe endpoint
- `personeel/onboarden.tsx`: leest het CV-voorstel eenmalig in; amber banner "Vooraf ingevuld vanuit CV" toont álle overgenomen velden (naam, e-mail, geboortedatum, telefoon, mobiel, adres, postcode, woonplaats, rijbewijs, VCA/BHV/EHBO-vervaldatums, werkervaring) met een "Alles wissen"-knop; duplicaatwaarschuwing bij bestaande medewerker met dezelfde naam of e-mail; datums alleen overgenomen bij geldig `JJJJ-MM-DD`-formaat; ZZP/uitzend-formulieren krijgen alleen de naam vooringevuld
- Mislukt de CV-analyse, dan opent het formulier gewoon leeg met een duidelijke melding (geen blokkade)
- **Bewijs:** volledige monorepo-typecheck exit 0; endpointgedrag (200 bij CV, 422 bij niet-CV) eerder aangetoond bij de backend-bouw

---

## 2026-07-13 — Leidinggevende-veld verborgen bij onboarding en profiel bewerken

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (alleen UI verborgen; backend en bestaande data ongewijzigd)

**Aanleiding:** het veld "Leidinggevende" verscheen bij elke onboarding en in elk profielformulier, terwijl er één hoofdbeheerder is (en er geen tweede komt) die verlofaanvragen sowieso altijd kan behandelen. Het veld voegde daardoor niets toe en zorgde voor ruis.

**Wijzigingen:**
- `personeel/index.tsx` (onboarding/nieuwe medewerker): Leidinggevende-selectie verwijderd uit het formulier
- `personeel/detail.tsx` (Profiel bewerken): Leidinggevende-selectie verwijderd; een eerder ingestelde leidinggevende blijft behouden (het formulier stuurt de bestaande waarde ongewijzigd mee) en wordt in de kop alleen nog getoond als er daadwerkelijk één is ingesteld
- Ongebruikte ophaling van de volledige medewerkerslijst op de detailpagina opgeruimd (was alleen voor deze dropdown)
- Verlofafhandeling blijft ongewijzigd: zonder leidinggevende behandelt de hoofdbeheerder de aanvragen (bestaande terugval)
- **Bewijs:** firevault typecheck exit 0

---

## 2026-07-13 — E2E-test: nieuw gebouw opent direct de detailpagina

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (alleen testcode + testaccount-infrastructuur; geen wijziging aan app-code)

**Aanleiding:** na "Gebouw opslaan" in de dialoog "Nieuw gebouw" wordt de gebruiker direct doorgestuurd naar de detailpagina `/gebouwen/:id`. Deze flow leunt op de returnwaarde van de create-mutatie en op wouter-navigatie na het sluiten van de dialoog, maar had geen geautomatiseerde regressietest.

**Wijzigingen:**
- Nieuwe Playwright-spec `scripts/e2e/web-gebouw-aanmaken.spec.ts`: logt in met TOTP, opent de dialoog "Nieuw gebouw" op `/gebouwen`, vult naam (uniek per run) + adres in, klikt "Gebouw opslaan" en verifieert: URL wordt `/gebouwen/:id`, de dialoog is dicht, de detailpagina toont de gebouwnaam; daarna terug naar `/gebouwen`, zoekt op de unieke naam en verifieert dat het gebouw in de lijst staat
- Nieuw vast e2e-beheerdersaccount `e2e-web-admin@fps.local` (rol hoofdbeheerder) in `scripts/src/e2e-monteur-testaccount.ts`: de knop "Nieuw gebouw" is beheerder-only, en het bestaande web-account houdt bewust rol "gebruiker" zodat de overige web-specs het niet-beheerder-perspectief blijven testen; runner `e2e-web-run.ts` archiveert dit account ook in het finally-blok
- Opruiming van het testgebouw gebeurt in `afterEach` direct via de database (niet via `DELETE /api/gebouwen/:id`): de governance-middleware classificeert die verwijdering als "kritiek" en blokkeert hem met 403 omdat de sessie geen rol bevat — ook voor een hoofdbeheerder (bekende beperking, zie hieronder)
- **Bewijs:** volledige e2e-web-suite groen (9 tests: 8 passed, 1 skipped, 4.5m), inclusief de nieuwe spec; dev-database na afloop gecontroleerd — geen achtergebleven testgebouwen

**Aandachtspunt (niet in deze taak opgelost):** `DELETE /gebouwen/:id` wordt door de governance-middleware voor iedereen geblokkeerd (403), ook voor hoofdbeheerders, omdat `req.session.rol` nooit wordt gezet bij login (alleen `userId`). Als gebouwen verwijderen via de UI gewenst is, moet de rol in de sessie of via de permissieservice aan de governance-context worden doorgegeven.

---

## 2026-07-13 — Meerdere functies per medewerker: end-to-end bewezen + prominent zichtbaar op profielkaart

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additieve UI-wijziging; backend ongewijzigd en aantoonbaar werkend)

**Aanleiding:** melding dat er bij Jacqueline "geen mogelijkheden" te zien waren om meerdere functies toe te voegen. Onderzoek: de volledige multi-functie-functionaliteit (Aanstellingen-kaart + "Extra functies" in Profiel bewerken) stond al op main en de backend-routes werkten; maar het Functies-overzicht op de profielkaart was verborgen zolang een medewerker nul aanstellingen had — precies de situatie bij Jacqueline (0 rijen in `medewerker_aanstellingen`), waardoor de ingang moeilijk vindbaar was.

**Wijzigingen:**
- `personeel/detail.tsx`: het Functies-blok op de profielkaart wordt nu **altijd** getoond, met (a) een directe knop "Functie toevoegen" (bij schrijfrechten) die de aanstellingsdialoog opent, (b) bij nul aanstellingen de hoofdfunctie uit het medewerkersprofiel als "Hoofd"-chip, en (c) een hintregel dat een medewerker meerdere functies kan vervullen
- `scripts/src/verificatie-aanstellingen.ts` (nieuw): herbruikbaar bewijsscript dat via echte login (wachtwoord + TOTP, e2e-webaccount) de aanstellingen-flow end-to-end test: GET → POST extra functie → GET (zichtbaar) → DELETE (opruimen); wijzigt per saldo geen data
- **Bewijs:** bewijsscript ALLE STAPPEN PASS tegen de draaiende dev-omgeving voor medewerker 5 (Jacqueline): login 200, GET 200, POST 201 (aanstelling aangemaakt), lijst +1, DELETE 204, lijst weer gelijk; firevault typecheck exit 0

---

## 2026-07-13 — Inlogproblemen René: ruimere rate-limit, wachtwoord-oogje en duidelijke foutmeldingen

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (limiet-verruiming is bewust gekozen door de gebruiker; per-account-vergrendeling na 5 foute pogingen blijft onverkort staan)

**Aanleiding:** René kon "weer niet inloggen" ondanks een correct wachtwoord, en het oogje om het wachtwoord te tonen ontbrak. Diagnose (dev + productie-DB): account actief, niet vergrendeld, 0 mislukte pogingen, `login_pogingen` leeg — het IP-gebaseerde rate-limit (10 pogingen per 15 min, gedeeld kantoor-IP) blokkeerde vóór logging en was daarmee de meest waarschijnlijke oorzaak. De gebruiker koos expliciet voor het verhogen van de limiet; later meldde hij dat Firefox waarschijnlijk meespeelt.

**Wijzigingen:**
- `auth.ts`: IP-rate-limit `RL_MAX` van 10 naar 50 per 15 minuten (met uitleg-commentaar); geldt voor `/auth/login`, `/auth/2fa/verify` en `/auth/mobile/login`. De per-account-vergrendeling (5 foute pogingen) blijft de eigenlijke brute-force-rem
- `login.tsx`: wachtwoord-oogje (tonen/verbergen) toegevoegd, zichtbaar op de donkere achtergrond (`text-white/60`); foutafhandeling onderscheidt nu 423 (account vergrendeld), 429 (te veel pogingen, probeer later) en ≥500 (serverfout) met aparte meldingen
- `vertalingen.ts`: 3 nieuwe auth-meldingen × 6 talen
- `index.css`: autofill-overrides gescoped op `.fps-auth` — WebKit-blok (transitietruc + witte tekst) én een apart Firefox-blok (`input:autofill` met donkere inset-schaduw), omdat Firefox de WebKit-truc niet kent en een onbekende selector in een groep de hele regel laat vervallen
- **Bewijs:** screenshot bevestigt zichtbaar oogje; api-server + firevault typecheck exit 0 (na hergeneratie van verouderde lib-declaraties door eerdere task-merges); api-server herstart zodat de nieuwe limiet actief is en het oude limiet-venster gewist is

---

## 2026-07-13 — AI-werkbegrotingvoorstel expliciet als voorstel met bevestigen/negeren

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additief; AI stelt voor, mens bevestigt; status in bestaand jsonb-veld, geen DB-migratie)

**Aanleiding:** bij het aanmaken van een opdracht draait automatisch een AI-werkbegrotinganalyse (`genereerWerkbegrotingAiAnalyse`), opgeslagen in `project_begrotingen.ai_analyse`. De werkbegroting-tab toonde die analyse zonder expliciete voorstelstatus — er was geen "AI-voorstel — nog te bevestigen"-weergave en geen accepteren/negeren-actie, in strijd met de kwaliteitsregel "AI stelt voor, mens bevestigt".

**Wijzigingen:**
- OpenAPI: nieuw `POST /opdrachten/{id}/werkbegroting/ai-analyse/beoordeling` (operationId `beoordeelWerkbegrotingAiVoorstel`, body = named schema `WerkbegrotingAiVoorstelBeoordeling` {beslissing: geaccepteerd|genegeerd}, 200 → `Werkbegroting`); hooks/Zod hergegenereerd
- API (`routes/opdrachten.ts`): `genereerWerkbegrotingAiAnalyse` zet nu `voorstel_status: "voorstel"` op elke AI-gegenereerde analyse; nieuwe beoordelingsroute (achter `schrijven`) valideert de beslissing (400), geeft 404 zonder begroting/analyse, en schrijft `voorstel_status` + `beoordeeld_op` in het bestaande `ai_analyse` jsonb-veld (geen DB-migratie)
- Frontend (`opdrachten/detail.tsx`): werkbegroting-tab toont bovenaan een amber voorstelkaart (Sparkles, "AI-voorstel — nog te bevestigen") met samenvatting, "Voorstel bevestigen", "Negeren" en link naar de volledige analyse; na bevestigen een neutrale secondary-badge "AI-voorstel bevestigd op …" (conform AI-state-kleurconventie: voorstel = amber, bevestigd = neutraal, niet groen); AI-analyse-tab krijgt dezelfde statusbanner (amber met acties / neutrale badge / muted "genegeerd"-notitie). Analyses zonder status (legacy) tellen als onbevestigd voorstel
- **Bewijs:** end-to-end via echte login (wachtwoord + TOTP) tegen dev: GET toont `voorstel_status: "voorstel"` → POST geaccepteerd → GET toont `geaccepteerd` + `beoordeeld_op` (persist bevestigd in DB); genegeerd-pad idem; ongeldige beslissing → 400; opdracht zonder begroting → 404; firevault + api-server typecheck exit 0

---

## 2026-07-13 — Business Intelligence & Automation Engine (BIAE) — centrale event-bus

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag-middel (nieuw, additief; bestaande engines blijven ongewijzigd en draaien door; BIAE is een dunne overkoepelende laag; beheerscherm systeem-gated)

**Aanleiding:** de losse motoren (workflow, governance, goedkeuring, FIE, AI-decision, AI-context, security-intake) hadden geen gedeelde in-proces event-laag. BIAE introduceert één centrale bus waarop deze motoren als dunne capability-adapters zijn aangesloten, zonder de onderliggende engine-bestanden te wijzigen (geen regressie).

**Wijzigingen:**
- Kern: `services/biae/` — event-bus (`index.ts`), `types.ts`, recall/impact-analyse (`impact.ts`), `init.ts` registreert 7 capability-adapters (`capabilities/`): workflow, governance, goedkeuring, fie, ai-decision, ai-context (delegeert `invalideerContext`), security-intake
- WorkflowService: na een geslaagde transitie (na `logAudit`, vóór return) publiceert de service nu `biae.publiceerEvent({categorie:"workflow", type:"workflow_transitie"})` — enige aanpassing aan bestaande engine, verder ongemoeid
- Jobs: `jobs/deadline-bewaking.ts` (delegeert naar `planUurlijkseGoedkeuringBewaking`) en `jobs/compliance-monitoring.ts` (3 regels: certificaat_verlopen, spot_zonder_document, verlofsaldo_buiten_cao) met dedup naar nieuwe tabel `compliance_signalen`
- DB: nieuwe schema `lib/db/src/schema/compliance.ts` (tabel `compliance_signalen`), geregistreerd in de barrel; via `db push` naar dev toegepast
- KPI: `capabilities/kpi-aggregatie.ts` levert geaggregeerde directie-KPI's; Directiecockpit (`pages/directie/kompas.tsx`) toont nu vier KPI-kaarten via de BIAE-feed (`useGetBiaeKpiFeed`) naast de bestaande FIE-queries
- API: OpenAPI-paden `/biae/events`, `/biae/capabilities`, `/biae/compliance-signalen`, `/biae/kpi/{boekjaar}` + schemas; codegen uitgevoerd; `routes/biae.ts` gated op `requireBevoegdheid("systeem",1)`, geregistreerd in `routes/index.ts`
- Frontend: beheerscherm `pages/beheer/biae.tsx` (3 tabs), route `/beheer/biae` in `App.tsx`, nav-item "Automation Engine" in de systeem-gated sidebar-sectie (`beheerder-layout.tsx`)
- **Bewijs:** api-server + firevault typecheck exit 0; `scripts/e2e-biae-bewijs.ts` (3 scenario's tegen dev, wachtwoord+TOTP-login): (1) alle 4 endpoints 401 zonder sessie — fail-closed gating; (2) 7 capabilities geregistreerd; (3) compliance-signalen lijst + volledige kpi-feed 2026 → ALLE SCENARIO'S GESLAAGD. Init-log bevestigt "capabilities geregistreerd (7)", deadline-bewaking en dagelijkse compliance-controle gepland

---

## 2026-07-13 — AI stelt profielen voor op de Bevoegdheidsprofielen-pagina

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additief, opt-in; hergebruikt bestaand hoofdbeheerder-only endpoint; AI stelt alleen voor, mens bevestigt; veiligheid server-side geborgd)

**Aanleiding:** de AI-voorstelfunctie voor rollen/rechten stond alleen op de Rollenmatrix-tab van `/beheer/rollen-rechten`. De aparte pagina `/beheer/profielen` ("Bevoegdheidsprofielen") beheert dezelfde `profielen`-entiteit maar had de knop nog niet. Verzoek: "idem voor bevoegdheidsprofielen, graag door ai laten opzetten".

**Wijzigingen:**
- Frontend: de privé `AiVoorstelDialog` uit `beheer/rollen-rechten.tsx` geëxtraheerd naar een gedeeld, zelfstandig component `components/ai-rollen-voorstel-dialog.tsx` (met eigen interne `NiveauBadge` + niveau-constants, zodat de stabiele matrix-render in rollen-rechten.tsx ongemoeid blijft). De dialooglogica is byte-identiek overgenomen (auto-voorstel bij openen, kaart per rol met opnemen-checkbox, bewerkbare naam, klikbare module-chips 0→4→0, sequentieel opslaan met 409 → "Naam bestaat al")
- `beheer/rollen-rechten.tsx`: lokale dialogdefinitie + types verwijderd, ongebruikte imports opgeschoond, en de dialog nu geïmporteerd uit het gedeelde component; beide bestaande usages ongewijzigd
- `beheer/profielen.tsx`: knop "Laat AI profielen voorstellen" (outline, Sparkles) naast "Nieuw profiel", plus de gedeelde dialog met `onOpgeslagen` → invalidatie van `getListProfielenQueryKey()` zodat de profielenlijst ververst na opslaan
- **Geen backend-/OpenAPI-/DB-/codegen-wijziging:** hergebruikt het bestaande `POST /profielen/ai-voorstel` (hoofdbeheerder-only) en het bestaande `POST /profielen` (met `valideerBevoegdheden`); `saneerBevoegdheden` forceert gevoelige modules op 0
- **Bewijs:** firevault typecheck exit 0; architect code-review (evaluate_task, git diff) → PASS: extractie byte-identiek, geen gedragsverandering op rollen-rechten, wiring op profielen correct, geen gedeelde-state-risico (elke pagina mount een eigen dialoginstantie)

---

## 2026-07-13 — AI stelt rollen voor in Rollen & Rechten beheer

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (nieuw, opt-in; AI stelt alleen voor, mens bevestigt; veiligheid server-side geborgd)

**Aanleiding:** het inrichten van een functiehuis met rollen was volledig handwerk. Een hoofdbeheerder kan nu de AI een passende set rollen (met rechten) laten *voorstellen* op basis van het functiehuis; de mens beoordeelt, past aan en slaat de gewenste rollen zelf op. Daarnaast was de kapotte knop "Standaardrollen aanmaken" hersteld (server-route `POST /profielen/synchroniseer-standaard`).

**Wijzigingen:**
- OpenAPI: nieuw `POST /profielen/ai-voorstel` (operationId `aiRollenVoorstel`, lege body, 200 → `AiRollenVoorstelResultaat` {voorstellen: `AiRolVoorstel`[], toelichting?}, 503 als AI niet geconfigureerd); hooks/Zod hergegenereerd
- API (`routes/profielen.ts`): route achter `requireRol("hoofdbeheerder")`; service `services/profiel-ai.ts` `stelRollenVoor()` met `PROFIEL_VOORSTEL_PROMPT` (`lib/aiPrompts.ts`)
- **Veiligheid server-side (onafhankelijk van modelkwaliteit):** `saneerBevoegdheden` vult alle modules met 0, dropt onbekende sleutels, clampt niveaus 0..MAX_NIVEAU, en forceert gevoelige modules (systeem, financieel_vertrouwelijk, salarisarchief, salaris_mutaties, scab_mail, boekhouder_portaal) altijd op 0. Namen die botsen met PRESET- of bestaande profielnamen worden uitgefilterd (case-insensitive). Het daadwerkelijk opslaan loopt via het bestaande `POST /profielen` (hoofdbeheerder + `valideerBevoegdheden`)
- Frontend (`beheer/rollen-rechten.tsx`): `AiVoorstelDialog` — vraagt bij openen automatisch een voorstel, toont kaart per rol met opnemen-checkbox, bewerkbare naam en klikbare module-chips (niveau 0→4→0); slaat de aangevinkte rollen sequentieel op (409 → "Naam bestaat al"); AI-knop in lege staat én hoofdweergave
- **Latency-fix:** de AI-call gebruikte slot `reasoning` (gpt-5) en hing 7+ minuten — onbruikbaar voor een interactieve knop. Gewijzigd naar slot `default` (gpt-4o) met `max_tokens: 4000`, conform de bestaande structured-JSON pattern in `documentIntelligence.ts`. Reactietijd nu enkele seconden
- **Bewijs:** end-to-end getest als hoofdbeheerder tegen het echte endpoint — 4 rollen voorgesteld, alle 28 modules gevuld (0..4), gevoelige modules op 0, geen naamcollisie, een voorgestelde rol daadwerkelijk opgeslagen en weer opgeruimd; api-server + firevault typecheck exit 0

---

## 2026-07-13 — Meer- en minderwerk als projectdossierregel op de Projectkaart

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (alleen frontend, hergebruikt bestaande hooks; geen API-/DB-wijziging)

**Aanleiding:** de Projectkaart (`gebouwen/detail.tsx`) surfacete meerwerk nog niet als losse sectie (vastgelegd als follow-up #569). Op verzoek van de gebruiker is meer- én minderwerk nu als één dossierregel toegevoegd, met een eigen overzichtstab en doorklik naar de bron.

**Wijzigingen:**
- `gebouwen/detail.tsx`: nieuwe tab "Meer/min." (Scale-icoon) met een overzicht dat twee bronnen samenvoegt — planning-meerwerk (`useListPlanningMeerwerk`, aan het gebouw gekoppeld via het bijbehorende planning-item uit `useListPlanningItems`, client-side gefilterd op `gebouw_id`) en offerte meer-/minderwerkpunten (`offerte_uitgangspunten` met type meerwerk/minderwerk, per offerte opgehaald via `useQueries` + `getListOfferteUitgangspuntenQueryOptions`)
- Doorklik: offertepunt → `/offertes/:id`, planning-meerwerk → `/modules/planning`
- `gebouw-dashboard.tsx`: nieuwe dossierregel "Meer-/minderwerk" met aantal, klikt door naar de nieuwe tab
- Geen backend-, OpenAPI- of DB-wijziging; puur presentatie op bestaande data
- Hiermee is follow-up #569 ("Meerwerk expliciet surfacen") afgehandeld

## 2026-07-13 — Heatmap-tracker AVG-conform (opt-in door beheerder)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (standaard uit; tracker registreert niets tenzij expliciet ingeschakeld)

**Aanleiding:** de heatmap-tracker registreerde klik- en muisbewegingdata gekoppeld aan het gebruikersaccount (persoonsgegevens) zonder dat dit was af te schakelen, zonder DB-persistente schakelaar, zonder vermelding op de AVG-matrix en zonder transparantie richting de gebruiker. Dat is niet AVG-conform.

**Wijzigingen:**
- DB: `app_instellingen.heatmap_tracking_ingeschakeld` (boolean, `NOT NULL DEFAULT false`) toegevoegd via directe ALTER + Drizzle-schema (`lib/db/src/schema/systeem.ts`)
- OpenAPI: veld toegevoegd aan `AppInstellingen` en `AppInstellingenInput`; hooks/Zod-schemas hergegenereerd
- API (`routes/info.ts`): GET geeft het veld terug (default false zonder rij); PUT (`requireRol("hoofdbeheerder")`) leest en bewaart het alleen wanneer meegestuurd
- Frontend tracker (`components/heatmap-tracker.tsx`): leest de schakelaar via `useGetInfoInstellingen` en registreert/verstuurt uitsluitend events wanneer de vlag `true` is; anders worden er geen listeners aangehangen
- Beheer (`pages/info/index.tsx`): schakelaar "Klikgedrag registreren" onder Instellingen, alleen zichtbaar/bedienbaar voor de hoofdbeheerder, met uitleg over grondslag en transparantie
- AVG-matrix (`pages/beheer/privacy.tsx`): module "Heatmap" toegevoegd met grondslag gerechtvaardigd belang (interne productontwikkeling) en bewaartermijn
- Privacycentrum (`pages/mijn/privacy.tsx`): kaart "Klikgedrag (heatmap)" toont per gebruiker of de tracker actief is, wat er wordt geregistreerd, op welke grondslag en dat alleen een beheerder dit kan inschakelen

---

## 2026-07-13 — Toegangsprofiel per functie (multi-functie increment 3)

- **Uitvoering:** volledig (increment 3 van 4) | **Kwaliteit:** hoog | **Risico:** laag (additief; verandert nog GEEN runtime-rechten)

**Aanleiding:** een functie in het functiehuis had geen koppeling naar een toegangsprofiel. Om functies straks (increment 4) automatisch de juiste Connect-rechten te laten bepalen, moet elke functie eerst een standaard toegangsprofiel kunnen dragen.

**Wijzigingen:**
- DB: `functies.profiel_id` toegevoegd (nullable FK → `profielen`, `ON DELETE SET NULL`) via directe ALTER + Drizzle-schema (`lib/db/src/schema/hrm.ts`)
- OpenAPI: `profiel_id` toegevoegd aan `Functie` en `FunctieInput`; hooks/Zod-schemas hergegenereerd
- API (`routes/hrm.ts`): `mapFunctie` geeft `profiel_id` terug; POST/PATCH `/functies` lezen en bewaren het veld (PATCH alleen wanneer meegestuurd)
- Frontend (`personeel/index.tsx`): "Toegangsprofiel"-dropdown in het functie-dialoog (aanmaken + bewerken), gevuld uit `useListProfielen`, met uitleg dat rechten bij meerdere functies samen gelden (hoogste niveau per module) en handmatige extra rechten mogelijk blijven
- **Nog geen effect op het rechtensysteem** — het koppelen is voorbereidend; het daadwerkelijk afleiden/combineren van rechten uit functies volgt in increment 4 (`PermissieService` + `combineerBevoegdheden`, met sync + audit + zelf-escalatiecheck)

## 2026-07-13 — AI Factuurcentrum: mailbox-import, afkeur-conceptmail, zelflerende categorisatie, contractcontrole & directie-tegel

- **Uitvoering:** volledig (5 increments) | **Kwaliteit:** hoog | **Risico:** laag (additief op bestaande facturen-module; AI verstuurt/boekt nooit zelfstandig) | **Bewijs:** volledige typecheck groen (alle packages), api-server + firevault booten schoon, en een geauthenticeerde end-to-end smoketest (login + TOTP via vast e2e-web-account) bevestigt HTTP 200 met correcte responsvorm op `/facturen/analyse`, `/facturen/:id/contractcontrole`, `/facturen/:id/categorisatie-voorstel` en `/facturen/:id/correspondentie`.

**Aanleiding:** het factuurcentrum verwerkte alleen handmatig geüploade facturen. Er was geen automatische postbus-import, geen gestructureerde afkeurcommunicatie naar leveranciers, geen geheugen voor terugkerende boekingspatronen, geen automatische toets tegen onderhoudscontracten, en geen managementoverzicht op het directie-dashboard.

**T1 — Mailbox-import (`services/factuurImport.ts`, `factuurUitlezen.ts`, `routes/facturen.ts`):** een postbus wordt uitgelezen en per bijlage/bericht automatisch een factuur aangemaakt (meerdere formaten), met `bron="mailbox"` en importlog. Beheer via `GET/PATCH /facturen/import-instellingen`, handmatig triggeren via `POST /facturen/mailbox-sync`, log via `GET /facturen/import-log`.

**T2 — Afkeur-flow met AI-conceptmail (`routes/facturen.ts`, `controlebox.tsx`):** afkeuren gebeurt nu met verplichte redencategorie (9 categorieën) + toelichting. `POST /facturen/:id/afkeur-concept` laat AI een nette, zakelijke Nederlandse afkeurmail opstellen als **concept** (terugval-sjabloon zonder AI); een mens bewerkt onderwerp/tekst/ontvanger en verstuurt zelf via `POST /facturen/:id/correspondentie/:cid/verzenden`. AI verstuurt nooit. Vervangt de oude `prompt()`-afwijzing door de `AfwijzenDialog`.

**T3 — Zelflerende leverancier-categorisatie (`routes/facturen.ts`, `controlebox.tsx`):** bevestigde boekingen (grootboek/kostenplaats/categorie/btw) worden per leverancier geleerd; `GET /facturen/:id/categorisatie-voorstel` stelt het meest voorkomende patroon voor (drempel: minimaal 2 bevestigingen). AI stelt voor, mens bevestigt.

**T4 — Contractcontrole (`routes/facturen.ts`, `controlebox.tsx`):** `GET /facturen/:id/contractcontrole` vergelijkt een factuur met het gekoppelde onderhoudscontract en signaleert afwijkingen op bedrag (incl. indexering, drempels 2%/10%), verlopen looptijd, ontbrekend indexpercentage en opzegtermijn. Keurt niets automatisch goed.

**T5 — Factuuranalyse-tegel op directie-dashboard (`directie/kompas.tsx`):** nieuwe tegel toont te beoordelen / afgekeurd / via postbus / IBAN-afwijkingen, openstaand bedrag incl. btw en afkeur per redencategorie, met doorklik naar de controlebox.

**Contract & data:** OpenAPI uitgebreid (categorie op `FactuurAfkeurenInput` + 11 nieuwe schemas/paden), codegen uitgevoerd. Nieuwe tabellen/kolommen: `factuur_correspondentie`, `leverancier_categorisatie`, en op `facturen` o.a. `bron`, `afkeur_categorie`, `iban_afwijking`.

---

## 2026-07-13 — CRM-module herontwikkeling: relatienetwerk, taken, AI-relatievoorstellen, menu-consolidatie

- **Uitvoering:** volledig (4 werkstromen) | **Kwaliteit:** hoog | **Risico:** middel (nieuwe DB-tabellen + OpenAPI + routes, additief; sidebar-consolidatie raakt navigatie)

**Aanleiding:** de CRM-module was verspreid over losse sidebar-items met een gegroepeerde-lijst-relatiekaart. Volledige herontwikkeling gevraagd: interactief relatienetwerk, taken als eigen entiteit, AI-relatievoorstellen met goedkeuringswachtrij, en één centraal CRM-menu-item.

**1. Interactief relatienetwerk (`crm-relatienetwerk.tsx` + `crm/detail.tsx`):**
- SVG node-edge graaf vervangt de oude gegroepeerde `RelatieKaart`: organisatie als centrale node (#212631), contactpersonen radiaal eromheen
- Kleur per beslisrol, lijndikte/streepjes per relatiesterkte (onbekend/zwak/normaal/sterk), hover-highlight, legenda

**2. Taken als eigen CRM-entiteit (`crm_taken` tabel, `crm/taken.tsx`):**
- Polymorfe koppeling (organisatie/contactpersoon/projectkans); volledige CRUD, status- en prioriteitsfilters, checkbox-afronden, toewijzing via toewijsbare-gebruikers

**3. AI-relatievoorstellen (`crm_relatievoorstellen` tabel, `crm/relatievoorstellen.tsx`):**
- AI zoekt op openbare bronnen en stelt contactpersonen voor; goedkeuringswachtrij — een voorstel wordt pas een echte `crm_contactpersoon` ná menselijke goedkeuring (AI creëert nooit zelf)
- Genereren per organisatie, goedkeuren/afwijzen/verwijderen; gated op AI-gateway (503 zonder gateway)

**4. Menu-consolidatie (`beheerder-layout.tsx` + `crm/index.tsx`):**
- Alle CRM zit nu onder één centraal "CRM"-menu-item (voorheen los: Projectkansen/Klanten/Organisaties/Concurrenten/Marktinzicht/Kennisbibliotheek)
- CRM-dashboard is de hub; nav-kaarten toegevoegd voor Taken, AI-relatievoorstellen en Kennisbibliotheek

**Verificatie:** volledige typecheck groen; end-to-end geverifieerd via geauthenticeerde sessie (login + TOTP): taken CRUD (201/200/204) en relatievoorstellen-lijst (200) werken tegen de echte API.

---

## 2026-07-13 — AI Werkvoorbereiding & Inkoopautomatisering (opdracht → werkbegroting → inkoop)

- **Uitvoering:** volledig (4 increments) | **Kwaliteit:** hoog | **Risico:** laag (additief; geen wijziging aan "vaststellen"/PIM; mens blijft altijd in controle; AI verstuurt nooit zelfstandig)

**Aanleiding:** het traject opdracht → werkbegroting → inkoop werd handmatig voorbereid. Doel: AI stelt voor en signaleert, de werkvoorbereider bevestigt en beslist altijd zelf.

**1. Automatische AI-werkbegrotinganalyse bij opdracht aanmaken (`opdrachten.ts`):**
- AI-analyse van de werkbegroting is uitgetrokken naar een herbruikbare helper `genereerWerkbegrotingAiAnalyse(opdrachtId)` (gebruikt door zowel het bestaande handmatige `POST .../ai-analyse`-endpoint als de nieuwe automatische aanroep)
- Bij `maak-opdracht` wordt de analyse niet-blokkerend op de achtergrond gestart zodra er arbeids- of materiaalregels zijn; de werkvoorbereider ziet bij openen direct een voorstel. Faalt de AI (geen gateway / parse-fout), dan wordt een fallback-analyse opgeslagen en gaat het aanmaken gewoon door

**2. Artikelbron & prijsgeldigheid per inkoopregel (`werkvoorbereiding.ts`, `lib/db`, `openapi.yaml`):**
- Nieuwe kolommen `prijs_bron` (jaarprijslijst / leveranciersofferte / vrij) en `prijs_geldig_tot` op inkoopplanregels (additief via ALTER)
- Bij genereren matcht de regelomschrijving tegen de artikelencatalogus (actief + naam-ilike) → `prijs_bron="jaarprijslijst"` + inkoopprijs overgenomen; anders "vrij"
- PATCH en vrije-regel-POST zetten `prijsBron`/`prijsGeldigTot`; frontend toont bronbadges, bewerkbare bron/geldigheid en een waarschuwing bij verlopen prijs (`inkoopplanning-tab.tsx`)

**3. Leverbewaking met proactieve AI-vertragingssignalering (`lib/leverbewaking.ts`, `services/email.ts`, `index.ts`):**
- Dagelijkse taak (07:30) controleert bestelde inkoopbonnen op overschreden of naderende (≤3 dagen) leverdatum en e-mailt gebruikers met `offertes:2`
- Nieuwe mailsoort `leverbewaking_signalering` + `stuurLeverbewakingSignalering`

**4. AI-inkoopcoach overzicht per opdracht (`werkvoorbereiding.ts`, `inkoopcoach-tab.tsx`, `detail.tsx`):**
- Nieuw endpoint `GET /opdrachten/:id/inkoopcoach` aggregeert prijsbron-verdeling, verlopen prijzen, verwachte besparing, bestellingstatus en leverbewaking, met deterministische aandachtspunten (info/waarschuwing)
- Nieuwe tab "AI-inkoopcoach" op de opdrachtdetailpagina met samenvatting, aandachtspunten, inkoopplan- en bestellingenkaarten

**Verificatie:** volledige workspace-typecheck groen; api-server + firevault herstart; geauthenticeerde end-to-end smoketest (login + TOTP via HTTPS dev-domein) bevestigt `GET /opdrachten/:id/inkoopcoach` → 200 met correcte structuur (leeg-data-scenario: `inkoopplan: null`, lege bestellingen, deterministisch info-aandachtspunt).

---

## 2026-07-13 — Directiecockpit & Liquiditeitsdashboard (Projectcontrol)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additief; bestaande dashboards ongewijzigd, alle endpoints allSettled/fail-soft)

**Aanleiding:** de directie/hoofdbeheerder had geen geconsolideerd startoverzicht en geen zicht op de liquiditeit (bank/kas, openstaande debiteuren/crediteuren, cashflow).

**Backend:**
- Nieuw `liquiditeit-service.ts`: berekent netto liquiditeitspositie, openstaande debiteuren (verkoop) en crediteuren (inkoop, betaalstatus ≠ betaald), ouderdomsanalyse (aging), verwachte cashflow op 7/30/90 dagen en drempelsignalen. Banksaldo via nieuwe `leesBankSaldo()` in `accountview-client.ts` (fail-soft: testmodus/geen koppeling → `null`, nooit nepgetallen).
- Nieuwe routes `GET /financieel/liquiditeit` en `GET /directie/cockpit` (9 tegels, `Promise.allSettled`-resilient, gate `requireBevoegdheid("financieel", 2)`).
- OpenAPI-schemas toegevoegd + codegen uitgevoerd.

**AI-observatiespaneel:** liquiditeitssignalen (tekort, achterstallige crediteuren/debiteuren, negatieve cashflow 30d) worden alleen voor het huidige boekjaar in `fie-service.ts` in de observaties geïnjecteerd; fail-soft zodat de jaarprognose nooit crasht.

**Frontend:**
- `directie/cockpit.tsx`: max 10 kleurgecodeerde tegels (rood/oranje/groen/blauw) met click-through naar de onderliggende dashboards.
- `directie/liquiditeit.tsx`: KPI-kaarten, cashflow, aging-tabellen en signalen.
- Nav-items "Directiecockpit" en "Liquiditeit" toegevoegd onder Financieel (gate `financieel` niveau 2).

**Verificatie:** volledige typecheck groen; beide endpoints geven geauthenticeerd 200 met echte berekende data (debiteuren/crediteuren/cashflow uit facturen), ongeauthenticeerd 401.

---

## 2026-07-13 — Meerdere functies zichtbaar/bewerkbaar in Profiel bewerken (increment 1)

- **Uitvoering:** volledig (increment 1 van 4) | **Kwaliteit:** hoog | **Risico:** laag (alleen frontend, geen API-/DB-wijziging, hergebruikt bestaande aanstellingen-CRUD)

**Aanleiding:** een medewerker kan al aan meerdere functies gekoppeld worden via de bestaande aanstellingen-M2M, maar dat was alleen zichtbaar in de losse kaart "Aanstellingen" op de detailpagina. Het "Profiel bewerken"-dialoog toonde slechts één enkele Functie-dropdown, waardoor het leek alsof maar één functie mogelijk was.

**Wijzigingen (`personeel/detail.tsx`):**
- De enkelvoudige "Functie"-dropdown is hernoemd naar "Hoofdfunctie" (verduidelijkt het datamodel: één hoofdfunctie + extra functies)
- Nieuw blok "Extra functies" in het profiel-dialoog: toont bestaande aanstellingen als chips (functie — werkmaatschappij, met Hoofd-markering), met inline acties "Als hoofd" instellen en verwijderen
- Snel toevoegen: functie-dropdown + "Toevoegen" maakt direct een aanstelling binnen de huidige werkmaatschappij (hergebruikt `useCreateMedewerkerAanstelling`); CAO/contracturen/andere werkmaatschappij blijven beschikbaar via de bestaande kaart "Aanstellingen"
- Geen wijziging aan het rechtensysteem — functies bepalen (nog) niet de Connect-toegang; dat is increment 2+ en volgt na productbeslissing

---

## 2026-07-13 — Slim Uploaden: UI vereenvoudigd + werkmaatschappij-context voor AI

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additief op bestaande inbox-module)

**Toegangsbeheer (bevestigd, niet gewijzigd):**
- Inbox (Slim Uploadpunt) is uitsluitend zichtbaar voor gebruikers met `crm: 1` bevoegdheid — zowel nav-item (`{toonCrm && ...}`) als API-routes (`requireBevoegdheid("crm", 1/2)`)

**UI inbox-detail vereenvoudigd (`inbox/detail.tsx`):**
- Bestemming gepromoveerd tot hero-element: groot + bold blok "Dit bestand hoort thuis in [Bestemming]" met categorie als subtekst
- Bewijsketen (technische AI-stappen) volledig verwijderd uit de gebruikersinterface
- `AI-betrouwbaarheid`-badge en losse Redenering-sectie verwijderd
- Ongebruikte `BETROUW_KLEUR`-constante opgeruimd

**Vision-fix (`documentIntelligence.ts`):**
- `haalAfbeelding()` vraagt niet langer de AI-gateway — PDF→afbeelding conversie kan altijd; alleen de `aiContentAnalyse` stap heeft de gateway nodig

**Werkmaatschappij-context voor AI-classificatie:**
- `classificeerDocument()` accepteert nu `werkmaatschappijNaam?: string | null`
- Inbox POST-handler zoekt automatisch de werkmaatschappij van de uploadende gebruiker op via `medewerkers JOIN werkgevers`
- Werkmaatschappij wordt meegegeven aan de AI-prompt als organisatiecontext
- `herkenOrganisatie()` gebruikt de werkmaatschappij als fallback wanneer geen expliciete organisatie gevonden wordt — "organisatie niet herkend" verdwijnt bij uploads door medewerkers

---

## 2026-07-13 — Werk-inbox: verplaatsen, archiveren, beantwoorden + deploybuild-fix

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (puur additief op bestaande werk-inbox module)

**Deploybuild-fix (blokkade):**
- `declaraties.tsx` had twee kapotte imports: `../../lib/auth` (module bestaat niet) en `../../lib/api` (module bestaat niet)
- Beide gefixed: `useAuth` via `@/context/auth` (conform rest monteur-app), `apiFetch` vervangen door directe `fetch()` met `Bearer ${token}` header en `EXPO_PUBLIC_DOMAIN` basis-URL
- Typecheck monteur-app + api-server + firevault volledig groen

**Werk-inbox uitbreiding — stap 3 (verplaatsen/archiveren):**
- `verplaatsMail(gebruikerId, mailboxAdres, messageId, isPersonlijk, doelMap)` in `werkInboxGraph.ts` — POST `/messages/{id}/move` met well-known folder-naam (`"archive"`, `"deleteditems"`, `"inbox"` etc.)
- `archiveerMail(...)` — shorthand die `verplaatsMail` aanroept met `doelMap="archive"`
- Route `POST /werk-inbox/mails/:messageId/verplaats` — body: `{ doelMap: string }`
- Route `POST /werk-inbox/mails/:messageId/archiveer` — geen body nodig
- Beide routes bepalen automatisch `isPersonlijk` door `mailboxAdres` te vergelijken met `token.microsoftEmail`

**Werk-inbox uitbreiding — stap 4 (beantwoorden/nieuw bericht):**
- `beantwoordMail(...)` — 3-staps Graph-flow: `createReply` (draft) → PATCH body (HTML) → `send`; ondersteunt `extraOntvangers` (CC)
- `verstuurNieuwDelegatedMail(gebruikerId, opties)` — POST `/me/sendMail` (persoonlijk) of `/users/{mb}/sendMail` (gedeeld); `saveToSentItems: true`
- Route `POST /werk-inbox/mails/:messageId/beantwoord` — body: `{ htmlBody: string, extraOntvangers?: [...] }`
- Route `POST /werk-inbox/mails/nieuw` — body: `{ naarEmail, onderwerp, htmlBody, naarNaam?, mailboxAdres? }`

**Nog wachten (stap 2):**
- `DELEGATED_SCOPES` in `werkInboxGraph.ts` NIET gewijzigd — wacht op Entra-configuratie door Denko; wijziging is dan één regel (`Mail.Read` → `Mail.ReadWrite Mail.Send`)

---

## 2026-07-11 — Financiële admin: leverancier-intelligentie + betaaltermijn-signalering

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (puur additief op bestaande leveranciers- en facturenmodule)

**Nieuw gebouwd:**

- **Leverancier: factuurcategorie-preset** — nieuw veld `factuur_categorie` op leverancier; inkomende facturen nemen de categorie automatisch over zodat de boekhouder niet meer handmatig hoeft in te stellen
- **Leverancier: auto-akkoord drempel** — nieuw veld `auto_akkoord_drempel_cents`; facturen onder het ingestelde eurobedrag van die leverancier gaan direct naar `klaar_voor_boeking` (geen handmatige beoordeling nodig)
- **Leverancier-formulier** — boekhoud-sectie uitgebreid met beide velden: categorie als Select-dropdown (10 opties), drempel als euro-invoer (opgeslagen in centen)
- **Crediteuren-inbox: betaaltermijn-badges** — rode badge "Vervallen (Xd)" en oranje badge "Vervalt over Xd" zichtbaar op factuurkaarten; vervaldatum ook altijd getoond in metaregel
- **DB-kolommen** — `factuur_categorie text` + `auto_akkoord_drempel_cents integer` op `leveranciers`-tabel (via directe ALTER, geen drizzle-push nodig)
- **Typecheck-fixes** — twee pre-existing fouten opgelost: `medewerkersTable.functie` → `functieId`, `copyPagesFrom` → `copyPages` (pdf-lib API)

**Technisch:**
- OpenAPI `Leverancier` + `LeverancierInput` schema's uitgebreid; codegen uitgevoerd (orval)
- `facturen.ts` route: auto-akkoord logica toegevoegd op POST/PATCH — vergelijkt `bedrag_incl_btw` met `autoAkkoordDrempelCents` van de leverancier
- `leveranciers.ts` route: `mapLeverancier` + body-parsing verwerken beide nieuwe velden
- Typecheck api-server + firevault groen; api-server smoke-test 200 ✓

---

## 2026-07-11 — Declaratiemodule (web + mobiel)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (puur additief — nieuwe tabellen, nieuwe routes, geen bestaand gedrag gewijzigd)

**Nieuw gebouwd:**

**1. DB-tabellen**
- `declaraties`: medewerker_id (FK), categorie (reiskosten/maaltijden/materialen/overig), omschrijving, bedrag_totaal_cents, datum, status (concept/ingediend/goedgekeurd/afgekeurd/verwerkt), ingediend_op, beoordeeld_op/door, afwijzingsreden, verwerking_op/door, bijlage_pad
- `declaratie_beleid`: vrije tekst voor beleidsregels, bijgewerkt_op/door

**2. Permissies**
- Module `declaraties` toegevoegd (niveaus 1–4) aan `lib/permissies/src/index.ts`
- Presets: Monteur/Timmerman/Uitvoerder/Onderhoudsmonteur=2, Projectleider=3, Directie/Administratie=4, HRM-adviseur=1

**3. OpenAPI + codegen**
- Paden: GET/POST /declaraties, GET /mijn/declaraties, GET/PATCH/DELETE /declaraties/:id, POST /declaraties/:id/indienen|goedkeuren|afwijzen|verwerken, GET/PATCH /declaratiebeleid
- Codegen gedraaid → alle hooks + Zod-schemas gegenereerd

**4. Backend routes (`declaraties.ts`)**
- Compleet CRUD met statusmachine (concept→ingediend→goedgekeurd→verwerkt / afgekeurd)
- Bij indienen: mail naar alle actieve gebruikers met declaraties-niveau 3+
- Bij afwijzen: mail naar de medewerker met afwijzingsreden
- Scoping: niveau <3 ziet alleen eigen declaraties; niveau 3+ ziet alles

**5. Web-frontend**
- `/declaraties` — overzichtspagina met tabbladenfilter (alle/ingediend/goedgekeurd/afgekeurd/verwerkt) + nieuw-declaratie-dialoog
- `/declaraties/:id` — detailpagina met bewerken (concept), statusknoppen (indienen/goedkeuren/afwijzen/verwerken), afwijzingsdialoog
- Sidebar nav-item toegevoegd (na "Goedkeuring")

**6. Mobiel (Expo)**
- `/hrm/declaraties` — overzicht eigen declaraties + nieuw indienen
- Nav-kaart toegevoegd aan HRM-dashboard

---

## 2026-07-11 — CAO Bouw & Infra keuzes (vakantiegeld / gereedschapsgeld / spaarfonds)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (puur additief — nieuwe tabel, nieuwe routes, geen bestaand gedrag gewijzigd)

**Nieuw gebouwd:**

**1. DB-tabel `medewerker_cao_keuzes`**
- Kolommen: `id`, `medewerker_id` (FK), `type` (vakantiegeld/gereedschapsgeld/spaarfonds), `keuze` (variant-code), `jaar` (optioneel), `fonds_naam`, `bedrag_cents`, `toelichting`, `aangemaakt_op`, `bijgewerkt_op`
- Aangemaakt via `CREATE TABLE IF NOT EXISTS` (additief, geen Drizzle push)

**2. OpenAPI spec + codegen**
- 4 endpoints: `GET/POST /medewerkers/{id}/cao-keuzes`, `PATCH/DELETE /medewerkers/{id}/cao-keuzes/{keuzeId}`
- Nieuw endpoint `GET /mijn/medewerker` → `MijnMedewerkerInfo` (id, naam, functie, werkmaatschappij)
- Hooks gegenereerd: `useListCaoKeuzes`, `useCreateCaoKeuze`, `useUpdateCaoKeuze`, `useDeleteCaoKeuze`, `useGetMijnMedewerker`

**3. Backend routes (`artifacts/api-server/src/routes/hrm.ts`)**
- 4 CAO-keuze route handlers (lijst, aanmaken, bijwerken, verwijderen) met bevoegdheidscheck
- `/mijn/medewerker` handler — opzoeken via `getMijnMedewerkerId` (sessie → gebruiker_id → medewerker)

**4. Web medewerker detail (`artifacts/firevault/src/pages/personeel/detail.tsx`)**
- Tab "CAO-keuzes" toegevoegd naast Verlof
- TabsContent: keuzes gegroepeerd per type (Vakantiegeld / Gereedschapsgeld / Spaarfonds), keuze-labels, jaar-badge, fonds naam, bedrag in euro's, toelichting; per rij bewerken/verwijderen voor beheerders
- Dialog voor toevoegen/bewerken: type-select (3 opties), keuze-select (afhankelijk van type), jaar, fondsnaam, bedrag en toelichting

**5. Mobiel scherm (`artifacts/monteur-app/app/hrm/keuzes.tsx`)**
- Read-only inzage voor de monteur van zijn eigen CAO-keuzes
- Opzoeken via `useGetMijnMedewerker` (nieuw endpoint) → medewerker-id → `useListCaoKeuzes`
- Gegroepeerd per type, keuze-label, jaar-badge, fonds/bedrag/toelichting
- Navkaart "Mijn CAO-keuzes" toegevoegd aan `artifacts/monteur-app/app/hrm/index.tsx`

---

## 2026-07-11 — Factuur-briefpapier template (DDS Familie A)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (puur additief — nieuwe component + nieuwe route, geen bestaand gedrag gewijzigd)

**Nieuw gebouwd:**

**1. `FactuurTemplateA` component** (`components/documentopmaak/FamilieA.tsx`)
- Volledig A4-factuurlay-out in DDS Familie A-stijl
- Koptekst: logo (positie instelbaar via studio-model: links/rechts/midden) + afzender-adresblok
- Optioneel briefpapier als halftransparante achtergrondlaag over de koptekst
- Geadresseerd-blok (debiteur naam, t.a.v., adres, postcode/woonplaats)
- Factuurkoptekst-tabel: factuurnummer, -datum, vervaldatum, uw referentie, ons kenmerk
- Regelstabel: omschrijving / aantal / eenheid / prijs p/e / BTW% / totaal
- Totaalblok: excl. BTW, BTW-bedrag, incl. BTW (accentkleur op eindtotaal)
- Betalingsinstructie-blok met IBAN, bedrag en kenmerk (alleen als `mij.iban` gevuld)
- Voettekst via `DocumentVoet`
- Props: `mij`, `factuur`, `debiteur`, `regels`, `totalen`, `accentKleur`, `logoPositie`, `briefpapierUrl`, `betalingstermijn`, `meta`

**2. Factuur print-route** (`pages/facturen/print.tsx` + `App.tsx`)
- Nieuwe standalone route `/facturen/:id/print` — buiten portal-layout (zelfde patroon als `offertes/print.tsx`)
- Laadt factuur + factuurregels + werkgever + DDS studio-model (factuur-type)
- Haalt accentkleur en logo-positie uit het actieve studio-model JSON
- Toont model-statusbanner (actief/vastgezet/niet gevonden) — alleen op scherm, niet in print
- Triggert `window.print()` automatisch na 800ms zodra data klaar is

**3. Printknop in factuurdetail** (`pages/facturen/detail.tsx`)
- Knop "Afdrukken" (Printer-icoon) naast "Bewerken" — opent `/facturen/:id/print` in nieuw tabblad

**4. DDS preview-uitbreiding** (`pages/beheer/documentopmaak.tsx`)
- Template-dropdown uitgebreid met "Familie A - Factuurtemplate"
- Dummy-data toont realistisch voorbeeld (3 factuurregels, debiteur WBO Wonen, IBAN-betalingsinstructie)

**Technisch:**
- Typecheck schoon na `as unknown` double-cast voor Werkgever/Factuur runtime-velden buiten schema
- Directe Factuur-velden gebruikt (`factuurnummer`, `factuurdatum`, `vervaldatum`, `relatienaam`, `relatie_adres`, `btw_bedrag`)

## 2026-07-11 — Factuurmodule: verdeelsleutel G-rekening, aanmaningsflow en incasso

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additieve DB-kolommen, nieuwe tabel, geen bestaand gedrag gewijzigd)

**Nieuw gebouwd:**

**1. G-rekening verdeelsleutel-UI** (`facturen/detail.tsx`)
- Oranje kaart verschijnt alleen als `g_rekening_van_toepassing = true`
- Visuele splitsbar (blauw = courante rekening, oranje = G-rekening) met percentages
- Twee bedragboxen met bedragen en betalingsinstructies
- Uitleg-banner: wat een G-rekening is en wat er waar heen moet

**2. Aanmaningsflow + tijdlijn** (`facturen/detail.tsx`)
- Verticale tijdlijn met alle herinneringen en aanmaningen op chronologische volgorde
- "Herinnering sturen"-knop opent dialoog (type: eerste/tweede herinnering, aanmaning, ingebrekestelling + optioneel e-mailadres + opmerking)
- Kleurcodering per type: amber → oranje → rood → donkerrood
- "Incasso"-knop verschijnt pas na 2+ herinneringen (drempelbewaking)
- Betaalstatus `incasso` toont badge met datum in kaart-koptekst

**3. Incasso-flow** (`facturen/detail.tsx`)
- Rode bevestigingsdialoog met uitleg + optioneel incasso-referentieveld (deurwaarder-naam/kenmerk)
- Zet `betaalstatus = "incasso"` + `incasso_datum` + `incasso_referentie` op de factuur
- Registreert ook een tijdlijn-entry als een opmerking is meegegeven
- Incasso-referentie getoond als rode infobox onderaan tijdlijn

**4. Incasso-tab in facturenlijst** (`facturen/index.tsx`)
- Nieuw tab "Incasso" (met Gavel-icoon) filtert client-side op `betaalstatus === "incasso"`
- Bestaande status-tabs en historisch-archief ongewijzigd

**DB-wijzigingen (additief):**
- `ALTER TABLE facturen ADD COLUMN incasso_datum text` + `incasso_referentie text`
- `CREATE TABLE factuur_herinneringen (id, factuur_id, gebruiker_id, type, verstuurd_op, ontvanger_email, opmerkingen, aangemaakt_op)`

**API-routes (nieuw):**
- `GET /facturen/:id/herinneringen` — bevoegdheid financieel:1
- `POST /facturen/:id/herinneringen` — bevoegdheid financieel:2; valideert type-enum
- `POST /facturen/:id/incasso` — bevoegdheid financieel:3; zet betaalstatus + registreert tijdlijn-entry

---

## 2026-07-11 — Demo Data: illustratieve voorbeelddata op lege modulepagina's

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** geen (puur frontend, geen DB-schrijfacties)

**Nieuw gebouwd:**

Alle lege modulepagina's tonen nu illustratieve voorbeelddata in het exacte visuele format van echte data — met een amber "Voorbeeldweergave"-banner. Zodra echte data aanwezig is, verdwijnt de demo automatisch.

**Componenten:**
- `artifacts/firevault/src/lib/demo-data.ts` — centraal bestand met demo-objecten voor alle modules (negatieve IDs als DEMO_MARKER, tenant-safe)
- `artifacts/firevault/src/components/ui/demo-banner.tsx` — amber banner met Eye-icoon en "Voorbeeldweergave"-tekst

**Pagina's bijgewerkt (10 modules):**
1. **Facturen** (`facturen/index.tsx`) — demo factuurkaarten
2. **CRM Organisaties** (`crm/organisaties.tsx`) — demo organisatiekaarten
3. **CRM Contactpersonen** (`crm/contactpersonen.tsx`) — demo contactpersoonrijen
4. **Dossiers** (`dossiers/index.tsx`) — demo dossierkaarten
5. **Inspecties** (`inspecties/index.tsx`) — demo inspectierijen
6. **Onderhoud / Werkbonnen** (`onderhoud/werkbonnen-lijst.tsx`) — demo werkbonrijen
7. **Wagenpark** (`wagenpark/index.tsx`) — demo tabelrijen + colSpan-fix (7→9 na P1-kolommen)
8. **Gereedschappen** (`gereedschappen/index.tsx`) — demo listcard-rijen; typecheck-fix `!!(formulier...)` TS2322
9. **Personeel / Medewerkers** (`personeel/index.tsx`) — demo medewerkerkaarten in grid
10. **Rapporten** (`rapporten/index.tsx`) — demo rapportrijen

**Logica (alle pagina's):**
- Lege staat + geen filters actief → DemoBanner + demo-items (opacity-80)
- Filters actief maar geen resultaten → gewone "Geen resultaten"-melding (geen demo)
- Echte data aanwezig → normale weergave zonder demo

**Typecheck:** schoon (pre-existing fout in `salarisarchief.ts` ongewijzigd).

---

## 2026-07-11 — P1: Wagenpark vervaldatums + Gereedschappen NEN3140-keuring signalering

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additief)

**Nieuw gebouwd:**

**Wagenpark — Verzekering + Lease vervaldatums in lijstoverzicht:**
- `mapVoertuigSamenvatting` uitgebreid met `verzekering_verval_dat`, `lease_eind_datum` en `leasemaatschappij` — waren al in DB en `berekenAandachtNodig`, maar ontbraken in de list-response.
- OpenAPI `VoertuigSamenvatting` schema uitgebreid met deze drie velden.
- Wagenpark-lijsttabel (`/wagenpark`) heeft nu twee extra kolommen: **Verzekering** en **Lease eindigt**. Beide tonen de datum oranje+vet wanneer de vervaldatum binnen 60 dagen valt (zelfde drempel als `berekenAandachtNodig`). Lege waarden tonen `—`.

**Gereedschappen — NEN3140/CE keuringsverval signalering:**
- DB: twee nieuwe kolommen toegevoegd via `ALTER TABLE`: `keuring_norm` (text, bijv. "NEN3140") en `keuring_verval_datum` (timestamptz). Tevens toegevoegd aan `lib/db/src/schema/gereedschappen.ts`.
- OpenAPI `Gereedschap` + `GereedschapInput` schema's uitgebreid met `keuring_norm` en `keuring_verval_datum`.
- `mapGereedschap`, `POST /gereedschappen` en `PATCH /gereedschappen/:id` verwerken de nieuwe velden.
- Gereedschappenlijst toont bij keuringsplichtig gereedschap met verval ≤ 30 dagen (of al verlopen) een rode/oranje waarschuwingsbadge ("Keuring verlopen" / "Keuring binnenkort") in de lijstrij.
- Aanmaakformulier: checkbox "Keuringsplichtig (NEN/CE)" ontvouwt een oranje sectie met vrij tekstveld **Keuringnorm** en een **Keuringsverval** datumkiezer.

**Bestanden gewijzigd:**
- `artifacts/api-server/src/routes/wagenpark.ts` — `mapVoertuigSamenvatting` uitgebreid
- `artifacts/api-server/src/routes/gereedschappen.ts` — `mapGereedschap`, POST, PATCH uitgebreid
- `lib/api-spec/openapi.yaml` — `VoertuigSamenvatting`, `Gereedschap`, `GereedschapInput` schemas uitgebreid
- `lib/db/src/schema/gereedschappen.ts` — `keuringNorm`, `keuringVervalDatum` velden toegevoegd
- `artifacts/firevault/src/pages/wagenpark/index.tsx` — twee extra tabelkolommen (Verzekering, Lease eindigt)
- `artifacts/firevault/src/pages/gereedschappen/index.tsx` — vervalwaarschuwing in lijst + keuringsfields in formulier

**Typecheck:** schoon (pre-existing fout in `salarisarchief.ts` ongewijzigd).

---

## 2026-07-11 — Goedkeuringsnotificatie: directe link + alle module-goedkeurders (Task #557)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additief; alleen notificatielogica uitgebreid)

**Verbeterd:**
- **Directe dashboard-link in notificatiemail**: `stuurGoedkeuringIndienenMail()` in `email.ts` uitgebreid met optionele `dashboardUrl`-parameter. De e-mail toont nu een oranje knop "Bekijk aanvraag in FPS Connect" die direct naar `/beheer/goedkeuringen-dashboard` leidt. URL wordt samengesteld uit `REPLIT_DOMAINS` (hetzelfde patroon als in auth.ts/portaal.ts).
- **Alle bevoegde module-goedkeurders ontvangen de notificatie**: wanneer een beleidsregel een module+niveau-drempel gebruikt (`goedkeurderModule`+`goedkeurderMinNiveau`) in plaats van een vaste gebruiker, query't `dienIn()` nu ALLE actieve gebruikers die aan de drempel voldoen (inclusief hoofdbeheerder) en stuurt naar iedereen een notificatiemail. Voorheen ontving alleen de hoofdbeheerder als noodvallback een bericht.
- **Vaste goedkeurder + vervanger**: wanneer de beleidsregel een `goedkeurderGebruikerId` bevat én een `vervangerGebruikerId`, ontvangen beide een notificatie (was: alleen de primaire goedkeurder).

**Bestanden gewijzigd:**
- `artifacts/api-server/src/services/email.ts` — `dashboardUrl`-parameter + knop-rendering in `stuurGoedkeuringIndienenMail()`
- `artifacts/api-server/src/services/goedkeuring-engine.ts` — ontvangerlijst-logica herschreven, `inArray`-import toegevoegd

**Typecheck:** geen nieuwe fouten in gewijzigde bestanden (pre-existente fouten in goedkeuring.ts/facturen.ts/goedkeuringBewaking.ts ongewijzigd).

---

## 2026-07-11 — Loonstrookjes-module: split-PDF + monteur-app self-service

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additief; geen bestaande routes gewijzigd)

**Nieuw gebouwd:**
- `POST /api/salarisarchief/split-pdf` — accepteert één multi-pagina PDF, splitst per pagina via pdf-lib, extraheert tekst per pagina via pdfTekst.ts, koppelt medewerker-naam via `matchMedewerkerOpTekst()` (volledige naam ≥ 95% score → gekoppeld; deelnamen ≥ 75% → controle_nodig), slaat losse PDF-pagina's op in object storage, maakt batch + salarisbestand records aan. Vereist `salarisarchief:3` bevoegdheid.
- `GET /api/mijn/salarisdocumenten/:id/download` — directe download bearer-compatibel (zonder salarisarchief-bevoegdheid), controleert medewerker-eigenaarschap + zichtbaarMedewerker flag.
- `artifacts/monteur-app/app/hrm/loonstrookjes.tsx` — nieuw scherm: toont eigen loonstroken + jaaropgaven, gesorteerd per type, download via expo-file-system/legacy + expo-sharing (Openen-knop per document).
- `artifacts/monteur-app/app/hrm/index.tsx` — "Loonstrookjes" nav-kaart toegevoegd (positie 2, na Verlof).
- `artifacts/firevault/src/pages/salarisarchief/index.tsx` — "PDF splitsen per medewerker" card vóór de reguliere upload-card; boekhouder selecteert één multi-pagina PDF, kiest type/periode, klikt "PDF splitsen", wordt doorgestuurd naar batch-detailpagina.

**Reeds aanwezig (geen wijziging nodig):**
- Web self-service `/mijn/salarisdocumenten` bestond al volledig (kantoormedewerkers).
- Bearer-auth middleware zet `req.session.userId` ook bij token-verzoeken → alle `/mijn/`-endpoints werken voor monteur-app.

**Typecheck:** api-server groen (geen nieuwe fouten), monteur-app groen, firevault groen (pre-existerende fout in goedkeuringsbeleid.tsx ongewijzigd).
**Build:** api-server esbuild groen (6863ms).

---

## 2026-07-11 — Escalatiebewaking gekoppeld aan offerte & HRM-besluiten (Task #543)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additief; motor was al generiek)

**Nieuw gebouwd:**
- **E-mailnotificatie bij indiening**: `stuurGoedkeuringIndienenMail()` toegevoegd aan `email.ts` (soort `goedkeuring_indiening`). De `dienIn()`-functie in `goedkeuring-engine.ts` stuurt nu direct na indiening een notificatie naar de aangewezen goedkeurder (primair via `goedkeurderGebruikerId`, vervanger, of hoofdbeheerder als fallback). Voorheen ontving de goedkeurder alleen uren-later escalatieberichten.
- **HRM-besluit documenttype**: `hrm_besluit` toegevoegd aan `DOCUMENT_TYPE_LABELS` in `goedkeuringsbeleid.tsx` zodat het dashboard aanvragen correct labelt als "HRM-besluit (contractverlenging / salariswijziging)".
- **Documenttype-dropdown in beleidsscherm**: documenttype-invoerveld in beleidsregel-formulier gewijzigd van vrije tekst naar vaste Select-dropdown (10 erkende types). Foutbestendig aanmaken van beleid voor "offerte" en "hrm_besluit".
- **GoedkeuringWidget in BesluitPaneel**: formele goedkeuringsectie (objectType="hrm_besluit") toegevoegd in `medewerker-contracten.tsx`, direct boven het besluit-formulier.

**Bewijs:** `pnpm run typecheck` groen (alle packages); api-server bouwt en start; `MailSoort` uitgebreid met `goedkeuring_indiening`.

## 2026-07-11 — Goedkeuringsdashboard — configureerbaar historievenster (Task #545)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additief; standaard blijft 7 dagen, geen bestaande queries gebroken)

**Probleem:** afgehandelde goedkeuringsaanvragen (goedgekeurd/afgewezen) verdwenen na 7 dagen stil uit het dashboard, waardoor auditing van oudere aanvragen onmogelijk was.

**Opgelost:**
- **Backend** (`goedkeuring.ts`): nieuw query-param `venster` (integer, ≥0); standaard 7 dagen. `venster=0` verwijdert de datumbeperking volledig. Wordt genegeerd als een expliciete statusfilter meegegeven is.
- **OpenAPI** (`openapi.yaml`): `venster`-parameter gedocumenteerd op `GET /goedkeuring/dashboard`.
- **Frontend** (`goedkeuringen-dashboard.tsx`): vensterselectievak (7/30/90 dagen/volledig archief); statusopties "Goedgekeurd"/"Afgewezen" tonen altijd volledig archief zonder vensterbeperking; stat-kaartlabel gecorrigeerd; params omgezet naar `ListGoedkeuringDashboardParams`.

**Bewijs:** `pnpm --filter @workspace/firevault run typecheck` + `pnpm --filter @workspace/api-server run typecheck` beide groen.

## 2026-07-11 — Governance & Approval Engine — uitbreiding documenttypen (Task #522)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additief; backend engine was al generiek, geen backend wijzigingen nodig)

**Nieuw gebouwd:**
- **Inspecties** (`/inspecties/:id`): `GoedkeuringWidget` toegevoegd na de statusworkflow-knoppen (objectType="inspectie", documentType="inspectie"). Indienen-knop alleen zichtbaar als de inspectie afgerond is.
- **Arbeidsovereenkomsten** (`/personeel/:id`, ContractKaart info-tab): `GoedkeuringWidget` toegevoegd met objectType="arbeidsovereenkomst". Toont het brutosalaris als bedrag. Altijd beschikbaar ongeacht contractstatus.
- **Weekstaten / Urenstaten** (`/uren/weekstaten`, WeekStaatDetailDialog): `GoedkeuringWidget` toegevoegd na de afwijzingsreden-sectie (objectType="weekstaat"). Indienen-knop alleen bij status "ingediend".
- **Opleverrapporten** (`/rapporten`, rapportenlijst): `GoedkeuringWidget` per rapport-item in de actieskolo (objectType="opleverrapport"). Indienen-knop bij conceptrapporten.
- **Certificaten** (`/gebouwen/:id/print`, werkbalk): `GoedkeuringWidget` met objectType="certificaat" toegevoegd naast de bestaande "Certificaat accorderen"-knop. Zichtbaar zodra de certificaat-sectie actief is in de rapportsamensteller. Indienen-knop toont alleen bij definitief rapport vóór accorderen.
- **Projectafsluitingen** (`/opdrachten/:id`): `GoedkeuringWidget` toegevoegd direct onder de projecttitel (objectType="projectafsluiting"). Zichtbaar + indienen-knop alleen als opdrachtstatus "afgerond" is. Klasse `print:hidden` zodat PDF-export niet beïnvloed wordt.
- **Beleidsscherm** (`/beheer/goedkeuringsbeleid`): `DOCUMENT_TYPE_LABELS`-map en `documentTypeLabel()`-helper toegevoegd; de kolommen "Documenttype" in zowel de beleidsregelstabel als de aanvragentabel tonen nu een leesbare Nederlandse naam (bijv. "Arbeidsovereenkomst", "Inspectierapport", "Weekstaat / Urenstaat") in plaats van de ruwe sleutelstring.

**Geen backend wijzigingen:** de goedkeuring-engine is volledig generiek; hij accepteert elk `objectType`-string-pair zonder codebaarheid.

**Bewijs:** `pnpm --filter @workspace/firevault run typecheck` groen; beide workflows draaien; API healthcheck 200.

## 2026-07-11 — Governance & Approval Engine — offertes pilotkoppeling

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additief op bestaande motor + offerte-routes, geen bestaande transitiepaden gebroken)

**Nieuw gebouwd:**
- **Goedkeuringsgate offerte verzenden**: `POST /offertes/:id/verzenden` controleert nu of het goedkeuringsbeleid een formele aanvraag vereist voor dit offertebedrag; bij een openstaand of ontbrekend akkoord blokkeert verzending met HTTP 422 + code `GOEDKEURING_VEREIST`. Dezelfde check is ook in de werkflow-precheck (`concept → verzonden`) gebouwd.
- **Materiële-wijzigingsguard**: een bedragwijziging via `PATCH /offertes/:id` nadat een aanvraag goedgekeurd is, markeert de aanvraag automatisch als "vervangen" (via nieuwe helper `vervangGoedgekeurdeAanvraag` in goedkeuring-engine.ts). Zo kan een offerte nooit in gewijzigde vorm worden verzonden op basis van een verouderd akkoord.
- **Offerte intrekken**: nieuw endpoint `POST /offertes/:id/intrekken` (bevoegdheid offertes:3); reden verplicht; transitie via WorkflowService naar status "ingetrokken". Nieuwe overgang `{ van: ["verzonden","bekeken"], naar: "ingetrokken" }` in offerteConfig. Vanaf "ingetrokken" is heropenen als concept mogelijk.
- **Goedkeuring-tab in Offerte Studio**: nieuw tabblad "Goedkeuring" in `studio.tsx` met de bestaande `GoedkeuringWidget` (objectType="offerte"). Toelichting over het proces en de materiële-wijzigingsregel zijn opgenomen als contextparagraaf. Indienen-knop alleen zichtbaar in concept-status.
- **Statuslabels "ingetrokken"**: toegevoegd aan `STATUS_KLEUR`/`STATUS_LABEL` in `studio.tsx` (leigrijs) en `STATUS_KLEUR` in `index.tsx`.
- **OpenAPI**: `POST /offertes/{id}/intrekken` + schema `OfferteIntrekkenInput` toegevoegd; codegen uitgevoerd → `useIntrekkenOfferte`-hook gegenereerd in `lib/api-client-react`.
- **Engine helpers**: `haalGoedgekeurdeAanvraag(db, objectType, objectId)` en `vervangGoedgekeurdeAanvraag(db, objectType, objectId, actor, reden)` toegevoegd aan goedkeuring-engine.ts en geëxporteerd.

**Hardening reden-verplichting (n.a.v. code review, ronde 1):** twee lagen toegevoegd zodat intrekken zonder reden onmogelijk is: (1) precheck in de `verzonden|bekeken → ingetrokken` workflow-transitie vereist `ctx.params.reden`; (2) expliciete 422-blokkade in `PATCH /offertes/:id` op `status: "ingetrokken"` met verwijzing naar het dedicated `/intrekken`-endpoint.

**Hardening portaal + UI-intrekken-flow (n.a.v. code review, ronde 2):**
- `portaal.ts POST /portaal/:token/ondertekenen`: blokkeert nu ook bij `offerte.status === "ingetrokken"` (409), zodat een ingetrokken offerte nooit meer ondertekend kan worden ongeacht de portaalstatus.
- `studio.tsx`: "ingetrokken" verwijderd uit de generieke status-dropdown (`VOLGENDE_STATUSSEN`). In plaats daarvan een dedicated "Intrekken"-knop (zichtbaar bij verzonden/bekeken, bevoegdheid offertes:3) die een eigen dialoog opent. De dialoog vereist een vrije-tekst reden en roept `POST /offertes/:id/intrekken` aan via de gegenereerde `useIntrekkenOfferte`-hook. Na bevestiging worden de queries geïnvalideerd en toont een toast.

**Hardening gecombineerde PATCH-bypass + bevoegdheids-afstemming (n.a.v. code review, ronde 3):**
- `PATCH /offertes/:id`: blokkeert nu een gecombineerde bedrag+status="verzonden" in één aanroep (422, `GECOMBINEERDE_BEDRAG_STATUS_VERBODEN`). Zo kan een goedkeuringscheck nooit passeren op het oude bedrag terwijl het nieuwe bedrag de goedkeuring al zou invalideren. Volgorde blijft correct: bedrag opslaan (apart PATCH) → hernieuwde goedkeuringsaanvraag indien vereist → verzenden.
- `studio.tsx`: intrekken-knop gated op `kanIntrekken` = `heeftNiveau("offertes", 3)` in lijn met de backend-vereiste.

**Bewijs:** `pnpm run typecheck` groen (alle 5 packages, vier keer — na elke correctieronde); API server herstart zonder fouten.

## 2026-07-11 — Poortwachter (Wet Verbetering Poortwachter) — Bouwstuk 1

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additief, geen bestaande routes geraakt)

**Gebouwd:**
- **DB**: twee nieuwe tabellen — `poortwachter_dossiers` (1:1 aan ziekmelding, cascade-delete) en `poortwachter_mijlpalen` (7 vaste WvP-types per dossier, deadline als text ISO-datum afgeleid van start_datum + dag-offset). DB push geslaagd.
- **7 WvP-mijlpalen** met wettelijke dag-offsets: Probleemanalyse (42), Plan van aanpak (56), UWV-melding langdurig ziekte (294), Eerstejaarsevaluatie (364), Arbeidsdeskundig onderzoek (609), WIA-aanvraag (637), Einde loondoorbetaling (728).
- **Backend** (hrm.ts):
  - `GET /hrm/poortwachter` — alle dossiers met mijlpalen (voor signalering); vereist `personeel:1`.
  - `GET /hrm/ziekmeldingen/:id/poortwachter` — dossier ophalen of idempotent aanmaken met alle 7 mijlpalen; vereist `personeel:1`.
  - `PATCH /hrm/poortwachter/:dossierId/mijlpalen/:type` — mijlpaal afvinken (`afgerond: true/false`) of notitie bijwerken; vereist `personeel:2`. Legt `bijgewerktDoorId` vast.
  - `mijlpaalStatus()` berekent live status: `afgerond` / `buiten_termijn` (< vandaag) / `nadert` (≤ 14 dagen) / `open`.
- **Frontend** (`poortwachter-sheet.tsx`):
  - Sheet met 7 uitvouwbare mijlpaal-rijen; kleurcodering per status (groen/rood/amber/grijs).
  - Kritiek waarschuwingsbanner als er mijlpalen `buiten_termijn` of `nadert` zijn.
  - Per mijlpaal: afvinken, notitieveld met contextplaceholder (bijv. "PvA ondertekend..."), bijgewerkt-door melding.
  - Laadt dossier via `useGetPoortwachterDossier` (auto-aanmaken); muteert via `usePatchPoortwachterMijlpaal`.
- **Integratie personeel/index.tsx**: "Poortwachter"-knop op elke actieve ziekmelding-kaart; opent de sheet.
- **OpenAPI** + codegen: `PoortwachterDossier`, `PoortwachterMijlpaal`, `PoortwachterMijlpaalInput` + 3 paden; codegen + typecheck groen.

## 2026-07-11 — Wagenpark: voertuig-melding in monteur-app + Doorzetten naar garage

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additief; geen bestaande routes gebroken)

**Gebouwd:**
- **Monteur-app menu** — "Voertuig melden" toegevoegd aan het Meer-menu in `menu.tsx` (icoon: car-outline, navigeert naar het bestaande `/voertuig-melding`-scherm).
- **Status `doorgezet_garage`** — nieuw statustype toegevoegd aan the `MeldingStatus`-union in `wagenpark-melding-types.ts`, inclusief label ("Doorgezet naar garage") en kleur (teal).
- **MailSoort `voertuig_melding_garage`** — toegevoegd aan de MailSoort-union in `email.ts`.
- **Backend route `POST /wagenpark/meldingen/:id/doorzetten-garage`** — vereist `wagenpark:2`; haalt meldingdetails op (voertuig + monteur via join), zet status op `doorgezet_garage`, voegt een tijdgestempelde opvolgnotitie toe en stuurt de garage een volledig HTML-e-mailbericht met voertuiginfo, AI-diagnose, omschrijving en optionele FPS-notitie. Mail is fire-and-forget: bij mislukken (of unconfigured) wordt de statuswijziging toch opgeslagen.
- **PATCH geldigeStatussen uitgebreid** — `doorgezet_garage` is nu ook geldig als status-update via het bestaande PATCH-endpoint.
- **MeldingKaart** — "Doorzetten naar garage"-knop zichtbaar bij open meldingen (niet bij `doorgezet_garage`/`opgelost`/`afgewezen_duplicaat`); opent een dialog met e-mailadres (verplicht), garagenaam en extra notitie; na bevestigen: POST naar de nieuwe route, toast-bevestiging, queryInvalidatie voor beide meldingen-querykeys.
- **OpenAPI** — `POST /wagenpark/meldingen/{id}/doorzetten-garage` + `DoorzettenGarageInput`-schema toegevoegd; codegen en typecheck groen.

## 2026-07-11 — Verlof: ziekte-ADV koppeling (automatisch intrekken ADV bij ziekmelding)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additief; geen bestaande routes gebroken, koppeling is fail-safe)

**Gebouwd:**
- **`koppelZiekteAanAdv()`** — nieuwe helper in `hrm.ts`: zoekt alle overlappende ADV/ATV-aanvragen (`hoofdcategorie = 'adv_atv'`, status `aangevraagd` of `goedgekeurd`) die de ziekteperiode overlappen, zet ze atomair op `ingetrokken`, corrigeert het verlofsaldo via de bestaande `pasVerlofSaldoAan`-helper (–aantalUren voor goedgekeurde aanvragen) en schrijft een auditlogregel per aanvraag. Idempotent: al-ingetrokken aanvragen worden overgeslagen.
- **POST /ziekmeldingen** — roept the koppeling automatisch aan na elke nieuwe ziekmelding.
- **PATCH /ziekmeldingen/:id** — roept the koppeling opnieuw aan wanneer `start_datum` of `eind_datum` wijzigt en de melding nog actief is (status ≠ `hersteld`); dit vangt periodewijzigingen op.
- **Fail-safe**: de koppeling omhult zichzelf met een eigen try/catch; een onverwachte fout blokkeert de ziekmelding nooit — hij wordt gelogd en the melding wordt correct opgeslagen.

**Bewijs:** typecheck groen (api-server); herstart zonder fouten.

## 2026-07-11 — Verlof: CAO-presets, automatisch verval en proactieve signalering

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additief; geen bestaande endpoints of schema's gebroken)

**Nieuw gebouwd:**

- **CAO-preset seeder** (`verlofPresets.ts`): idempotente seeder die bij elke api-server-start ontbrekende verlofsoorten (13), feestdagen (33, jaren 2025–2027) en jaarafsluiting-regels (8) toevoegt voor CAO Metaal & Techniek, Bouw & Infra en Geen CAO. Geconfirmeerd via logs: `verlof-presets: seeding voltooid`.

- **Automatisch verlof-verval** (`verlofVervalService.ts`): dagelijkse achtergrondtaak (00:02 nachtelijk, recursive `setTimeout` + `.unref()`) die verlofSaldi met `vervaltOp <= vandaag` en `saldoUren > 0` op nul zet. Resultaat wordt gelogd per medewerker.

- **Proactieve vervalsignalering**: `haalVervalsignalen(dagvenster)` retourneert drie urgentieniveaus — `kritiek` (≤ 14 dagen), `waarschuwing` (≤ 30 dagen), `info` (≤ 90 dagen).

- **API-routes** (`GET /verlof/vervalsignalen`, `POST /verlof/synchroniseer-cao-presets`): respectievelijk voor signaalweergave (personeel lezen) en handmatige sync (alleenBeheerder). OpenAPI-schemas `Vervalsignaal` en `CaoPresetsSyncResultaat` toegevoegd; codegen uitgevoerd.

- **Frontend verlof-overzicht**: de lokale `verlopendeSaldi`-berekening vervangen door de nieuwe `useGetVerlofVervalsignalen`-hook. Drie gescheiden banners with kleurcodering (rood/amber/blauw) op basis van urgentieniveau; elk met naam, verlofsoort, uren en exacte vervaldatum + resterende dagen.

- **Frontend verlof-instellingen**: knop "CAO-presets synchroniseren" (met draai-animatie tijdens laden) toegevoegd naast de jaarselectie. Toont toast met resultaatbericht na succes.

**Bewijs:** api-server herstart — seeder ziet 13 verlofsoorten / 33 feestdagen / 8 regels / scheduler gestart; `GET /api/verlof/vervalsignalen` retourneert 401 (verwacht zonder sessie); typecheck groen (firevault + api-server); Vite HMR bevestigd.

## 2026-07-11 — Medewerker onboarding: automatische verlofsoort-selectie, uren-preview en geboortedatum

- **Medewerker onboarding: automatische verlofsoort-selectie, uren-preview en geboortedatum**
  - **Root bug opgelost**: `VastFormulier` gebruikt nu correct `verlofsoort_ids` via uitgebreide `MedewerkerInput`.
  - **OpenAPI + codegen**: `verlofsoort_ids` en `jaar` toegevoegd aan `MedewerkerInput`.
  - **Server (`POST /medewerkers`)**: roept `maakVerlofprofielAan` aan bij geldige invoer.
  - **Automatische verlofsoort-selectie**: `useMemo` + `useEffect` selecteren automatisch de juiste soorten op basis van CAO/dienstverband.
  - **Uren-preview**: toont pro-rata jaarsaldo op basis van contracturen.
  - **Geboortedatum-veld**: nieuw veld met automatische leeftijdsberekening.
  - **UI-verbeteringen**: "Alles / Geen" knoppen en nette lijstweergave voor verlofsoorten.

- **Governance & Approval Engine — escalatie, bewaking & dashboard**
  - **Deterministische escalatie-bewaking** (`goedkeuringBewaking.ts`): uurlijkse achtergrondtaak voor herinneringen en escalaties via mail.
  - **Vier nieuwe configuratievelden per beleidsregel**: `herinnering_uren`, `escalatie_stap_1_uren/gebruiker`, `escalatie_stap_2_uren/gebruiker`, `max_doorlooptijd_uren`.
  - **goedkeuring_escalaties-tabel**: nieuwe tabel voor audit-trail en deduplicatie van escalaties.
  - **Centraal goedkeuringsdashboard** (`GET /goedkeuring/dashboard`): overzicht van open en recent afgehandelde aanvragen inclusief deadlines en escalatiestatus.
  - **Frontend dashboard** (`/beheer/goedkeuringen-dashboard`): statistieken, filters, escalatiebadges en inline acties.
  - **Beleidsregel-formulier uitgebreid**: configuratie van escalatie-instellingen.
  - **E-mailtype "goedkeuring_escalatie"** toegevoegd aan MailSoort.

**Bewijs:** `pnpm run typecheck` groen; API-server herstart zonder fouten; Vite HMR geladen.


## 2026-07-11 — Governance & Approval Engine — uitbreiding documenttypen (Task #522)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additief; backend engine was al generiek, geen backend wijzigingen nodig)

**Nieuw gebouwd:**
- **Inspecties** (`/inspecties/:id`): `GoedkeuringWidget` toegevoegd na de statusworkflow-knoppen (objectType="inspectie", documentType="inspectie"). Indienen-knop alleen zichtbaar als de inspectie afgerond is.
- **Arbeidsovereenkomsten** (`/personeel/:id`, ContractKaart info-tab): `GoedkeuringWidget` toegevoegd met objectType="arbeidsovereenkomst". Toont het brutosalaris als bedrag. Altijd beschikbaar ongeacht contractstatus.
- **Weekstaten / Urenstaten** (`/uren/weekstaten`, WeekStaatDetailDialog): `GoedkeuringWidget` toegevoegd na de afwijzingsreden-sectie (objectType="weekstaat"). Indienen-knop alleen bij status "ingediend".
- **Opleverrapporten** (`/rapporten`, rapportenlijst): `GoedkeuringWidget` per rapport-item in de actieskolo (objectType="opleverrapport"). Indienen-knop bij conceptrapporten.
- **Certificaten** (`/gebouwen/:id/print`, werkbalk): `GoedkeuringWidget` met objectType="certificaat" toegevoegd naast de bestaande "Certificaat accorderen"-knop. Zichtbaar zodra de certificaat-sectie actief is in de rapportsamensteller. Indienen-knop toont alleen bij definitief rapport vóór accorderen.
- **Projectafsluitingen** (`/opdrachten/:id`): `GoedkeuringWidget` toegevoegd direct onder de projecttitel (objectType="projectafsluiting"). Zichtbaar + indienen-knop alleen als opdrachtstatus "afgerond" is. Klasse `print:hidden` zodat PDF-export niet beïnvloed wordt.
- **Beleidsscherm** (`/beheer/goedkeuringsbeleid`): `DOCUMENT_TYPE_LABELS`-map en `documentTypeLabel()`-helper toegevoegd; de kolommen "Documenttype" in zowel de beleidsregelstabel als de aanvragentabel tonen nu een leesbare Nederlandse naam (bijv. "Arbeidsovereenkomst", "Inspectierapport", "Weekstaat / Urenstaat") in plaats van de ruwe sleutelstring.

**Geen backend wijzigingen:** de goedkeuring-engine is volledig generiek; hij accepteert elk `objectType`-string-pair zonder codebaarheid.

**Bewijs:** `pnpm --filter @workspace/firevault run typecheck` groen; beide workflows draaien; API healthcheck 200.

## 2026-07-11 — Governance & Approval Engine — koppeling verlofaanvragen (drempelwaarde werkdagen)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additief op bestaande motor + verlofworkflow, geen bestaande transitiepaden gebroken)

**Nieuw gebouwd:**
- **`OBJECT_WORKFLOW_ACTIE` uitgebreid** (`goedkeuring-engine.ts`): `verlofaanvraag` toegevoegd. Na volledige goedkeuring voert de motor automatisch de workflow-transitie `aangevraagd → goedgekeurd` uit (inclusief saldo-aanpassing en auditlog) via `viaGoedkeuring: true`.
- **Governance precheck in verlofworkflow** (`workflow-configs.ts`): de transitie `aangevraagd → goedgekeurd` controleert nu of er een actieve beleidsregel is voor documenttype `verlofaanvraag`. De drempel is in werkdagen (`Math.ceil(aantalUren / 8)`). Ontbreekt een goedgekeurde aanvraag terwijl het beleid dat vereist, geeft de transitie een HTTP 422 met uitlegbare foutmelding. Bypass via `viaGoedkeuring: true` (motor heeft al gecontroleerd). `magUitvoeren` ook uitgebreid met `viaGoedkeuring`-bypass zodat the motor niet geblokkeerd wordt door leidinggevende-autorisatie.
- **GoedkeuringWidget op verlofdetail** (`personeel/detail.tsx`): elke verlofaanvraag met status `aangevraagd` toont nu de generieke GoedkeuringWidget (`objectType="verlofaanvraag"`). Widget toont status + goedkeur/afwijs/intrek-acties voor aangewezen goedkeurder, en de "Ter goedkeuring indienen"-knop voor de indiener. Widget-wijzigingen invalideren verlof- en saldoqueries zodat de kaart direct bijwerkt.
- **Betere foutmelding bij geblokkeerd directe goedkeuring**: `beoordeelAanvraag` extraheert nu `body.error` uit het API-antwoord en toont een duidelijke toast "Beoordelen geblokkeerd" met de uitlegbare 422-tekst in plaats van een generieke fout.
- **Beheerscherm bijgewerkt** (`beheer/goedkeuringsbeleid.tsx`): placeholder uitgebreid met "verlofaanvraag"; contextnotitie zichtbaar zodra het documenttype op "verlofaanvraag" staat, die uitlegt dat de drempel is in werkdagen.

**Configuratieinstructie voor beheerder:**
Ga naar Beheer › Goedkeuringsbeleid → Nieuwe beleidsregel. Stel `documenttype = verlofaanvraag`, `ondergrens = 10` (werkdagen), goedkeurder op de directeur in. Verlofaanvragen van meer dan 10 werkdagen (80+ uren) vereisen dan directeursgoedkeuring voordat de leidinggevende de aanvraag kan accorderen.

---

## 2026-07-11 — Governance & Approval Engine — offertes pilotkoppeling

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additief op bestaande motor + offerte-routes, geen bestaande transitiepaden gebroken)

**Nieuw gebouwd:**
- **Goedkeuringsgate offerte verzenden**: `POST /offertes/:id/verzenden` controleert nu of het goedkeuringsbeleid een formele aanvraag vereist voor dit offertebedrag; bij een openstaand of ontbrekend akkoord blokkeert verzending met HTTP 422 + code `GOEDKEURING_VEREIST`. Dezelfde check is ook in de werkflow-precheck (`concept → verzonden`) gebouwd.
- **Materiële-wijzigingsguard**: een bedragwijziging via `PATCH /offertes/:id` nadat een aanvraag goedgekeurd is, markeert de aanvraag automatisch als "vervangen" (via nieuwe helper `vervangGoedgekeurdeAanvraag` in goedkeuring-engine.ts). Zo kan een offerte nooit in gewijzigde vorm worden verzonden op basis van een verouderd akkoord.
- **Offerte intrekken**: nieuw endpoint `POST /offertes/:id/intrekken` (bevoegdheid offertes:3); reden verplicht; transitie via WorkflowService naar status "ingetrokken". Nieuwe overgang `{ van: ["verzonden","bekeken"], naar: "ingetrokken" }` in offerteConfig. Vanaf "ingetrokken" is heropenen als concept mogelijk.
- **Goedkeuring-tab in Offerte Studio**: nieuw tabblad "Goedkeuring" in `studio.tsx` with the bestaande `GoedkeuringWidget` (objectType="offerte"). Toelichting over het proces en de materiële-wijzigingsregel zijn opgenomen als contextparagraaf. Indienen-knop alleen zichtbaar in concept-status.
- **Statuslabels "ingetrokken"**: toegevoegd aan `STATUS_KLEUR`/`STATUS_LABEL` in `studio.tsx` (leigrijs) en `STATUS_KLEUR` in `index.tsx`.
- **OpenAPI**: `POST /offertes/{id}/intrekken` + schema `OfferteIntrekkenInput` toegevoegd; codegen uitgevoerd → `useIntrekkenOfferte`-hook gegenereerd in `lib/api-client-react`.
- **Engine helpers**: `haalGoedgekeurdeAanvraag(db, objectType, objectId)` en `vervangGoedgekeurdeAanvraag(db, objectType, objectId, actor, reden)` toegevoegd aan goedkeuring-engine.ts en geëxporteerd.

**Hardening reden-verplichting (n.a.v. code review, ronde 1):** twee lagen toegevoegd zodat intrekken zonder reden onmogelijk is: (1) precheck in de `verzonden|bekeken → ingetrokken` workflow-transitie vereist `ctx.params.reden`; (2) expliciete 422-blokkade in `PATCH /offertes/:id` op `status: "ingetrokken"` met verwijzing naar het dedicated `/intrekken`-endpoint.

**Hardening portaal + UI-intrekken-flow (n.a.v. code review, ronde 2):**
- `portaal.ts POST /portaal/:token/ondertekenen`: blokkeert nu ook bij `offerte.status === "ingetrokken"` (409), zodat een ingetrokken offerte nooit meer ondertekend kan worden ongeacht de portaalstatus.
- `studio.tsx`: "ingetrokken" verwijderd uit de generieke status-dropdown (`VOLGENDE_STATUSSEN`). In plaats daarvan een dedicated "Intrekken"-knop (zichtbaar bij verzonden/bekeken, bevoegdheid offertes:3) die een eigen dialoog opent. De dialoog vereist een vrije-tekst reden en roept `POST /offertes/:id/intrekken` aan via de gegenereerde `useIntrekkenOfferte`-hook. Na bevestiging worden de queries geïnvalideerd en toont een toast.

**Hardening gecombineerde PATCH-bypass + bevoegdheids-afstemming (n.a.v. code review, ronde 3):**
- `PATCH /offertes/:id`: blokkeert nu een gecombineerde bedrag+status="verzonden" in één aanroep (422, `GECOMBINEERDE_BEDRAG_STATUS_VERBODEN`). Zo kan een goedkeuringscheck nooit passeren op het oude bedrag terwijl het nieuwe bedrag de goedkeuring al zou invalideren. Volgorde blijft correct: bedrag opslaan (apart PATCH) → hernieuwde goedkeuringsaanvraag indien vereist → verzenden.
- `studio.tsx`: intrekken-knop gated op `kanIntrekken` = `heeftNiveau("offertes", 3)` in lijn met de backend-vereiste.

**Bewijs:** `pnpm run typecheck` groen (alle 5 packages, vier keer — na elke correctieronde); API server herstart zonder fouten.

## 2026-07-10 — Governance & Approval Engine — kernmotor + pilot inkoopbon (Task #519)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additieve tabellen/module + één pilot-integratie, generieke motor niet gekoppeld aan bestaande transitiepaden buiten de pilot)

**Nieuw gebouwd:**

## [2026-07-13] Slim Uploaden — drie verbeteringen

### Privacy
- `GET /inbox/items` en `GET /inbox/stats` filteren nu per gebruiker: niet-hoofdbeheerders zien uitsluitend hun eigen uploads; hoofdbeheerder ziet alles.
- `gebruikersTable` geïmporteerd in `inbox.ts`; rol-check via directe DB-query.

### UX — Sheet → Dialog
- Upload-wachtrij verschijnt nu als gecentreerd dialoogvenster (max-w-500px, max-h-85vh) in plaats van een rechterzijpaneel.
- Dialoog opent direct bij het uploaden.

### Vereenvoudiging BeslisScherm
- Meerstappenflow (stap 0/1/2), `actieModus` (direct/later), zekerheidspercentage, vertrouwenslabels, bewijsketen en gevonden-gegevens-tabel volledig verwijderd.
- Nieuw: één scherm met categorie-card (icoon + label + omschrijving), AI-voorstel naam, korte redenering, impact-waarschuwing (alleen midden/hoog), personeelsdossier-selectors, bevestigingscheckbox (hoog impact), "Andere bestemming kiezen" als opvouwbare `<details>`, en één grote bevestigknop.
- Navigatie is altijd "direct" — de tussenliggende keuze "direct vs. later" is niet meer aanwezig.

## [2026-07-13] AI-inkoopcoach — inhoudelijke AI-inkoopadviezen (Task #584)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additieve kolommen + nieuw endpoint; bestaande deterministische signalen ongewijzigd)

**Nieuw gebouwd:**
- `POST /opdrachten/:id/inkoopcoach/advies` (bevoegdheid offertes:2): AI genereert maximaal 6 concrete inkoopadviezen per opdracht (categorieën prijs/leverancier/planning/risico/algemeen) op basis van inkoopplan-regels, bestellingen, matchende jaarprijslijst-artikelen en bekende leveranciers. Slot `"default"` + `max_tokens` (interactief, geen reasoning-slot). Server-side sanering (`saneerInkoopAdviezen`): categorie-whitelist, tekst-clamp, besparing ≥ 0, max 6 items (gelijkgetrokken met de prompt n.a.v. code review).
- Persistentie: `inkoopplannen.ai_adviezen` (jsonb) + `ai_adviezen_op` (timestamp), additief via ALTER. `GET /opdrachten/:id/inkoopcoach` geeft ze terug in het `inkoopplan`-blok.
- Frontend (`inkoopcoach-tab.tsx`): nieuwe kaart "AI-inkoopadviezen" met amber AI-voorstel-styling (Sparkles + badge "AI-voorstel"), genereer-/opnieuw-genereren-knop, categoriebadge, regelverwijzing, indicatieve besparing, generatietijdstip en expliciete disclaimer "Er wordt niets automatisch gewijzigd; u beoordeelt en beslist zelf." Knop uitgeschakeld zonder inkoopplanning met regels.
- Foutpaden: 422 zonder plan/regels, 503 zonder AI-gateway, 502 bij onbruikbaar AI-antwoord; destructieve toast bij falen.
- Drift-fix dev-DB: ontbrekende kolommen `inkoopplan_regels.prijs_bron`/`prijs_geldig_tot` additief toegevoegd (stonden al in het Drizzle-schema).

**Bewijs:** `pnpm run typecheck` groen (alle packages). E2E tegen dev (admin-login + TOTP): GET vooraf `ai_adviezen: []` → POST 200 met 6 gevalideerde adviezen → GET achteraf 6 gepersisteerde adviezen met tijdstip; DB-bewijs `jsonb_array_length(ai_adviezen)=6`; 422-pad bevestigd op opdracht zonder plan.
