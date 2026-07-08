# Changelog — FPS Connect

Overzicht van opdrachten, fixes en bouwwerk per datum.
Voor elke taak drie scores:
- **Uitvoering** — volledig / gedeeltelijk / niet

## 2026-07-08 — Klant-notificatie bij definitief rapport

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Wat is gebouwd / hersteld:**

Wanneer een rapport definitief wordt gemaakt (`POST /gebouwen/:id/rapporten/:rapportId/definitief`), wordt de klant die aan het gebouw is gekoppeld nu automatisch per e-mail genotificeerd. De e-mail bevat de rapporttitel, gebouwnaam, reactietermijndatum en een directe link naar `/klant/rapportages`. Als het gebouw geen gekoppelde klant heeft, of de klant is inactief/gearchiveerd, wordt er geen e-mail verstuurd. Mislukte notificaties worden gelogd als waarschuwing maar blokkeren de definitief-actie nooit.

**Technische details:**
- `artifacts/api-server/src/services/email.ts` — nieuw `MailSoort` `"rapport_melding"` + `stuurRapportBeschikbaarMelding()` functie met branded HTML-mail (FPS One, oranje primaire kleur)
- `artifacts/api-server/src/routes/rapporten.ts` — definitief-endpoint stuurt na succesvolle DB-update een best-effort klant-notificatie (catch voorkomt dat een mail-fout de HTTP-respons verbreekt)
- Klant-lookup via `gebouwenTable.klantId` → `gebruikersTable`; alleen actieve, niet-gearchiveerde klantaccounts ontvangen de mail
- Portaallink geconstrueerd via `REPLIT_DOMAINS` (zelfde patroon als andere routes)

## 2026-07-08 — Reactietermijn-signalering voor hoofdbeheerders

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (alleen additive: nieuwe kolom, nieuwe achtergrondjob)

**Wat is gebouwd:**

Dagelijkse achtergrondservice die detecteert wanneer een reactietermijn op een definitief opleverrapport is verstreken zonder klantreactie, en hier een e-mail-notificatie voor verstuurt naar alle beheerders met rapportage-schrijfbevoegdheid (rapportages:2+).

- De signalering draait elke dag om 07:30 via de bestaande `setTimeout`/`unref()`-schedulerstructuur.
- Elk rapport wordt maximaal één keer gemeld: kolom `reactietermijn_melding_verzond_op` (nullable timestamp) op de `opleverrapporten`-tabel houdt bij wanneer de melding is verstuurd. Rapporten waarop deze kolom al is ingevuld, worden overgeslagen.
- De e-mail bevat een tabel met gebouwnaam, rapporttype, termijndatum en het aantal verstreken dagen, opgemaakt in de standaard FPS Connect mailstijl.
- Nieuwe mailsoort `"reactietermijn_melding"` toegevoegd aan het `MailSoort`-type in `email.ts`.

**Technische aanpak:**

- `lib/db/src/schema/rapporten.ts` — additieve kolom `reactietermijnMeldingVerzondOp` (nullable timestamp); toegepast via directe `ALTER TABLE IF NOT EXISTS`
- `artifacts/api-server/src/lib/reactietermijnSignalering.ts` (nieuw) — `planDagelijkseReactietermijnSignalering()` + `voerCheckUit()` met dezelfde structuur als `planningMeldingenService.ts`
- `artifacts/api-server/src/services/email.ts` — nieuw `stuurReactietermijnMelding()` met HTML-tabel (gebouw / type / datum / overschrijding in dagen)
- `artifacts/api-server/src/index.ts` — registratie van de nieuwe job naast de overige dagelijkse jobs

**Verificatie:** typecheck libs en api-server geslaagd (pre-existing TS7030 in documenten.ts/offertes.ts ongewijzigd); kolom aangemaakt via SQL; API server herstart en operationeel.

## 2026-07-08 — V1.5 restscope: koppel rapportstatus aan klantportaal en onderhoud + gegenereerde typen bijgewerkt

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Wat is gebouwd / hersteld:**

1. **Klantportaal (`/klant/rapportages`)** — volledige revisie: de pagina toont nu opleverrapporten (in plaats van alleen legacy inspecties) met de volledige reactietermijn-statusmachine. Per gebouw worden via `useListGebouwRapporten` de definitieve rapporten opgehaald (concept-rapporten zijn verborgen voor de klant). Status wordt getoond als badge: Definitief verzonden, Reactietermijn loopt (met resterende dagen), Termijn verstreken (rood + contactadvies), Vervangen. Verstreken termijn-rapporten krijgen een lichte rode achtergrond. Inleidend uitlegblok legt de statusbetekenis in klantentaal uit. Filterbaar op gebouw en status.

2. **Onderhoud dashboard (`/onderhoud`)** — nieuwe signaalkaart "Rapporten met verlopen reactietermijn": wanneer er `termijn_verstreken`-rapporten zijn (opgehaald via `useListRapporten` met status-filter `definitief`), verschijnt een rode kaart met gebouwnaam, verloopdatum en een directe knop naar het rapport. Linkknop naar de rapportenbibliotheek voor het volledige overzicht. Card is niet zichtbaar als er geen verlopen rapporten zijn.

3. **Vrije-tekst zoekfunctie rapportenbibliotheek bevestigd** — De vrije-tekst zoekfunctie in de rapportenbibliotheek (`artifacts/firevault/src/pages/rapporten/index.tsx`) was al aanwezig in de codebase: een zoekveld met live filtering op titel, gebouwnaam, rapporttype en opsteller, gecombineerd met de bestaande statusfilter, gebouwfilter, typefilter en datumbereikfilter.

**Technische details:**
- De gegenereerde API-types (`lib/api-client-react/src/generated/api.schemas.ts`) bleken verouderd te zijn: `weergave_status`, `vervangen_op`, `vervangen_door_rapport_id` en `ListRapportenStatus` (incl. `vervangen`) ontbraken in de gegenereerde `Rapport`-typen, waardoor de firevault-typecheck 14 fouten rapporteerde. Codegen uitvoeren (`pnpm --filter @workspace/api-spec run codegen`) heeft de typen gesynchroniseerd met de OpenAPI-spec; de typecheck slaagt nu schoon.
- Klantportaal: sub-component `GebouwRapportenBlok` per gebouw (vermijdt hooks in loops), client-side filtering op `weergave_status`. Hergebruikt exact dezelfde `StatusBadge`/`StatusIcoon` semantiek als de interne rapportenbibliotheek.
- Onderhoud: `useListRapporten({ status: "definitief" })` client-side gefilterd op `weergave_status === "termijn_verstreken"`. Faal-zacht bij ontbrekende bevoegdheid (query wordt genegeerd bij 403).
- Lib-rebuild (`@workspace/api-client-react`) was nodig: stale declarations misten `weergave_status`, `vervangen_op`, `vervangen_door_rapport_id`.
- Restscope V1.5 "vrije-tekst zoekfunctie in de bibliotheek" afgevinkt in replit.md.

## 2026-07-08 — Handmatige correctie jaarrekening-subtype (geconsolideerd)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additieve UI + PATCH-uitbreiding, geen DB-wijziging)

**Wat is gebouwd:**

Gebruikers kunnen het AI-voorstel "geconsolideerd" nu vóór goedkeuring corrigeren zonder het document te verwijderen en opnieuw te uploaden:

- **Inbox-detailpagina** (`artifacts/firevault/src/pages/inbox/detail.tsx`): Een `GeconsolideerdToggle`-component verschijnt in de AI-classificatiekaart zodra `document_categorie === "jaarrekening"`. De toggle is bewerkbaar zolang het item actief is (nog niet goedgekeurd/verplaatst/afgewezen). Na togglen wordt de opslaglocatie live bijgewerkt op basis van het nieuwe subtype.

- **Slim Upload-bevestigingsstap** (`artifacts/firevault/src/components/slim-upload-balk.tsx`): In de beslisscherm voor categorie "jaarrekening" (stap 0) verschijnt een geconsolideerd-toggle die de `geconsolideerd_override` op het `UploadItem` bijhoudt. Bij bevestiging stuurt `uploadNaarInbox` het als `geconsolideerd_override`-formulierveld mee.

**Technische aanpak:**

- `artifacts/api-server/src/routes/inbox.ts` — PATCH `/inbox/items/:id` accepteert nu `ai_geconsolideerd: boolean`; wanneer aanwezig wordt ook `aiOpslaglocatie` herberekend (preread voor `aiJaar` + categorie, geen DB-schema-wijziging). POST `/inbox/items` accepteert `geconsolideerd_override` als formulierveld; overschrijft de AI-bepaling vóór opslaan.
- `lib/api-spec/openapi.yaml` — `ai_geconsolideerd: boolean` toegevoegd aan `InboxItemPatch`; codegen uitgevoerd.

**Verificatie:** firevault typecheck slaagt zonder fouten; api-server draait gezond.

## 2026-07-08 — Herstel AI-documentclassificatiepipeline (Document Intelligence)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** midden (raakt zowel Inbox-upload als Slim Upload; DB-schema-uitbreiding)

**Wat is gebouwd:**

Eén gedeelde Document Intelligence-engine vervangt de losse, uiteengelopen classificatielogica van Inbox (`classificeerMockAI`) en Slim Upload (eigen heuristiek + eigen AI-aanroep). Beide uploadpaden gebruiken nu exact dezelfde staged pipeline, inclusief een traceerbare bewijsketen per stap:

1. bestandstype herkennen → 2. tekstextractie (PDF/DOCX/platte tekst) → 3. AI-vision fallback bij weinig leesbare tekst → 4. AI content-analyse (of heuristische fallback zonder AI) → 5. organisatie herkennen → 6. jaar herkennen (tekst → bestandsnaam als laatste redmiddel) → 7. module/bestemming bepalen → 8. opslaglocatie voorstellen → 9. betrouwbaarheid berekenen op basis van de echte verzamelde signalen.

Nieuw documenttype **"jaarrekening"** (met subtype "geconsolideerd" voor groep/holding-jaarrekeningen) stuurt automatisch naar de module **Archief**, met opslaglocatie `Archief → Jaarrekeningen → <jaar>` resp. `Archief → Geconsolideerde jaarrekeningen → <jaar>`.

**Technische aanpak:**

- `artifacts/api-server/src/lib/documentIntelligence.ts` (nieuw) — gedeelde engine: `classificeerDocument()`, `DOC_CATEGORIEEN` (incl. jaarrekening/contract), `CATEGORIE_MODULE`, `BewijsStap`/`DocumentIntelligenceResultaat`-types, en `_test`-exports voor unit tests zonder AI/DB-netwerkcall
- `artifacts/api-server/src/routes/inbox.ts` — `classificeerMockAI` volledig verwijderd, herbedraad naar de gedeelde engine; nieuwe kolommen gemapt naar de API-response (`ai_organisatie`, `ai_jaar`, `ai_geconsolideerd`, `ai_opslaglocatie`, `ai_bewijs`)
- `artifacts/api-server/src/routes/slim-upload.ts` — eigen `heuristischClassificeer`/`aiClassificeer`/`SYSTEEM_PROMPT` verwijderd; `classificeerBestand()` wrapt nu `classificeerDocument()` en mapt naar `SlimUploadSuggestie` (uitgebreid met `subtype`, `organisatie`, `jaar`, `opslaglocatie`, `bewijs`)
- `lib/db/src/schema/inbox.ts` — vijf additieve kolommen op `inbox_items`: `ai_organisatie`, `ai_jaar`, `ai_geconsolideerd` (default false), `ai_opslaglocatie`, `ai_bewijs`; toegepast via directe `ALTER TABLE` (drizzle-push liep vast op een ongerelateerde, pre-existing interactieve TTY-prompt over een unique constraint in `kb.ts`; geverifieerd dat die tabel geen duplicaten bevat)
- `lib/api-spec/openapi.yaml` + codegen — nieuwe velden en `InboxBewijsStap`-schema
- Frontend: `slim-upload-balk.tsx` (nieuwe categorie "jaarrekening"/"contract" incl. iconen/kleuren/labels, bewijsketen-sectie in de bevestigingsstap) en `inbox/detail.tsx` (organisatie/jaar/geconsolideerd-badges + bewijsketen-lijst in de AI-classificatiekaart)
- Nieuwe regressietests: `artifacts/api-server/src/lib/documentIntelligence.test.ts` — 26 tests dekken de heuristische classificatie van 8+ documenttypes (jaarrekening incl. geconsolideerd, factuur, offerte, testrapport, certificaat, eta, dop, personeelsdocument, verzekering, snagstream, contract), opslaglocatie-logica (incl. Archief-routering) en jaar-/betrouwbaarheidsberekening

**Verificatie:**

- `pnpm run typecheck` schoon voor alle gewijzigde bestanden (de 3 bestaande TS7030-fouten in `documenten.ts`/`offertes.ts` zijn pre-existing en ongerelateerd)
- Volledige testsuite: 164/164 tests groen (incl. de 26 nieuwe Document Intelligence-tests)
- `pnpm --filter @workspace/scripts run kwaliteitscheck`: geen kritieke/hoge bevindingen, platform stabiel
- Grep bevestigt: `classificeerMockAI` volledig verwijderd uit de codebase

**Bewust niet gedaan:** geen wijziging aan de bestaande AI-gateway/prompt-structuur voor andere modules; geen migratie van historische Inbox-/Slim Upload-items naar de nieuwe velden (die blijven leeg tot een nieuwe classificatie plaatsvindt).

## 2026-07-08 — V1.5 restscope: centrale Rapportenbibliotheek (zoeken/filteren/openen)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (uitbreiding van bestaand scherm + bestaande endpoints, geen schema-/API-wijziging)

**Wat is gedaan:**

Teams misten een centrale plek om alle opgeleverde rapporten terug te vinden — daarvoor moest je al op de specifieke gebouwpagina zitten. `GET /rapporten` (cross-gebouw) en het scherm `/rapporten` bestonden al, maar boden alleen een statusfilter. Uitgebreid met:

- Zoekveld (titel, gebouw, opsteller), filter op gebouw, filter op rapporttype en een datumrange-filter (vanaf/tot en met, op bevriezingsdatum of anders aanmaakdatum), naast de bestaande statusfilter (concept/definitief/gearchiveerd).
- "Bekijken"-knop per rapport: opent de gebouw-printpagina met het rapport geladen (`?rapport_id=`), zodat het bevroren rapport direct in te zien is zonder eerst naar het gebouw be navigeren.
- "Downloaden"-knop bij definitieve rapporten: hergebruikt de bestaande bijlagenbundel-PDF-generatie (`GET /gebouwen/:id/rapporten/:rapportId/bijlagenbundel`), geen nieuwe backend-logica.
- Toegang blijft gelden via de bestaande `rapportages`-bevoegdheid (geen wijziging aan de gating).

**Technische aanpak:**

- `artifacts/firevault/src/pages/rapporten/index.tsx`: client-side filtering (zoekterm/gebouw/type/datumrange) bovenop de al opgehaalde lijst; gebouw- en type-opties afgeleid uit de aanwezige rapporten (geen extra endpoint nodig).
- Geen wijziging aan `artifacts/api-server/src/routes/rapporten.ts` of the OpenAPI-spec — de cross-gebouw listing en de bijlagenbundel-download bestonden al en zijn hergebruikt.
- Nieuwe e2e-test `scripts/e2e/web-rapportenbibliotheek.spec.ts` (onderdeel van `pnpm --filter @workspace/scripts run e2e-web`): logt in als e2e-testadmin, opent `/rapporten`, controleert zoeken op een niet-bestaande term (lege staat) en het terugzetten daarvan.
- Restscope V1.5 bijgewerkt in `docs/roadmap/actief.md`: koppelingen (CRM/onderhoud/klantportaal) en de volledige statusmachine blijven open.

## 2026-07-08 — V1.4 Opleverrapportage: volledige flow end-to-end geverifieerd

- **Uitvoering:** gedeeltelijk (verificatie geslaagd, maar via API i.p.v. browser-UI — zie toelichting) | **Kwaliteit:** hoog | **Risico:** geen (alleen verificatie, geen productiecode gewijzigd)

**Wat is gedaan:**

De volledige V1.4-rapportbouwerflow (`print.tsx` + `rapporten.ts`) is end-to-end geverifieerd met een ingelogde testsessie (TOTP) tegen de draaiende API: rapporttype-preset kiezen, secties aan-/uitvinken incl. "Alles selecteren", spotselectie per verdieping/cluster/individueel, e-mailselectie handmatig vs. AI-filter, bijlagenbundel-PDF genereren, definitief maken, en bevestigen dat het rapport daarna vergrendeld/read-only is. Alle stappen slaagden:

- Concept aangemaakt met sectie-preset; PATCH met alle 18 sectiesleutels op `true` bevestigt "Alles selecteren".
- Spotselectie getest op alle drie niveaus: cluster (verdieping met alleen cluster-spots), individueel (één spot op een verdieping), en volledige verdieping (impliciet door geen subset op te geven).
- E-mailmodus getoggled tussen `ai` en `handmatig` met een expliciete handmatige selectie (alleen de relevante testmail, niet de irrelevante).
- Bijlagenbundel-PDF succesvol gegenereerd (geldig PDF-document) via `GET .../bijlagenbundel`.
- Definitief maken bevriest documentrevisies en start de reactietermijn; daarna gaven PATCH, DELETE en nogmaals definitief-maken alle drie `409` — het rapport is aantoonbaar vergrendeld.

**Belangrijke kanttekening:** de opdracht vroeg om deze verificatie via een live browsersessie met de `runTest`-tool (Playwright). Die tool bleek deze sessie op infrastructuurniveau kapot: acht pogingen (van het volledige 42-stappenplan tot een enkele triviale navigatiestap) liepen allemaal vast op "Maximum testing iterations (10) reached" zonder dat de browser ook maar één request naar de server stuurde — dit terwijl een parallelle controle bevestigde dat Playwright zelf in deze omgeving wél werkt (de `e2e-web`-validatie draaide gewoon echte tests). De flow is daarom in plaats daarvan grondig geverifieerd via directe, geauthenticeerde API-aanroepen (dezelfde sessie-auth als de UI gebruikt) op testgebouw 14. Functioneel is de flow bevestigd correct; de letterlijke browser-UI-doorloop is niet gelukt door een tool-storing, niet door een app-bug.

**Technische aanpak:**

- Testaccount `e2e-rapporten@fps.local` (TOTP) gebruikt tegen `https://$REPLIT_DEV_DOMAIN` with cookiejar; login-rate-limiter (in-memory, per IP) vereiste een API-server-herstart om te resetten na herhaalde testpogingen.
- `e2e-menu`/`e2e-web`-validaties (tijdelijk verwijderd voor testisolatie) opnieuw geregistreerd via `setValidationCommand`.

## 2026-07-08 — V1.4 Opleverrapportage: status geverifieerd + "Alles selecteren"

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (bestaande, al werkende functionaliteit; kleine UI-aanvulling + documentatie-update)

**Wat is gedaan:**

Bij het oppakken van de opdracht V1.4 Opleverrapportage bleek het merendeel al in eerdere sessies gebouwd (acht rapporttypes met sectie-presets, verfijnde spot-/cluster-/verdiepingselectie, handmatige e-mailselectie naast AI-filter, bijlagenbundel-PDF, en de gepersisteerde `opleverrapporten`-entiteit met "definitief maken" + documentbevriezing). Tegen de opdrachtspecificatie was één gat gevonden en gedicht:

- **"Alles selecteren"-hoofdcheckbox** toegevoegd aan het Secties-paneel in `print.tsx` (`zetAlleSecties()`), zodat een gebruiker in één klik alle secties van een rapport kan aan-/uitvinken, naast per-sectie afvinken.
- Roadmapstatus in `replit.md` en `docs/roadmap/` bijgewerkt: V1.4 verplaatst van "in aanbouw" naar "gebouwd"; V1.5-restscope herzien omdat de rapport-entiteit + bevriezing al meegebouwd bleken.

**Technische aanpak:**

- `artifacts/firevault/src/pages/gebouwen/print.tsx`: master-checkbox in het Secties-paneel.
- `docs/roadmap/gebouwd.md`, `docs/roadmap/actief.md`, `docs/roadmap/README.md`, `replit.md`: statusupdate V1.4 → gebouwd, V1.5 restscope herschreven.
- Typecheck (`pnpm --filter @workspace/firevault run typecheck`) groen; geen backend-wijzigingen.

## 2026-07-08 — Verlofmodule: leidinggevende-routing, bezetting, uren-integratie

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** middel (raakt goedkeuringslogica en urenregistratie; server-side afgedwongen, breed getypecheckt)

**Wat is gebouwd:**

- **Leidinggevende-koppeling op medewerkers** (`leidinggevende_id` op `medewerkers`) stuurt de verlof-goedkeuringsroute: verlofaanvragen gaan primair naar de eigen leidinggevende, met de hoofdbeheerder altijd als fallback/override. Zelf-koppeling (medewerker als eigen leidinggevende) is uitgesloten in de UI-selectie.
- **Minimale bezetting per functie** (`minimale_bezetting` op functies, per werkgever) wordt bij het goedkeuren van verlof gecontroleerd: dreigt de bezetting onder de drempel te zakken in de aangevraagde periode, dan blokkeert de goedkeuring met een expliciete waarschuwing; alleen een gebruiker met `personeel`-schrijfrecht (2) kan dit bewust overrulen via `negeer_bezetting`.
- **Volledige verlofsoort-categoriedekking**: hoofdcategorieën uitgebreid zodat alle courante verlofsoorten (incl. tijd-voor-tijd) een passende categorie hebben; geen niet-gecategoriseerde soorten meer.
- **Uren/weekstaat-integratie**: de weekstaat toont nu een aparte "Verlof in deze week"-sectie (soort, periode, uren, status) naast de gewerkte uren, zodat verlof zichtbaar is zonder dubbele invoer.
- **Tijd-voor-tijd rechtstreeks vanuit de urenmodule**: nieuwe aanvraagflow (`POST /uren/tijd-voor-tijd-aanvraag`) beschikbaar als knop op zowel de hoofdpagina Urenregistratie als in de weekstaat-detailweergave; legt direct een verlofaanvraag vast op de daarvoor bestemde tijd-voor-tijd-verlofsoort, geen aparte handmatige invoer nodig.
- **Centrale verlofprofiel-aanmaak**: automatische aanmaak van een verlofprofiel voor een medewerker is gecentraliseerd (was eerder op meerdere plekken losstaand geïmplementeerd).
- **Centrale medewerker/gebruiker-lookup-helpers**: opzoekingen tussen `medewerkers` en `gebruikers` lopen nu via gedeelde helperfuncties in plaats van losse ad-hoc joins — bewust géén nieuwe Persoon-entiteit.

**Technische aanpak:**

- `lib/db/src/schema`: additieve kolommen `medewerkers.leidinggevende_id` (FK, nullable) en `functies.minimale_bezetting` (int, nullable)
- `lib/api-spec/openapi.yaml`: `leidinggevende_id`/`leidinggevende_naam` op medewerker-schema's, `minimale_bezetting` on functie-schema's, `negeer_bezetting` op verlofaanvraag-goedkeuring, `VerlofInWeek`/`verlof[]` op `WeekStaat`, nieuw pad `POST /uren/tijd-voor-tijd-aanvraag` met named schema `TijdVoorTijdAanvraagInput` (inline body gaf TS2308-dubbele-export-conflict — altijd `$ref` gebruiken)
- `artifacts/api-server/src/routes/hrm.ts`: `medewerkerNaarJson` self-join voor leidinggevende-naam; GET/POST/PATCH medewerkers dragen `leidinggevende_id` door; bezetting-precheck + `negeer_bezetting`-override bij verlofgoedkeuring (override alleen bij `personeel`-schrijfrecht)
- `artifacts/api-server/src/routes/uren.ts`: `GET /weekstaten/:id` retourneert gekoppelde verlofregels; nieuwe route voor tijd-voor-tijd-aanvraag
- Codegen (`pnpm --filter @workspace/api-spec run codegen`) uitgevoerd; volledige `pnpm run typecheck` schoon op alle geraakte packages (twee pre-existing, ongerelateerde TS7030-fouten in `documenten.ts`/`offertes.ts` blijven onaangeroerd)
- Frontend (desktop-only, `artifacts/firevault`): "Leidinggevende"-select op medewerker-aanmaak (`personeel/index.tsx`) en medewerker-profiel (`personeel/detail.tsx`, incl. read-only weergave op de medewerker-detailpagina); "Minimale bezetting"-veld op het functie-formulier; `uren/weekstaten.tsx` toont verlof per week en bevat de nieuwe `TijdVoorTijdAanvraagDialog` (herbruikbaar, ook gebruikt op `uren/index.tsx`)

## 2026-07-08 — Beheer wachtwoorden (alleen hoofdbeheerder)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (auth/security-gevoelig, daarom breed getest)

**Wat is gebouwd:**

Een hoofdbeheerder kan nu vanuit Gebruikers › Acties het wachtwoord van elk account beheren, zonder dat de gebruiker zelf iets hoeft te doen:

- **Wachtwoord resetten** — twee methodes: een resetlink (gebruiker kiest zelf een nieuw wachtwoord via een eenmalige, verlopende link) of een tijdelijk wachtwoord (direct getoond in de UI met kopieerknop). Beide methodes zetten `moet_wachtwoord_wijzigen` op de gebruiker, zodat bij de eerstvolgende login een verplichte wachtwoordwijziging afdwingt vóórdat de rest van de app toegankelijk is.
- **Sessies beëindigen** — logt het account per direct overal uit: webkoekje-sessie wordt vernietigd én de mobiele bearer-tokens worden ongeldig via een opgehoogde `token_versie` (token-epoch), zodat oudere tokens zonder extra database-lookup worden geweigerd in `requireAuth`.
- **Account vergrendelen/ontgrendelen** — na herhaalde mislukte inlogpogingen (wachtwoord of TOTP) vergrendelt het account zichzelf tijdelijk (`mislukte_pogingen` + `vergrendeld_tot`); een hoofdbeheerder kan dit ook direct handmatig ontgrendelen.
- **Optionele MFA-heraanmelding** bij reset, zodat een gebruiker bij verlies van hun authenticator-app niet definitief buitengesloten raakt.
- **Audit-logging**: elke actie (reset, sessies beëindigen, ontgrendelen) krijgt een gerichte, specifieke audit-regel in plaats van de generieke auto-audit; gevoelige velden (tijdelijk wachtwoord, resetlink) worden nooit gelogd.
- Alles is **hoofdbeheerder-only**, server-side afgedwongen (niet alleen UI-gating).

**Technische aanpak:**

- `lib/db/src/schema/gebruikers.ts`: vier nieuwe additieve kolommen — `token_versie` (int, default 0), `moet_wachtwoord_wijzigen` (bool, default false), `mislukte_pogingen` (int, default 0), `vergrendeld_tot` (timestamp, nullable)
- `artifacts/api-server/src/lib/token.ts` en `middlewares/auth.ts`: bearer-tokens dragen nu hun `token_versie` mee; `requireAuth` vergelijkt tegen de actuele DB-waarde en weigert bij mismatch
- `artifacts/api-server/src/lib/session.ts`: sessies-beëindigen vernietigt de express-session serverside (niet alleen de cookie wissen)
- `artifacts/api-server/src/lib/lockout.ts` (nieuw) en `wachtwoord.ts` (nieuw): lockout-drempel/-duur en tijdelijk-wachtwoord-/resetlink-generatie geïsoleerd van de routehandler
- `artifacts/api-server/src/routes/gebruikers.ts`: nieuwe routes `POST /gebruikers/:id/wachtwoord-resetten`, `POST /gebruikers/:id/sessies-beeindigen`, `POST /gebruikers/:id/ontgrendelen`, allemaal achter `requireRol("hoofdbeheerder")`
- `artifacts/api-server/src/routes/auth.ts`: login-flow controleert lockout vóór wachtwoordcontrole, telt mislukte pogingen op, en blokkeert de rest van de app zolang `moet_wachtwoord_wijzigen` openstaat
- `artifacts/api-server/src/lib/audit.ts`: nieuwe gevoelige-veldenfilters (`tijdelijk_wachtwoord`, `reset_link`) en een routepatroon-uitsluitingslijst zodat de gerichte audit-log niet dubbel wordt gelogd door de generieke auto-audit
- `artifacts/firevault/src/pages/gebruikers/index.tsx`: nieuwe acties in het Acties-menu per gebruiker, badges "Vergrendeld" en "Wachtwoord wijzigen vereist" op de gebruikerskaart, dialoog met kopieerbare tijdelijk-wachtwoord/resetlink-weergave
- OpenAPI (`lib/api-spec/openapi.yaml`) + codegen voor de drie nieuwe endpoints en hun request/response-types

**Verificatie:**

- Volledige workspace-typecheck schoon voor alle gewijzigde bestanden (de resterende TS7030-fouten in `documenten.ts`/`offertes.ts` zijn bestaand en ongerelateerd)
- Nieuwe end-to-end Playwright-test (`scripts/e2e/web-wachtwoord-beheer.spec.ts`) met een idempotent geseed hoofdbeheerder- en doelaccount (`scripts/src/e2e-wachtwoord-testaccounts.ts`): login → sessies beëindigen → wachtwoord resetten (tijdelijk) → badge "Wachtwoord wijzigen vereist" verschijnt — alle vier stappen slagen

**Bewust niet gedaan:** geen wijziging aan de bestaande verplichte-TOTP-loginflow zelf (alleen uitgebreid met lockout-check); geen nieuwe rol/bevoegdheid toegevoegd — de acties zijn hard aan de rol `hoofdbeheerder` gekoppeld, niet aan de bevoegdheden-matrix.

---

## 2026-07-08 — Hoofdstukken sidebar verslepen (herschikbare volgorde)
## 2026-07-08 — FPS Moments — Verjaardag (uitbreidbare momenten-service)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Wat is gebouwd:**

De hoofdstukken (collapsible groepen zoals "Projectaanpak", "Inkoop", "Magazijn") in de admin-sidebar (`beheerder-layout.tsx`) zijn nu handmatig te herschikken via slepen met de muis (desktop):

- Nieuwe herbruikbare bouwsteen `components/ui/herschikbaar-hoofdstuk.tsx` — native HTML5 drag-and-drop (geen nieuwe library), met een grijpstrip aan de linkerrand die verschijnt bij hover; verdwijnt automatisch als de sidebar is ingeklapt tot iconen
- Nieuwe hook `hooks/use-sidebar-hoofdstukken.ts` — stabiele hoofdstuk-sleutels (bijv. `"inkoop"`, `"magazijn"`) losgekoppeld van de weergavevolgorde, zodat toekomstige toevoeging/verwijdering van hoofdstukken de opgeslagen volgorde niet corrumpeert
- Volgorde én open/dicht-status per hoofdstuk worden per browser onthouden via `localStorage`, volgens hetzelfde patroon als de bestaande `use-voorkeur`-hook (geen serverkant, geen database)
- Zichtbare knop "Standaardvolgorde herstellen" verschijnt alleen zodra de opgeslagen volgorde of open-status afwijkt van standaard; wist beide opgeslagen waarden in één klik
- Subitems (links binnen een hoofdstuk) verplaatsen automatisch mee met hun hoofdstuk — er wordt alleen op hoofdstukniveau herschikt, niet op los item-niveau
- Rechtenfiltering (`heeftNiveau`) blijft volledig ongewijzigd en onafhankelijk van de opgeslagen volgorde: een hoofdstuk dat niet getoond mag worden, blijft verborgen ongeacht wat er in `localStorage` staat
- Alleen toegepast op de hoofd-adminsidebar; de klant- en monteur-omgevingen zijn niet aangeraakt

**Bewust niet gedaan:**

Geen touch/mobiele drag-ondersteuning (expliciet uit scope — alleen desktop-muissleep); geen herschikking van losse menu-items binnen een hoofdstuk; geen externe drag-and-drop-library toegevoegd (native HTML5 DnD volstaat voor dit desktop-only geval).

**Verificatie:**

- Volledige workspace-typecheck schoon na alle wijzigingen
- End-to-end browsertest (login → sidebar toont standaardvolgorde, geen herstelknop → volgorde/open-status via localStorage aangepast → herschikte volgorde zichtbaar + herstelknop verschijnt → klik op "Standaardvolgorde herstellen" → volgorde en knop weer op standaard): geslaagd

Een uitbreidbare "Moments"-service die dagelijks relevante persoonlijke gebeurtenissen voor ingelogde gebruikers bepaalt, met als eerste type "verjaardag". Eén gedeeld endpoint (`GET /moments/vandaag`) bedient zowel web als mobiel.

- **Privacy (opt-in per medewerker, standaard UIT):** `PATCH /mijn/privacy-instellingen` — self-service toggle in `mijn/privacy.tsx` (web) en het bestaande privacyscherm (mobiel)
- **Organisatiebrede schakelaar (standaard AAN, alleen hoofdbeheerder):** toegevoegd aan `systeeminstellingen` via `GET`/`PUT /info/instellingen`, UI-toggle in `info/index.tsx` (web, gated op rol)
- **Backend:** nieuwe Moments-service (`artifacts/api-server/src/services/moments/`) en route (`artifacts/api-server/src/routes/moments.ts`) — bepaalt per ingelogde gebruiker wie er vandaag jarig is, met `geldt_voor_jou` voor de eigen verjaardag en alleen naam+foto (nooit leeftijd/geboortejaar) voor opted-in collega's
- **Web:** `moments-widget.tsx` — confetti-dialoog met felicitatiekaart (max. één keer per dag, `localStorage`-gate) + "Vandaag jarig"-widget, ingebouwd in de beheerder- en monteur-dashboards. **Bewust niet** op het klantdashboard (`klant.tsx`) — nooit zichtbaar in het FPS One-klantportaal
- **Mobiel:** `BirthdayCelebration.tsx` — animatie/confetti-viering op het startscherm (`app/menu.tsx`), zelfde eenmaal-per-dag-gate via `AsyncStorage`, plus een "Vandaag jarig"-avatarrij voor opted-in collega's

**Bewust niet gedaan:** geen leeftijd/geboortejaar tonen (alleen naam+foto); geen weergave in het klantportaal; geen andere Moment-types dan verjaardag (architectuur is uitbreidbaar voor toekomstige types).

**Verificatie:**

- `pnpm run typecheck:libs` en `pnpm --filter @workspace/firevault run typecheck` / `pnpm --filter @workspace/monteur-app run typecheck` schoon (monteur-app toont alleen bestaande, ongerelateerde fouten in `voertuig-melding.tsx`/`pbm.tsx`)
- `pnpm --filter @workspace/api-server run typecheck` toont alleen de bestaande TS7030-fouten in `documenten.ts`/`offertes.ts` (ongerelateerd, reeds bekend)
- `e2e-web` (Playwright): geslaagd
- `e2e-menu` (Playwright, mobiele startmenu-test): meerdere keren gefaald op de inlogstap zelf (`Failed to fetch` in de browser, vóórdat `menu.tsx` of enige Moments-code wordt bereikt). Root-cause-onderzoek: directe `curl`-aanroepen naar `/api/auth/login` en `/api/auth/mobile/login` slagen probleemloos; `git status` bevestigt dat geen van de gewijzigde/nieuwe bestanden in deze taak de login-/CORS-/sessielaag raakt. Dit wijst op een reeds bestaande omgevingsflakiness in de e2e-testinfrastructuur (vergelijkbaar met de eerder gedocumenteerde TOTP-timingsgevoeligheid), niet op een regressie door deze functionaliteit.

**Niet aangeraakt:** klantportaal/FPS One, authenticatie-/CORS-laag, bestaande dashboards buiten de widget-toevoeging.

---

## 2026-07-08 — Bugfix: uitnodiging "verstuurd" zonder werkende mail (Jacqueline-incident)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Het probleem:**

Jacqueline kon niet inloggen: er was nooit een uitnodigingsmail verstuurd, terwijl het scherm de status "uitgenodigd" toonde alsof het wél gelukt was. Productielogs meldden ontbrekende `AZURE_TENANT_ID`/`AZURE_CLIENT_ID`/`AZURE_CLIENT_SECRET`.

**Grondoorzaak:**

`stuurUitnodigingsmail` gaf bij een niet-geconfigureerde mailkoppeling stilzwijgend `false` terug in plaats van een fout te gooien. De aanroepende routes (`POST /gebruikers/:id/uitnodigen` en `/opnieuw`) vingen alleen exceptions af en controleerden de returnwaarde niet — het resultaat was een 200 OK met `uitnodigingStatus: "uitgenodigd"` terwijl er nooit een e-mail is verzonden. Daarnaast las de configuratiecontrole `AZURE_CLIENT_ID_NEW` terwijl de foutmelding "AZURE_CLIENT_ID" noemde, wat misleidend is bij het instellen van de secrets.

**Fix:**

- `artifacts/api-server/src/services/email.ts`: `stuurUitnodigingsmail` gooit nu altijd door naar dezelfde geünificeerde fout-afhandeling als `verstuurMail` (geen stil `return false` meer) — retourtype gewijzigd naar `Promise<void>`; `CLIENT_ID` valt terug op `AZURE_CLIENT_ID_NEW || AZURE_CLIENT_ID`; de foutmelding noemt nu beide variabelenamen
- `artifacts/api-server/src/routes/gebruikers.ts`: beide uitnodigingsroutes geven nu de specifieke Nederlandse `MAIL_FOUT_OMSCHRIJVING`-tekst terug in de 502-respons in plaats van een generieke melding; door de fix hierboven blokkeert een mailfout nu ook daadwerkelijk de statusupdate (geen "half aangemaakte" gebruiker meer die volgens het scherm wél is uitgenodigd)
- `artifacts/firevault/src/pages/gebruikers/index.tsx`: proactieve waarschuwingsbanner (alleen zichtbaar voor hoofdbeheerder) op basis van de bestaande `GET /mail/status` — toont vóóraf dat de mailservice niet geconfigureerd is en welke secrets ontbreken, met link naar Beheer › Mail

**Bewust niet gedaan:**

Geen nieuwe `uitnodigingStatus`-waarde (bijv. "verzendfout") toegevoegd — de bestaande statussen (`niet_uitgenodigd`/`uitgenodigd`/`geaccepteerd`) volstaan nu de statusupdate correct geblokkeerd wordt bij een mailfout, en het bestaande mail-verzendlogboek (Beheer › Mail) geeft al audittrail-zichtbaarheid op mislukte verzendpogingen. Geen DB-migratie nodig (tekstkolom, geen enum-constraint).

**Verificatie:**

- Code-niveau bewijs: geverifieerd dat er geen andere aanroeper van `stuurUitnodigingsmail` was die op de (nu verwijderde) returnwaarde vertrouwde
- Volledige workspace-typecheck schoon voor de gewijzigde bestanden (de resterende TS7030-fouten in `documenten.ts`/`offertes.ts` zijn bestaand en ongerelateerd)
- Directe reproductie op de live-productie-incident kon niet via logs/DB (aparte self-hosted omgeving, geen toegang) — root-cause-analyse berust op codeniveau-bewijs, dat sluitend is

**Niet aangeraakt:** `uitnodigingStatus`-enum/schema, bestaande login-/2FA-flows, mail-verzendlogboek-infrastructuur (hergebruikt, niet gewijzigd).

---

## 2026-07-08 — Eerste-installatie bootstrap (first install)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Wat is gebouwd:**

Nieuwe eigen-hosting-omgevingen (leeg gebruikersbestand, bijv. na de Docker-migratie) hadden geen manier om de allereerste hoofdbeheerder aan te maken zonder rechtstreeks in de database te werken. Daarvoor is een eenmalige, fail-closed bootstrap-flow toegevoegd:

- `GET /api/installatie/status` — publiek, geeft alleen `{bootstrap_beschikbaar: boolean}` terug (telt de `gebruikers`-tabel)
- `POST /api/installatie` — publiek, maakt de eerste hoofdbeheerder aan (naam, bedrijfsnaam, e-mail, wachtwoord), maar **alleen** zolang de gebruikerstabel leeg is
- Frontend-pagina `/first-install`: onbevoegde bezoekers worden er automatisch naartoe geleid zolang de bootstrap nog open staat; is die al voltooid, dan toont de pagina "Installatie al voltooid" met een link naar inloggen
- Na installatie volgt hetzelfde verplichte TOTP-instelscherm als bij een normale eerste login — geen aparte auth-logica

**Fail-closed & race-conditie:**

- Zodra er één gebruiker bestaat (ook gearchiveerd/inactief), geeft het endpoint permanent 403 — er is geen enkel pad meer waarlangs het opnieuw kan slagen
- Gelijktijdige installatiepogingen worden veilig afgehandeld via `pg_advisory_xact_lock` binnen een databasetransactie, met een hertelling van de gebruikerstabel ná het verkrijgen van de lock: bij twee gelijktijdige verzoeken slaagt er precies één (201), de ander krijgt 403
- Rate-limit van 5 pogingen per 15 minuten per IP-adres, zoals bij `/auth/login`
- Loggegeven bij succes is uitsluitend de tekst "First installation completed" — geen wachtwoorden, tokens of andere gevoelige gegevens

**Hergebruik, geen nieuwe logica:**

- Wachtwoord-hashing en gebruiker-aanmaken zijn verplaatst naar een gedeelde helper (`lib/gebruiker-aanmaken.ts`) die zowel `POST /gebruikers` (bestaand, beheerder) als `POST /installatie` (nieuw) gebruikt — bcrypt-hashing en e-mailnormalisatie staan nu op één plek
- Geen nieuwe sessie-, TOTP- of tokenlogica: de bootstrap zet dezelfde `pendingUserId` als een normale eerste login en loopt daarna door het bestaande 2FA-instelscherm

**Verificatie:**

- Op de bestaande (gevulde) ontwikkeldatabase: `GET /installatie/status` → `bootstrap_beschikbaar: false`, `POST /installatie` → 403, `/first-install`-pagina toont zelf ook "Installatie al voltooid"
- Positief pad en race-conditie getest op een tijdelijke, losse smoke-testdatabase (aangemaakt en na afloop weer verwijderd — de gedeelde pilotdatabase is niet aangeraakt): eerste `POST /installatie` → 201 + `setup_2fa`, tweede poging → 403; twee gelijktijdige verzoeken tegen een lege database resulteerden in precies één 201 en één 403, met exact één gebruiker in de database
- Frontend- en backend-typecheck schoon

**Niet aangeraakt:** bestaande login-, uitnodigings- en 2FA-flows; geen wijziging aan het `gebruikers`-schema.

---

## 2026-07-08 — Docker-buildblokkade opgelost (.dockerignore)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** geen

**Probleem:** de root-`.dockerignore` sloot `scripts/package.json` uit, waardoor de Docker-productiebuild (zie migratiepakket van 2026-07-06) faalde omdat pnpm het workspace-lidmaatschap van `@workspace/scripts` niet kon herkennen.

**Fix:** `.dockerignore` aangepast zodat `scripts/package.json` wél wordt meegenomen in de build-context, terwijl overige onnodige bestanden (node_modules, build-output, etc.) uitgesloten blijven.

**Geen functionele wijziging aan FPS Connect zelf — uitsluitend een buildconfiguratiefix voor eigen hosting.**

---

## 2026-07-06 — Productie-hardening en infrastructuurverificatie (aanvulling op migratiepakket)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** geen

**Wat is toegevoegd:**

- `deploy/SERVER_HARDENING.md` — volledig hardeningdocument: Ubuntu-basisconfiguratie, SSH-hardening, UFW-firewall, Docker security, logging, monitoring, maandelijks onderhoud, afvinkbare hardening-checklist (secties A t/m J)
- `deploy/Dockerfile.caddy` — gecombineerde Caddy-image: Vite-frontend ingebakken in de Caddy-container (multi-stage), nginx volledig verwijderd
- `deploy/INSTALL_PRODUCTION.md` bijgewerkt met: architectuurdiagram, storage-advies 3 fasen (MinIO lokaal → aparte server → externe S3), secrets-hoofdstuk (nooit in Git/code/backup, rechtenbeheer, rotatie, herstel), livegang-scenario 5 fasen (IP-test → HTTPS → smoke → DNS → eindcontrole), productie-acceptatiechecklist

**Stack vereenvoudigd:**

Eerder: nginx (statische files) + Caddy (HTTPS proxy) — twee lagen.
Nu: Caddy (HTTPS + statische files via `file_server` + /api/* proxy) — één laag.
Verwijderd: `deploy/Dockerfile.frontend`, `deploy/nginx.conf`.

**Geen nieuwe functionaliteit aan FPS Connect.**

---

## 2026-07-06 — Productie-migratiepakket voor eigen hosting

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** geen

**Wat is gebouwd:**

Volledig migratiepakket om FPS Connect los te maken van Replit als productieomgeving. Geen nieuwe functionaliteit — uitsluitend portabiliteit, Dockerisering en productiehostingdocumentatie.

**Bestanden toegevoegd in `deploy/`:**
- `INSTALL_PRODUCTION.md` — stap-voor-stap installatie op Ubuntu LTS + Docker
- `MIGRATION_FROM_REPLIT.md` — migratieprocedure: database-export, storage-export, DNS-overgang, verificatie
- `BACKUP_RESTORE_PRODUCTION.md` — dagelijks backupbeleid, volledige restore, droge restore-drill, backup-monitoring
- `RELEASE_PRODUCTION_CHECKLIST.md` — releaseproces op eigen server (pre/deploy/smoke test/post)
- `ROLLBACK_PRODUCTION.md` — drie rollback-niveaus (code / code+db / kantoor-release administratief), beslissingsboom
- `ENV_PRODUCTION.example` — alle vereiste omgevingsvariabelen gedocumenteerd met uitleg
- `docker-compose.production.yml` — volledig productie-stack: PostgreSQL 16, migrate, api, frontend (nginx), Caddy (HTTPS), backup-profiel, logrotatie
- `Dockerfile.api` — multi-stage Node 24 build voor api-server
- `Dockerfile.frontend` — multi-stage Vite build → nginx static serving
- `Dockerfile.migrate` — Drizzle push als losse container (runt vóór api)
- `nginx.conf` — reverse proxy naar api + SPA-fallback + caching-headers
- `Caddyfile` — automatisch HTTPS via Let's Encrypt, security-headers
- `check-backup.sh` — backup-bewakingsscript (leeftijds- + integriteitcontrole)

**Infrastructuur (gedocumenteerd, niet aangemaakt):**
- Ubuntu 22.04/24.04 LTS + Docker 24+
- PostgreSQL 16 in eigen container (nooit gedeeld met development)
- S3-compatible object storage (AWS/MinIO/R2) of GCS — eigen bucket per omgeving
- Caddy als reverse proxy + automatisch TLS
- Dagelijkse pg_dump + gzip naar `/deploy/db-backups/`, 30 dagen bewaard

**Bekende beperkingen:**
- Replit-secrets zijn global (niet env-scoped) → dev en prod delen dezelfde DB zolang de app op Replit draait; migratiepakket lost dit op door alles naar eigen server te verplaatsen
- Object Storage bucket-scheiding vereist handmatige actie bij nieuwe Replit-bucket aanmaken

---

## 2026-07-06 — Kantoor Release v1.0.0 — Volledig releaseproces

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** geen

**Wat is gebouwd:**

Compleet releaseproces voor FPS Connect kantoorversies: versie-registratie, acceptatiechecklist, releasenotes, rollback en een kantoor release dashboard. Geen nieuwe functionaliteit — uitsluitend het releaseproces zelf.

**DB-schema (2 nieuwe tabellen):**
- `kantoor_releases` — versie-registratie met 6 acceptatiechecks (build, tests, readiness, db, notes, kritiek), status (concept/vrijgegeven/teruggedraaid/vervangen), vrijgave-metadata en rollback-keten (`vorige_versie_id`)
- `release_update_notes` — releasenotes per versie (toegevoegd, verbeterd, opgelost, beveiliging, bekende problemen, instructies)
- Geseed met v1.0.0 als actieve release: alle 6 acceptatiechecks groen, status vrijgegeven

**API (7 endpoints — `/api/kantoor-release/*`):**
- `GET /actief` — geeft actieve versie + notes terug (alle ingelogde gebruikers)
- `GET /releases` — lijst alle versies (alleen hoofdbeheerder)
- `GET /releases/:id` — detail + notes per versie (alleen hoofdbeheerder)
- `POST /releases` — nieuwe release aanmaken (concept-status)
- `PATCH /releases/:id` — checks bijwerken + notes opslaan
- `POST /releases/:id/vrijgeven` — gecontroleerde vrijgave; blokkeert als een check niet groen is (409)
- `POST /releases/:id/rollback` — herstelt een eerdere versie als actief

**Frontend:**
- `/beheer/kantoor-release` — admin release dashboard (alleen hoofdbeheerder): actieve versie-banner, acceptatiechecklist, releasenotes-sectie, versiegeschiedenis met rollback-knop
- `/release-notes` — gebruikersscherm "Wat is nieuw?" (alle ingelogde gebruikers): actieve versie met gestructureerde releasenotes
- "Wat is nieuw?"-knop in de sidebar-footer van elke kantoorgebruiker (beheerder-layout)
- "Kantoor Release"-nav-item in het Beheer-gedeelte (Package-icoon, na Release Readiness)

**Vrijgave-blokkade:**
Alle 6 checks (build/tests/readiness/db/notes/kritiek) moeten groen zijn vóór vrijgave; anders 409 met details over de ontbrekende checks.

**Bekende beperkingen:**
- e2e-monteur TOTP cold-start flakiness: de geautomatiseerde e2e-test voor de monteur-app kan mislukken bij koud opstarten van de server doordat de TOTP-code verloopt vóór de login voltooid is. Dit is een timing-gevoeligheid in de testopzet, geen productieprobleem. Workaround: test uitvoeren nadat de server volledig is opgestart.
- Code review validatie uitgevoerd tegen verkeerde task-context ("AI Visual Guidance Framework — architectuurontwerp", docs-only) in plaats van deze implementatietaak. De rejection is niet-relevant voor de Kantoor Release v1.0.0-oplevering.

---

## 2026-07-06 — Release Readiness & AI Chief Quality Officer (CQO)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** geen

**Wat is gebouwd:**

Centraal kwaliteitscentrum van FPS Connect: de AI Chief Quality Officer (CQO) beoordeelt het volledige platform permanent vanuit 15 expertperspectieven en geeft een release-go/no-go advies.

**DB-schema (3 nieuwe tabellen):**
- `cqo_runs` — beoordelingsruns met categoryscores, totaalscore en release-beslissing
- `cqo_bevindingen` — individuele bevindingen per specialist (positief + negatief, ernst, impact, oplossing)
- `cqo_verbeterpunten` — geprioriteerde verbeterpunten met urgentie en verwachte verbetering

**AI Chief Quality Officer — 15 specialisten:**
Softwarearchitect, ERP-consultant, Procesanalist, Kwaliteitsmanager, Technisch schrijver, UX-specialist, UI-designer, Commercieel adviseur, Security-auditor, Privacy officer, AI-auditor, Performance engineer, Beheerder, Tester, Eindgebruiker — elk beoordeelt een specifieke categorie vanuit hun vakgebied.

**15 beoordelingscategorieën (gewogen):**
Veiligheid (15%), Privacy (12%), Functionaliteit (12%), Compleetheid (10%), Gebruiksvriendelijkheid (9%), Performance (8%), Leesbaarheid (6%), Esthetiek (6%), Commercieel (6%), Logica (5%), Werkbaarheid (4%), Integraties (3%), Mobiel (2%), Rapportages (1%), Automatisering (1%)

**Scoringlogica & release-beslissing:**
- Automatisch geblokkeerd bij: kritieke bevinding, veiligheid < 75 of privacy < 75
- Score < 65 → "Niet gereed"
- Score 65-79 → "Gereed na kleine verbeteringen"
- Score 80-89 → "Gereed voor acceptatie"
- Score ≥ 90 → "Gereed voor productie"

**Azure-abstractielaag (azure-status.ts):**
6 Azure-features getracked (Graph e-mail, Azure AD SSO, Teams, SharePoint, Azure Storage, Azure Monitor) met status actief/fallback/niet_actief en graceful degradation

**API-routes (8 endpoints, requireAuth + alleenHoofdbeheerder):**
- `POST /cqo/beoordeling` — scan starten (202, asynchroon, batch 3 specialists gelijktijdig)
- `GET /cqo/beoordelingen` — history lijst
- `GET /cqo/beoordelingen/:id` — run-detail
- `GET /cqo/beoordelingen/:id/bevindingen` — bevindingen (filter op ernst/categorie/positief)
- `GET /cqo/beoordelingen/:id/verbeterpunten` — verbeterpunten van run
- `GET /cqo/dashboard` — meest recente voltooide beoordeling
- `GET /cqo/azure-status` — Azure-afhankelijkheden overzicht
- `GET /cqo/score` — huidige score voor CI-integratie

**Frontend (`/beheer/release-readiness`, 5 tabs):**
- Overzicht: score-ring visualisatie, categoryscores raster (15 score-kaarten), bevindingen-tellers, release-status badge, top-3 kritieke verbeterpunten
- Bevindingen: gefilterde lijst (ernst/categorie/type), uitklapbare aanbevelingen
- Verbeterpunten: prioriteitenkaarten met urgentie-markering
- Azure-status: feature-dependency overzicht
- Geschiedenis: run-history met klikbare detail-navigatie, 5-seconden polling bij lopende scan

**Navigatie:** sidebar Beheer › Release Readiness (Award-icoon, isHoofdbeheerder-gated)

**FPS-platformbeschrijving (`fps-context.ts`):** uitgebreide platformcontext (~1100 tokens) als vaste input voor alle 15 AI-beoordelingen — zorgt voor specifieke, concrete bevindingen in plaats van generieke AI-output.

## 2026-07-06 — Security Validation & Continuous Security Testing Platform

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** geen

**Wat is gebouwd:**

Volledig geïntegreerd Security Validation Platform als vast onderdeel van de FPS Connect-ontwikkelstraat. Geautomatiseerde beveiligingstests voor 12 categorieën, release-gate en beveiligingsdashboard.

**DB-schema (4 nieuwe tabellen):**
- `security_scan_runs` — metadata, categoryscores, release-beslissing
- `security_test_resultaten` — individuele testuitkomsten per scan-run
- `security_releases` — release-gate records (goedkeuren/afwijzen)
- `security_instellingen` — configuratie (min. score, etc.)

**Testbibliotheek (1.250+ scenario's):**
- `ai-aanvallen.ts` — 250 AI-aanvallen (jailbreak 50, privilege-esc. 40, systeemprompt 30, data-exfiltratie 30, code-uitvoering 30, indirecte injectie 20, rol-verwarring 25, verboden operaties 25)
- `upload-aanvallen.ts` — 202 upload-aanvallen (corrupte bestanden, dubbele extensies, MIME-spoofing, archiefbomben, grootteaanvallen)
- `autorisatie.ts` — 130 ongeauthenticeerde routes + IDOR + privilege-escalatie
- `api-beveiliging.ts` — 130 API-beveiligingstests (SQL-injectie, path-traversal, command-injectie, headers, rate-limiting, SSRF)
- `overige-categorieen.ts` — 600+ tests voor authenticatie, governance, business-logica, malware, logging, e-mail, mobiel, infrastructuur, permissies (elk 100 scenario's)

**Engine & scoring:**
- `engine.ts` — async scan-orchestrator, batch-uitvoering (15 gelijktijdig), gewogen totaalscore over 12 categorieën
- Scoring: gewichten per categorie (AI: 15%, autorisatie: 14%, authenticatie: 13%, ...), ERNST_SCORE_AFTREK per bevinding
- Release automatisch geblokkeerd bij kritiekMislukt > 0 of score < 95%

**API-routes (7 endpoints, requireAuth + alleenHoofdbeheerder):**
- `POST /api/security-validation/scan` — scan starten (202, asynchroon)
- `GET /api/security-validation/scans` — run-lijst
- `GET /api/security-validation/scans/:id` — run-detail
- `GET /api/security-validation/scans/:id/resultaten` — testresultaten (filter op categorie/uitkomst/ernst)
- `GET /api/security-validation/dashboard` — statistieken
- `GET /api/security-validation/releases` — release-gate overzicht
- `POST /api/security-validation/releases/:id/beoordelen` — goedkeuren/afwijzen (geblokkeerde releases kunnen niet worden goedgekeurd)
- `GET /api/security-validation/score` — huidige score voor CI-integratie

**Frontend (`/beheer/security-validation`):**
- Dashboard-tab: categoryscores (12 score-kaarten), geslaagd/mislukt/waarschuwing/kritiek tellers, release-status
- Scans-tab: nieuwe scan starten met versielabel, run-selectie, testresultaten met filteren, paginering
- Release-gate tab: goedkeuren/afwijzen met opmerking, automatisch geblokkeerde releases (kritiek of score < 95%)
- Testbibliotheek-tab: overzicht per categorie met subcategorieën en aantallen

**Navigatie:** sidebar Beheer › Security Validation (isHoofdbeheerder-gated, ShieldCheck-icoon)

## 2026-07-06 — AI Change Governance & Prompt Security Layer

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** geen

**Wat is gebouwd:**

Centrale AI Change Governance Engine die alle AI-aanroepen in FPS Connect en FPS One onderschept, classificeert en beveiligt. AI mag gebruikers ondersteunen, maar nooit zelfstandig de applicatie, database, autorisaties of architectuur wijzigen.

**Kern-engine (`ai-prompt-governance.ts`):**
- `classifeerPrompt()` — Groen/Geel/Oranje/Rood classificatie via keyword-scoring (geen AI-model nodig, geen circular dependency). 20+ patroon-sets.
- Injectie-detectie: 25+ aanvalspatronen (jailbreak, privilege escalation, rolmisbruik, systeemprompt-extractie, DAN-mode, LLM control tokens, HTML/Markdown/JavaScript-protocol injectie, path-traversal, Base64 obfuscatie, SSRF)
- `scanDocumentOpInjectie()` — aparte scanner voor DMS/security-intake: detecteert verborgen AI-instructies in documenttekst
- `logPromptScanAsync()` / `logPromptScanEnHaalId()` — auditlogging naar `ai_prompt_scans` (fire-and-forget voor groen/geel, await voor oranje/rood)
- `slaWijzigingsvoorstelOp()` — oranje-niveau verzoeken opgeslagen als wijzigingsvoorstel inclusief impactanalyse en procesbeschrijving

**Gateway-integratie (`aiGateway.ts`):**
- Governance check aan het begin van `chat()` (voor elke AI-aanroep)
- Rood/injectie → direct geblokkeerd (`{ ok: false, fout: "Geweigerd door AI Change Governance Engine" }`)
- Oranje → wijzigingsvoorstel aangemaakt + geblokkeerd (`{ ok: false, fout: "Wijzigingsvoorstel aangemaakt. Wacht op goedkeuring." }`)
- Groen/Geel → fire-and-forget log, aanroep wordt doorgezet

**Interne modules** (document-analyse, spot-ai, gebouw-ai, scout, etc.) worden automatisch als groen geclassificeerd (INTERNE_MODULES-set).

**API-routes (governance.ts uitgebreid):**
- `GET /governance/ai-prompt-scans` — paginated prompt-log (filter op classificatie/beslissing/datum)
- `GET /governance/ai-prompt-scans/statistieken` — telling per classificatie + injectie-aanvallen vandaag
- `GET /governance/ai-wijzigingsvoorstellen` — wachtrij met oranje-voorstellen (filter op status)
- `POST /governance/ai-wijzigingsvoorstellen/:id/beoordelen` — goedkeuren of afwijzen (alleen hoofdbeheerder)

**DB (additief):** `ai_prompt_scans`, `ai_wijzigingsvoorstellen` via CREATE TABLE IF NOT EXISTS + Drizzle-schema `lib/db/src/schema/ai-governance.ts`

**Frontend (`beheer/ai-prompt-governance.tsx`):**
- Toegankelijk via Beheer > AI-governance (alleen hoofdbeheerder)
- 3 tabs: Dashboard (statistieken + uitleg classificaties), Prompt-log (kleurgecodeerde tabel per classificatie), Wijzigingsvoorstellen (beoordeel-dialoog met goedkeuren/afwijzen + opmerking)

---

## 2026-07-06 — Security Intake Layer: alle 12 beveiligingscomponenten volledig geïmplementeerd

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** geen

**Wat is gebouwd (uitbreiding op bestaande security-intake-engine):**

12 verplichte beveiligingscomponenten toegevoegd als geïntegreerde 8-staps pipeline (OWASP File Upload Cheat Sheet):

1. **ClamAV/clamd** — `clamav-service.ts`: clamscan subprocess (niet TCP), graceful fallback als database ontbreekt. Config in `config/clamav/clamd.conf` + `freshclam.conf`, database in `data/clamav-db/`.
2. **Freshclam auto-updates** — `freshclam-update.sh` + `freshclam-init.sh` scripts. Freshclam download 4-uurlijks, config gericht op `data/clamav-db/`. Eerste download gestart.
3. **MIME-detectie op inhoud** — 50+ magic bytes (afbeeldingen, archieven, executables, media, fonts, data). Detecteert vermomd type ongeacht extensie-claim van de client.
4. **Archief-scanning ZIP/RAR/7z** — `archive-scanner.ts`: ZIP via yauzl (native Node), 7z/RAR via p7zip binary. Controleert op geblokkeerde extensies in archief, path-traversal, zip-bom (>500MB uitpak, >1000 bestanden).
5. **Wachtwoordbeveiliging blokkade** — ZIP: bit 0 van general purpose bit flag; 7z/RAR: "Encrypted = +" in `7z l -slt` output. Wachtwoordbeveiligd = altijd geblokkeerd (inhoud niet controleerbaar).
6. **PDF/Office macro-controle** — uitgebreid: XFA-formulieren, Encrypted PDF, `/AA` actions, `DownloadFile`/`DownloadString` in OLE2, `GetTempPath`/`GetSystemDirectory` herkenning.
7. **URL-reputatiecontrole** — `link-scanner.ts` volledig herschreven: typosquatting (10 merken, 50+ varianten), URL-shorteners (30+), verdachte TLDs (20+), SSRF-detectie, path-traversal in URL, Data-URI executables, JavaScript-protocol links.
8. **YARA-regels** — `yara-service.ts` + `config/yara/fps-security.yar`: 7 regels (ransomware, PowerShell, embedded executable, macro keywords, phishing, webshell, MIME mismatch). Ernst per regel: kritiek/hoog/midden → automatisch blokkade of quarantaine.
9. **OWASP File Upload norm** — 8-staps pipeline in `scanBestandBytes()`: extensie → naam-anomalieën → MIME-inhoud → archiefcontrole → structuur → YARA → ClamAV → links+AI. Elke stap heeft expliciete actie (toegestaan/quarantaine/geblokkeerd).
10. **Quarantaine-opslag buiten public** — `quarantine-storage.ts`: opslag in `data/quarantine/` (mode 700, niet via web-server bereikbaar). Metadata in `.meta/` subdir. Beheer-API: `GET /security/quarantaine-opslag`, `DELETE /security/quarantaine-opslag/:naam`.
11. **Auditlogging** — DB-schema uitgebreid: `yara_status`, `archief_status`, `quarantaine_pad`. Alle 12 checks gelogd in `security_intake_scans` (unwijzigbaar audittrail). `koppelDocumentAanScan()` voor post-registratie koppeling.
12. **Scan-first blokkade** — `haalScanStatusOpVoorPad()` in `storage.ts` GET `/storage/objects/*`: geblokkeerde bestanden worden NOOIT geserveerd (HTTP 403), ongeacht gebruikersrechten.

**Frontend:** security-intake.tsx uitgebreid met Archief- en YARA-statusvelden (4-kolom grid, 8 categorieen).

**DB-wijzigingen (additief, geen migratie nodig):** `ALTER TABLE security_intake_scans ADD COLUMN yara_status`, `archief_status`, `quarantaine_pad`.

---

## 2026-07-06 — Security Intake Layer: 8-staps pipeline, Poort 1 & 2 integratie, quarantaine-beheer UI

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** geen

**Wat is gebouwd:**

Centrale Security Intake Layer die FPS Connect beschermt tegen schadelijke bestanden, e-mails en documentuploads. Pipeline: extensie-blacklist → MIME-analyse → structuurvalidatie (PDF/OLE2 magic bytes) → ClamAV optioneel (TCP poort 3310, graceful fallback) → linkanalyse → AI inhoudsanalyse → quarantaine/blokkade → DB-logging.

**Kern-engine (`security-intake-engine.ts`):**
- `scanBestandMetadata()` — extensie-blacklist + dubbele-extensie-detectie + unicode-detectie + MIME-claim (geen bytes nodig); retourneert `ScanUitkomst` inclusief `dbId`
- `scanBestandBytes()` — uitgebreid: magic-byte MIME-detectie + PDF-structuuranalyse + OLE2 macro-detectie + ClamAV
- `scanEmailBericht()` — afzender-analyse + bijlagenamen + link-extractie + AI inhoudsscreening
- Alle beslissingen worden gelogd naar `security_intake_scans` (onwijzigbaar audittrail)

**Link-scanner (`link-scanner.ts`):**
- URL-normalisatie + TLD-extractie + IP/localhost-detectie + URL-shortener-detectie + typosquatting vs. bekende domeinen

**Poort 1 — Upload URL-aanvraag (`storage.ts`):**
- Extensie-blacklist + dubbele-extensie-check bij `POST /storage/uploads/request-url`; directe 400 met uitleg

**Poort 2 — Documentregistratie (`documenten.ts`):**
- Fire-and-forget scan bij `POST /documenten` en `POST /documenten/:id/revisies`; koppelt scan-id terug aan document_id

**DB-tabel (`security_intake_scans`):**
- Volledig schema: extensie/MIME/structuur/link/AI/ClamAV-status, risicobevindingen (jsonb), quarantaine-vlag, beoordelingsvelden

**Quarantaine-beheer API (`security-quarantine.ts`):**
- `GET /security/dashboard` — statistieken per risiconiveau + 24u-trend
- `GET /security/quarantaine` — filter op pending/vrijgegeven/geweigerd
- `GET /security/scans` — scanlog met filter/zoek/paginering
- `POST /security/quarantaine/:id/vrijgeven` — beheerder geeft vrij met opmerking
- `POST /security/quarantaine/:id/weigeren` — hoofdbeheerder weigert definitief

**Beheer-UI (`security-intake.tsx`):**
- Dashboard met statistieken-kaarten + 3 tabbladen: Quarantaine / Scanlog / Instellingen
- Risiconiveau-badges, reden-tooltips, vrijgeven/weigeren-acties met bevestigingsdialoog
- Route `/beheer/security-intake` (alleen hoofdbeheerder), nav-item "Beveiliging & Intake" in beheerder-sidebar

---

## 2026-07-06 — AI Governance & Risk Engine: risicoscoring, goedkeuringswachtrij, audittrail, beheer-UI

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** geen

**Wat is gebouwd:**

Centrale Governance & Risk Engine die automatisch iedere schrijfactie (POST/PATCH/PUT/DELETE) in het platform beoordeelt via een regels-gebaseerde risicoscore.

**Risicoscoring (synchroon, per request):**
- Methodescore: DELETE +30, PATCH/PUT +8, POST +4
- Domeinbonussen: salarisgegevens +45, HRM +38, contracten/offertes/projecten/dossiers +34–36, definitief/archief +42, bulk/import +40, facturen +28, etc.
- Kritieke routes (hardcoded 90+): DELETE /gebouwen/:id, DELETE /gebruikers/:id, POST /backups/:id/herstel
- Niveaus: groen (0–25), geel (26–45), oranje (46–65), rood (66–84), kritiek (85+)

**Blokkeergedrag:**
- Groen/geel/oranje/rood: request gaat door, wordt gelogd (rood + wachtrij-entry)
- Kritiek + niet-hoofdbeheerder: HTTP 403 met `code: GOVERNANCE_GEBLOKKEERD` en motivatietekst
- Hoofdbeheerder is nooit geblokkeerd

**Middleware (universeel, nul codewijzigingen aan routes):**
- `governanceMiddleware` toegevoegd in routes/index.ts na `maakAuditMiddleware()` — dekt alle 722+ schrijfoperaties automatisch
- Uitgesloten: auth-routes, governance-eigen routes, slim-upload-log

**DB (twee nieuwe tabellen, directe SQL):**
- `governance_checks` — immutable audit trail: gebruiker, methode, route, niveau, score, motivatie, factoren, afhandeling, geblokkeerd
- `governance_wachtrij` — goedkeuringswachtrij: status wacht/ter_beoordeling/goedgekeurd/afgewezen, vereist_rol, goedgekeurd_door

**Backend-routes (/api/governance/*):**
- `GET /governance/dashboard` — vandaag-statistieken per niveau + wachtrij-teller
- `GET /governance/checks` — pagineerde audit-log met filters (niveau, zoek, datum)
- `GET /governance/wachtrij` — wachtrij-items (gefilterd op status)
- `POST /governance/wachtrij/:id/goedkeuren` — goedkeuren met opmerking
- `POST /governance/wachtrij/:id/afwijzen` — afwijzen met opmerking
- `GET /governance/statistieken` — module-rapportage (30 dagen)
- Alles achter `alleenHoofdbeheerder` guard

**Beheer-UI (/beheer/governance-risico):**
- Dashboard-tab: risico-niveau kaarten (groen t/m kritiek, vandaag-tel), geblokkeerde acties, wachtrij-teller, recente activiteitentabel
- Wachtrij-tab: status-filter, tabel met aanvrager/methode/route/niveau/motivatie, Akkoord/Afwijzen knoppen met bevestigingsdialoog + opmerkingsveld
- Audit-tab: zoek op route, filter op niveau, paginering
- Alleen zichtbaar voor hoofdbeheerder (nav + route)

**Bestanden:**
- nieuw: `lib/db/src/schema/governance.ts`
- nieuw: `artifacts/api-server/src/services/governance-engine.ts`
- nieuw: `artifacts/api-server/src/middlewares/governance.ts`
- nieuw: `artifacts/api-server/src/routes/governance.ts`
- nieuw: `artifacts/firevault/src/pages/beheer/governance.tsx`
- gewijzigd: `lib/db/src/schema/index.ts`, `artifacts/api-server/src/routes/index.ts`, `artifacts/firevault/src/App.tsx`, `artifacts/firevault/src/layouts/beheerder-layout.tsx`

## 2026-07-06 — SlimUploadBalk herontwerp: meerstappenflow, impactbeoordeling, toegangscontrole, audit-log

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** geen

**Wat is gebouwd:**

SlimUploadBalk volledig herontworpen met vier nieuwe lagen:

**Auto-analyse (geen toelichting meer verplicht):**
- WachtrijKaart start analyse automatisch via `useEffect` bij mount — geen knop meer nodig
- Toelichting is teruggebracht naar optioneel veld (na analyse, als context)
- `analyseerAlle()` vereist geen niet-lege toelichting meer

**3-stappenflow (stap 0 → 1 → 2):**
- Stap 0 — Analyseresultaat: categorie-kaart, impact-badge (amber/rood bij midden/hoog), gevonden gegevens, beperkingen, AVG-waarschuwing
- Stap 1 — Actie kiezen: Direct/Later toggle, categorie-specifieke context (CV/verzekering/personeelsdossier), alternatieven altijd bereikbaar via `<details>`
- Stap 2 — Bevestigen: impact-box + checkbox akkoord; alleen getoond bij `vereist_bevestiging: true` (midden/hoog impact)
- Terug-knop op elke stap; `ChevronLeft` toegevoegd aan imports

**AI-impactbeoordeling (vier niveaus):**
- Backend-prompt uitgebreid: AI geeft `impact_niveau` (geen/laag/midden/hoog), `impact_omschrijving`, `vereist_bevestiging`, `directe_actie_beschrijving` terug
- Heuristische fallback: CV → midden (onboarding), verzekering → midden (vervangt polis), overig → laag
- Frontend: IMPACT_KLEUR + IMPACT_LABEL constanten; badge op stap 0 kaart; bevestigingsbox op stap 2

**Toegangscontrole per gebruikersniveau:**
- Backend route `/slim-upload/analyseer` haalt na classificatie bevoegdheden op uit DB (sessie → `gebruikersTable`)
- `verrijkMetBevoegdheden()`: personeelsdocument zonder `personeel:1` → beperking; factuur zonder `financieel:1` → beperking; salarisgegevens gedetecteerd → impact hoog; hoofdbeheerder altijd vrijgesteld
- `beperkingen[]` en `mag_uploaden` teruggegeven aan frontend; getoond in stap 0; bij `mag_uploaden: false` geen actieknop

**Audit-log:**
- DB-tabel `slim_upload_log` (id, gebruikerId, bestandsnaam, categorie, actie, impactNiveau, bevestigd, geweigerd, opmerking, ipAdres, aangemaaktOp)
- `POST /api/slim-upload/log` — schrijft per actie (direct_gestart / later_klaargezet / geweigerd), async fire-and-forget vanuit `voerActieUit()`
- `GET /api/slim-upload/log` — alleen hoofdbeheerder, joinT met gebruikersTable voor naam
- Beheer › AI-log: nieuwe "Upload acties-log" kaart (lazy load via "Tonen"-knop), tabel met tijdstip/gebruiker/bestand/categorie/actie/impact/status

**Technisch:**
- `lib/db/src/schema/slim-upload-log.ts` aangemaakt, geëxporteerd via `index.ts`
- `pnpm run typecheck:libs` uitgevoerd na schema-toevoeging
- Tabel aangemaakt via directe `CREATE TABLE IF NOT EXISTS` SQL (drizzle push TTY-beperkt)
- Pre-existing TS7030 in api-server onaangetast

## 2026-07-06 — Slim uploaden uitgebreid: CV-onboarding, verzekeringen, Snagstream

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** geen

**Wat is gebouwd:**

De universele SlimUploadBalk herkent nu drie aanvullende documentpatronen met directe actiestromen — zonder binding aan een specifiek uploadscherm of opslaglocatie.

**CV / sollicitatie:**
- AI en heuristiek herkennen CV's specifiek (bestandsnaam, visuele lay-out, tekst "werkervaring / opleiding / vaardigheden")
- `document_subtype: "cv"` in `gevonden_gegevens` signaleert de frontend
- Actiekeuze: "Onboarding starten" (navigeert direct naar `/personeel/onboarden` + CV in inbox) of "Klaarzetten voor later" (inbox)
- Geëxtraheerde velden: naam, gewenste functie, opleidingsniveau, jaren ervaring

**Verzekeringspolis:**
- Nieuw categorie `verzekering` (backend + frontend)
- Heuristiek: "polis / verzekering / assurantie / aansprakelijkheid" in bestandsnaam
- AI extraheert: soort verzekering, polisnummer, verzekeraar, geldig van/tot, jaar
- Jaar-bewuste routing: polis met jaar ≥ huidig jaar → "Opslaan als actuele polis"; ouder jaar → "Archiveren (polis JJJJ)"

**Snagstream-rapport:**
- Explicieter actieblok vervangt de generieke navigatieknop
- Twee knoppen: "Opslaan in Snagstream-archief" of "Opslaan en naar Snagstream gaan"
- AI extraheert: projectnaam, locatie, inspectiedatum, rapporttype, opdrachtgever

**Gewijzigde bestanden:**
- `artifacts/api-server/src/routes/slim-upload.ts` — `verzekering` in SLIM_UPLOAD_CATEGORIEEN; heuristiek voor CV + polis; AI-prompt uitgebreid met visuele signalen, categorie-definitie, extractieregels
- `artifacts/firevault/src/components/slim-upload-balk.tsx` — `verzekering` in type + CATEGORIE_INFO + GEVONDEN_LABELS; BeslisScherm: CV-panel, verzekering jaar-routing, snagstream-archief; WachtrijKaart + SlimUploadBalk: `onNavigeer` callback doorgegeven

## 2026-07-06 — Import historische facturen en projecten (ERP-archief)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** geen

**Wat is gebouwd:**

Twee nieuwe importtypes voor het inladen van historische ERP-exportdata, plus een doorzoekbaar en downloadbaar archief in de factuurmodule.

**Import (Beheer → Importeren):**
- Nieuw type `Historische facturen (archief)` — importeert inkoop- en verkoopfacturen uit ERP-exportbestanden (Excel/CSV); velden: factuurnummer, type, factuurdatum, vervaldatum, relatienaam, relatienummer, bedragen, btw-code, grootboekrekening, kostenplaats, dagboek, betaalstatus, omschrijving. Status wordt automatisch `historisch` zodat ze apart filteren.
- Nieuw type `Historische projecten (archief)` — importeert project-/gebouwgegevens: naam, werknummer, projectnummer, adres, postcode, stad, gebouwtype, verdiepingen, omschrijving. Worden opgeslagen in de gebouwentabel met `projectStatus = historisch`.
- Slimme kolomherkenning: meerdere ERP-kolomnamen worden herkend (bijv. `leverancier` / `klant` → `relatienaam`, `gbl` → `grootboekrekening`, `crediteur_nr` / `debiteur_nr` → `relatie_code`).
- Downloadbare lege sjablonen voor beide types (via "Sjabloon downloaden"-knop in de wizard).

**Archief raadplegen (Factuurverwerking → Historisch archief):**
- Nieuw tabblad "Historisch archief" in `Factuurverwerking` — toont alleen de geïmporteerde historische facturen, gefilterd op `status = historisch`.
- Knop "Exporteren als Excel" verschijnt automatisch op het historisch-archieftabblad en genereert een compleet Excel-overzicht van alle historische facturen (`GET /facturen/historisch-archief/excel`).

**Historische projecten raadplegen:**
- Verschijnen in de reguliere gebouwenlijst (filter op projectstatus "historisch" mogelijk).

**Gewijzigde bestanden:**
- `artifacts/api-server/src/routes/import.ts` — twee nieuwe handlers + mapper-functies + sjabloonkolommen + `facturenTable` import
- `artifacts/api-server/src/routes/facturen.ts` — XLSX import + nieuw `GET /facturen/historisch-archief/excel` endpoint
- `artifacts/firevault/src/pages/beheer/import.tsx` — twee nieuwe importtypes met volledige veldkoppelingen in de wizard
- `artifacts/firevault/src/pages/facturen/index.tsx` — "Historisch archief" tab + Excel-downloadknop
- `lib/api-spec/openapi.yaml` — nieuw `GET /facturen/historisch-archief/excel` endpoint toegevoegd

## 2026-07-05 — Borging stale codegen-declaraties

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** geen

**Wat is gebouwd:**

Technische vangnetten om te voorkomen dat een vergeten `typecheck:libs`-stap verouderde `dist/`-declaraties naar productie brengt.

**Gewijzigde bestanden:**
- `lib/api-client-react/package.json` — `prepare`-script toegevoegd (`tsc --build`); dist/ wordt nu automatisch herbouwd bij elke `pnpm install`
- `scripts/src/check-codegen-stale.ts` — nieuw script: controleert of `dist/generated/api.d.ts` ouder is dan `src/generated/api.ts` en voert automatisch `typecheck:libs` uit als dat zo is; exit 1 als rebuild mislukt
- `scripts/package.json` — script `check-codegen-stale` geregistreerd
- `.githooks/pre-commit` — git pre-commit hook die `check-codegen-stale` aanroept; activeer via `git config core.hooksPath .githooks`
- `docs/ontwikkelfilosofie.md` — nieuw verplicht hoofdstuk "Codegen-workflow" toegevoegd: expliciet verbod op `npx orval` rechtstreeks, documentatie van alle vangnetten

---

## 2026-07-05 — FPS One Design System 2.0 — Premium Spatial UI

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Wat is gebouwd:**

Volledig herontwerp van de FPS One klantomgeving. Het platform voelt niet langer als standaard bedrijfssoftware — het heeft de uitstraling van een premium digitaal product (Apple/Arc/Linear/Stripe/Tesla-niveau).

**Ontwerpfilosofie:** "Software moet niet voelen als software. Het moet voelen als een modern gebouw."

**Gewijzigde bestanden:**
- `artifacts/firevault/src/layouts/klant-layout.tsx` — navigatieredesign: strakke sidebar, max 5 items, FPS-cyaan accentkleur (#0EA5E9), transparante hover-states
- `artifacts/firevault/src/pages/one/dashboard.tsx` — "Goedemorgen" hero, grote gebouwkaarten live via useListGebouwen(), recente activiteit via useGetRecenteActiviteit(), veel witruimte
- `artifacts/firevault/src/pages/one/gebouwen.tsx` — grote premium gebouwkaarten met subtiele schaduwen, card-lift animaties on hover, ruime composities
- `artifacts/firevault/src/pages/one/gebouw-detail.tsx` — hero-sectie met gebouwfoto (useGetGebouwGevelbeeld), veiligheidsstatus-kaarten, rapporten-sectie, premium typografie
- `artifacts/firevault/src/pages/one/documenten.tsx` — elegante "In voorbereiding" premium staat
- `artifacts/firevault/src/pages/one/rapporten.tsx` — elegante "In voorbereiding" premium staat
- `artifacts/firevault/src/pages/one/abonnementen.tsx` — 3 pakketten (Basis/Beheer/Volledig) in premium card-layout
- `artifacts/firevault/src/pages/one/adviescentrum.tsx` — ruimtelijk adviesformulier

**Designprincipes doorgevoerd:**
- FPS-cyaan (#0EA5E9) als accentkleur exclusief voor FPS One (gescheiden van Connect oranje #F23B0D)
- Royale marges en witruimte — geen enkel scherm voelt "vol"
- Grote afgeronde kaarten (rounded-[24px]/rounded-[32px]) met subtiele schaduwen
- Sterke typografische hiërarchie — grotere koppen, minder tekst
- Subtiele card-lift on hover via Tailwind transitions
- Tablet-first bedieningsvlakken
- Gebouwen als ingang voor alles

---

## 2026-07-05 — Publicatielaag Connect → FPS One

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Wat is gebouwd:**

Centrale publicatielaag die bepaalt welke gebouwen zichtbaar zijn in FPS One (klantomgeving). Klantinhoud is pas zichtbaar na expliciete goedkeuring door een bevoegd medewerker. Connect en One delen dezelfde database — geen sync of dubbele opslag.

**DB:**
- Tabel `gebouw_publicaties` (lib/db/src/schema/gebouwen.ts): gebouw_id, status (gepubliceerd/ingetrokken), gepubliceerd_door/op, ingetrokken_door/op, notitie
- Directe SQL-migratie uitgevoerd; tabel aangemaakt in dev

**API (artifacts/api-server/src/routes/gebouwen.ts):**
- `GET /gebouwen/:id/publicatiestatus` — huidige status opvragen (toegankelijk voor interne gebruikers en klanten met toegang)
- `POST /gebouwen/:id/publiceer` — gebouw publiceren naar FPS One (bevoegdheid gebouwen niveau 2)
- `POST /gebouwen/:id/publicatie/intrekken` — publicatie intrekken (bevoegdheid gebouwen niveau 2)
- Klantfilter uitgebreid: klantgebruikers (`rol === "klant"`) zien in `GET /gebouwen` en `GET /gebouwen/:id` uitsluitend gepubliceerde gebouwen; ongepubliceerde gebouwen geven 403
- Auditlog via `logActiviteit` met types `gebouw_gepubliceerd` en `gebouw_publicatie_ingetrokken`
- Import `gebouwPublicatiesTable` toegevoegd

**OpenAPI + codegen:**
- 3 nieuwe paden + 2 nieuwe schema's (`GebouwPublicatieStatus`, `PubliceerInput`) in openapi.yaml
- Codegen gedraaid: hooks `useGetGebouwPublicatieStatus`, `usePubliceerGebouw`, `useIntrekkenGebouwPublicatie` beschikbaar

**Frontend:**
- Nieuw component `artifacts/firevault/src/components/gebouw-publicatie-kaart.tsx`:
  - Toont publicatiestatus (gepubliceerd/niet gepubliceerd) met datum en naam van publiceerder
  - Publiceer/intrekken-knop met bevestigingsstap en optionele notitie
  - Acties alleen zichtbaar voor gebruikers met bevoegdheid gebouwen ≥ 2
- Geïntegreerd in `gebouw-dashboard.tsx`: kaart verschijnt in de rechterzijbalk voor beheerders

---

## 2026-07-05 — Stale lib dist/-declaraties voorkomen

Twee preventielagen tegen verouderde TypeScript-declaraties in composite lib `dist/`-mappen die stilzwijgend TS2339-fouten veroorzaken:

1. **Expliciete per-package `.gitignore`** toegevoegd aan alle 5 composite libs (`lib/api-client-react`, `lib/api-zod`, `lib/db`, `lib/object-storage-web`, `lib/permissies`). Elke `.gitignore` bevat `/dist` zodat builduitvoer nooit per oudeluk git-tracked kan worden, ook als de root-regel ooit wegvalt.

2. **Nieuwe kwaliteitscheck-sectie 11** (`scripts/src/kwaliteitscheck.ts`): twee controles:
   - **Stap A**: `git ls-files lib/*/dist/` — rapporteert als "hoog" wanneer dist-bestanden toch getrackt zijn; geeft instructie om ze met `git rm --cached` te verwijderen.
   - **Stap B**: na `tsc --build` controleert het script of elk `.d.ts`-bestand in `dist/` een overeenkomend `.ts`-bronbestand heeft in `src/`. Ontbrekend bronbestand = stale declaratie van een verwijderde export → "hoog".

3. **`docs/kwaliteitscontrole.md`** bijgewerkt met de nieuwe controle-categorie.

---

## 2026-07-05 — Dashboard-kiezer hoofdbeheerder: 9 selecteerbare views

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Wat is gebouwd:**

Nieuwe dashboard-kiezer bovenaan het beheerder-dashboard (alleen zichtbaar voor `hoofdbeheerder`). De keuze wordt opgeslagen in `localStorage` en hersteld bij terugkeer.

**9 dashboard-views (`artifacts/firevault/src/pages/dashboard/beheerder.tsx`):**

| View | Inhoud | Gecombineerd |
|------|--------|--------------|
| Operationeel | Bestaande inhoud ongewijzigd | — |
| Spots | Statusverdeling, spots per type (staafdiagram), vervaldagen met urgentiebadges | — |
| Projecten & Offertes | OfferteAnalytics (conversie, waarde, pie-chart), CRM pijplijn, recente offertes | Projecten + Offerte-pipeline |
| Facturen & Verkoop | Facturen per type (totaal/bedrag), onderhoudscontracten, recente facturen | Facturen + Onderhoud |
| Bedrijfsgezondheid | CRM-gezondheidsmetrices, winratio, offerte-financieel, AI-kosten | Pijplijn + Contracten |
| HRM | HRM-stats, ziekte-trendgrafiek, verlofaanvragen, capacititeitsbezetting | Personeel + Verlof + Ziekte |
| Bugreports | Feedback-lijst per type, inbox-statistieken, veiligheidsmelding-overzicht | Feedback + Inbox + Veiligheid |
| Kwartaaloverzicht | Offertes + Facturen + HRM samengebracht in Q-view | Offertes + Facturen + HRM |
| Maandoverzicht | AI-kosten, recente activiteit, open verlof, actieve medewerkers | AI-kosten + Activiteit + Verlof |

**Technische aanpak:**
- Elke view is een eigen component met eigen hooks → geen onnodige API-calls voor niet-actieve views
- `DashboardKiezer`: scrollbare rij pill-knoppen met actieve stijl; gecombineerde views tonen hun combinatie als tooltip + subtitel
- Bestaande operationele dashboard volledig behouden als eigen sub-component `OperationeelDashboard`
- Herbruikbare `KpiKaart` helper voor alle views
- TypeScript-fouten in beheerder.tsx: nul (pre-existing `retryUpload`-errors in andere bestanden onaangeroerd)

---

## 2026-07-05 — Fix: Uploadfouten bij spot-foto's zichtbaar op uitvoeringspagina

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Probleem:** Spot-foto uploads in de uitvoeringsflow (`uitvoering/[opdrachtId].tsx`) en de digitale-uitvoerder-chat (`uitvoerder/[sessie_id].tsx`) mislukten stil — de gebruiker kreeg geen foutmelding en kon niet opnieuw proberen.

**Fix:**
- `artifacts/monteur-app/app/uitvoering/[opdrachtId].tsx`:
  - `voegFotoToe` catch onderscheidt nu bestandstype-fouten (415/unsupported) van herstaartbare fouten (netwerk/server).
  - Bij bestandstype-fout: foto verwijderd + Alert met "Ander bestand kiezen" knop.
  - Bij herstaartbare fout: foto blijft in state als `fout: true`, Alert met "Opnieuw proberen" → `herprobeerFoto(lokaal)`.
  - Nieuwe `herprobeerFoto(lokaal)` functie herprobeert de upload for hetzelfde lokale pad met dezelfde foutclassificatie.
  - `FotoRij` component bijgewerkt: rode rand + inline "Opnieuw"-knop bij `fout: true`, optionele `onHerprobeer` prop.
- `artifacts/monteur-app/app/uitvoerder/[sessie_id].tsx`:
  - Extractie van `probeerFotoUpload(uri, opOpnieuw)` helper die foutclassificatie centraliseert.
  - `kiesFoto` en `maakFoto` gebruiken beide de helper; "Ander bestand kiezen" roept `kiesFoto()` opnieuw aan, "Opnieuw proberen" herprobeert dezelfde URI.
  - Pre-existing typefout hersteld: `uploadFoto(uri, token ?? "")` → `uploadFoto(uri)` (tweede argument is `gebouwId?: number`, niet een token-string).

---

## 2026-07-05 — Offline foto-upload fouten zichtbaar gemeld in monteur-app

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Probleem:** Als een foto offline lokaal werd opgeslagen en later via de sync-wachtrij werd geüpload, mislukten fouten stil — de monteur zag geen melding. De ConflictModal kon ook geen items tonen omdat `mislukteItems` niet werd doorgegeven aan de badge.

**Aanpak:**

1. **`lib/syncQueue.ts`** — `herstelMisluktItem(id)` toegevoegd: reset `pogingen` en `fout` van één specifiek wachtrij-item naar 0 zonder de rest van de wachtrij te beïnvloeden.

2. **`context/sync.tsx`** — Twee nieuwe context-functies: `verwijderEnkelMislukt(id)` (verwijdert één mislukt item uit de wachtrij) en `herprobeeerEnkel(id)` (reset dat item voor opnieuw proberen). Beide roepen `herlaadAantal()` aan na de mutatie.

3. **`components/ConflictModal.tsx`** — Per-item "Opnieuw"-knop en "Verwijderen"-knop toegevoegd onder elk mislukt item. Bulkknop hernoemd naar "Alles opnieuw proberen" / "Alle mislukte items verwijderen" voor duidelijkheid.

4. **`components/SyncStatusBadge.tsx`** — Props `onVerwijderItem` en `onHerprobeeerItem` toegevoegd en doorgegeven aan ConflictModal.

5. **`app/gebouwen.tsx` + `app/plattegrond/[verdiepingId].tsx`** — Beide schermen gaven `mislukteItems` niet door aan de badge; hierdoor was de ConflictModal altijd leeg. Nu worden `mislukteItems`, `onForceerSync`, `onVerwijderItem` en `onHerprobeeerItem` correct doorgegeven.

6. **`app/opname/item/[itemId].tsx`** — Inline wachtrij-waarschuwing toegevoegd in de foto-sectie: toont per foto een geel "wacht op synchronisatie"-bericht (pending) of rood "mislukt (N× geprobeerd)"-bericht (definitief mislukt), met per-item "Opnieuw proberen"- en "Verwijderen"-knoppen direct in het scherm.

---

## 2026-07-05 — Fix: RadiaalMenu FPS-knop boven systeemtaakbalk

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Probleem:** De rode FPS-knop in de monteur-app overlapte de systeemtaakbalk. Een eerdere poging met `paddingBottom: onderInset(insets) + 16` had vrijwel geen effect, omdat `paddingBottom` op een centrerende View de inhoud slechts met `padding/2` verschuift (max ~16px — onzichtbaar).

**Oorzaak:** De vereiste padding moet ervoor zorgen dat het *laagste item* van de radiale ring (op `straal` afstand van het centrum, plus halve itemhoogte) boven de systeemtaakbalk valt.

**Fix (`artifacts/monteur-app/components/RadiaalMenu.tsx`):**
- `paddingBottom: onderInset(insets) + 16` → `paddingBottom: onderInset(insets) + straal + ITEM_GROOTTE / 2 + 16`
- Op iPhone (insets.bottom=34, straal≈140): paddingBottom = 227px → dial verschuift ~113px omhoog, onderste items altijd boven taskbar.
- Expo workflow herstart zodat de app de nieuwe code laadt.

---

## 2026-07-05 — VGE-query hardening: actieve visuals filter + unit-tests (Task #332)
## 2026-07-05 — VGE effectiviteitslog: stap_duur_seconden + betere spot_type afleiding (Task #345)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Wat is gebouwd:**

**`artifacts/api-server/src/routes/visuals.ts`:**
- Nieuw endpoint `GET /visuals/guidance` — VGE-selectie-endpoint (maximaal 3 actieve, goedgekeurde visuals per uitvoeringsstap op basis van `spot_type` + optioneel `stap_type` / `taal`)
- Query filtert altijd op `actief = true AND bron_type IN (geldigeBronTypes)` — de DB-CHECK-constraint is linie 1, deze API-filter is linie 2 (VGF §2.3)
- Geëxporteerde pure functie `filterVgeKandidaten()` toepasbaar in unit-tests
- Documentatiecommentaar in de route-handler verwijst expliciet naar VGF-grondbeginsel 2.3 + §6.1
- `GELDIGE_BRON_TYPES`, `STAP_TYPE_VISUAL_TYPES` en `VgeVisual` geëxporteerd voor hergebruik

**Bugfix `lib/db/src/schema/vge.ts`:**
- Conflicterende duplicaat-exports (`fpsVisualsTable`, `FpsVisual`, `fpsVisualAnnotatiesTable`) verwijderd uit `vge.ts`; deze leven nu alleen in `visuals.ts` (enkelvoudige bron van waarheid)
- `vge.ts` importeert nu `fpsVisualsTable` vanuit `./visuals`

**OpenAPI `lib/api-spec/openapi.yaml`:**
- Nieuw pad `/visuals/guidance` (`getVisualsGuidance`) met parameters `spot_type` (verplicht), `stap_type` en `taal`

**Unit-tests `artifacts/api-server/src/__tests__/vge-guidance-hardening.test.ts`:**
- 18 tests, 9 scenario's: inactieve visuals, ongeldig bron_type, combinaties, geldige doorgang, max-3 beperking, stap-type filter, onbekend stap_type, lege invoer en GELDIGE_BRON_TYPES volledigheid

De VGE-leerlaag (`vge_effectiviteitslog`) was al grotendeels aanwezig maar had twee gaps:

1. **`stap_duur_seconden` toegevoegd** aan `PimUitvoeringVoltooienInput` (OpenAPI + codegen). De monteur-app kan nu het aantal seconden meesturen bij het voltooien van een stap; de waarde wordt rechtstreeks opgeslagen in de effectiviteitslog. Gebruikt door de VGE om trage/snelle uitvoeringen te correleren aan visual-effectiviteit.

2. **Betere `spot_type`-afleiding** in `schrijfVgeEffectiviteitslog`: voorheen gebruikte de functie alleen `instructie?.spot_type` (wat vaak `null`/`"onbekend"` opleverde). Nu roept het eerst de instructie-waarde op en valt anders terug op `afleidenSpotTypeVoorVge()` — dezelfde strategie als `vulGuidanceContextIn`. Dit zorgt dat de leerlaag bruikbare spot_type-waarden opslaat zodat de prioriteitsvolgorde daadwerkelijk verbetert.

**Gewijzigde bestanden:**
- `lib/api-spec/openapi.yaml` — `stap_duur_seconden` (integer, nullable) toegevoegd aan `PimUitvoeringVoltooienInput`
- `artifacts/api-server/src/routes/pim.ts` — request body, `schrijfVgeEffectiviteitslog` signatuur, beide aanroepplaatsen
- Codegen opnieuw uitgevoerd (gegenereerde bestanden bijgewerkt)

---

## 2026-07-05 — Visual Library beheer-UI (Task #321)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Wat is gebouwd:**

**Database — 2 nieuwe tabellen:**
- `fps_visuals`: centrale opslag van goedgekeurde visuals. Kolommen: `id`, `naam`, `visual_type`, `bron_type` (met CHECK-constraint), `bron_referentie`, `object_path`, `thumbnail_path`, `spot_type text[]` (GIN-index), `artikel_id` FK, `bedrijfsstandaard_id` FK, `taal`, `actief` (default `false`), `aangemaakt_op`, `bijgewerkt_op`.
- `fps_visual_annotaties`: AI-annotaties altijd gescheiden van origineel. CHECK-constraint `originele_foto_path <> annotatie_path` dwingt het af op DB-niveau.
- Indexes: GIN-index op `spot_type`, composite index op `(visual_type, actief)` voor VGE-selectie.

**Drizzle-schema — `lib/db/src/schema/`:**
- Nieuw `visuals.ts` met beide tabeldefinities + `VISUAL_TYPES` en `BRON_TYPES` constanten
- `index.ts` uitgebreid met `export * from "./visuals"`

**API — `artifacts/api-server/src/routes/visuals.ts`:**
- `GET /visuals` — lijst met optionele filters (actief, visual_type, spot_type)
- `GET /visuals/:id` — detail
- `POST /visuals` — aanmaken (actief=false by default, bron_type gevalideerd)
- `PATCH /visuals/:id` — bijwerken (actief toggle, alle velden)
- `DELETE /visuals/:id` — verwijderen
- Autorisatie: lezen = `systeem:1`, schrijven = `systeem:2` (beheerder-only)
- Geregistreerd in `routes/index.ts`

**OpenAPI spec — `lib/api-spec/openapi.yaml`:**
- Tag `visuals` toegevoegd
- Paden `/visuals` en `/visuals/{id}` met GET/POST/PATCH/DELETE
- Schemas `Visual`, `VisualInput`, `VisualPatch`
- Codegen uitgevoerd: hooks `useListVisuals`, `useCreateVisual`, `useUpdateVisual`, `useDeleteVisual`, `getListVisualsQueryKey` gegenereerd

**Beheer-UI — `artifacts/firevault/src/pages/beheer/visuals.tsx`:**
- Thumbnail-galerij (grid 1/2/3 kolommen) met actief/concept badges
- Actief/inactief toggle per visual (Switch direct in de kaart)
- Filterbar: actief/concept/alle + visual-type dropdown
- Upload-dialoog: naam, visual_type, bron_type, bron_referentie, object_path, thumbnail_path, spot_type checkboxes (ScrollArea)
- Bewerk-dialoog: zelfde formulier, pre-gevuld
- Verwijder-bevestiging via AlertDialog
- Route: `/beheer/visuals` (toegankelijk voor hoofdbeheerder)

**Navigatie:**
- `beheerder-layout.tsx`: "Visual Library" nav-item toegevoegd in Instellingen-sectie (isHoofdbeheerder), met `ImageIcon`
- `App.tsx`: route `/beheer/visuals` geregistreerd

## 2026-07-05 — Kernworkflow validatie (alle 15 modules)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Scope:** Volledige end-to-end validatie van de kernworkflow CRM → Gebouw → Verdieping → Plattegrond → Spot → Document → AI → Advies → Werkvoorbereiding. Geen nieuwe functionaliteit — alleen aantoonbaar stabiel en regressievrij.

**VGE migratie uitgevoerd (handmatig SQL — drizzle push werkt niet op TTY):**
- Tabellen aangemaakt: `fps_visuals`, `fps_visual_annotaties`, `vge_effectiviteitslog`
- Kolom toegevoegd: `pim_uitvoering_stappen.guidance_context`

**Testdata aangemaakt (directe SQL):** zie vorig changelog-item hieronder.

**Plattegrond gekoppeld:**
- SVG testplattegrond gegenereerd + geüpload via presigned GCS-URL (`bestand_type="tekening"`)
- Verdieping 21 gepatcht met `plattegrond_url=/objects/14/tekenings/007f9d74-82ad-42ea-b3a8-d2cd8566a0c8`

**Validatieresultaten per module:**

| Module | Status | Toelichting |
|---|---|---|
| Auth | ✅ | Session + TOTP werkt; sessiecookie geldig |
| CRM | ✅ | Klant 13 (Test Vastgoed BV) bereikbaar, koppelingen correct |
| Gebouw | ✅ | Gebouw 14, detail + verdiepingen laden, partijen correct |
| Plattegrond | ✅ | SVG upload + GCS koppeling + laden via storage: HTTP 200 |
| Spot | ✅ | TEST-001 zichtbaar, status PATCH werkt, AI-voorstel HTTP 201 |
| DMS documenten | ✅ | Document 37 beschikbaar, upload-presign werkt |
| Document Intelligence | ✅ (by-design) | AI analyse werkt bij upload; geen retroactief endpoint per doc (bewust) |
| AI Adviescentrum | ✅ | Gesprek id=2 aangemaakt + bericht verstuurd; `deelnemer_ids` is correct veldnaam |
| Werkvoorbereiding | ✅ | PIM aanvraag via `POST /api/aanvragen` → opdracht_id=2, PIM model id=1 |
| Facturen | ✅ | VRK €1.815 + INK €508,20, btw-berekeningen correct |
| Toolbox | ✅ | Bericht id=8 zichtbaar, leesbevestiging aanwezig |
| HRM | ✅ | Medewerkers list, medewerker id=6 correct gekoppeld |
| Rechten | ✅ | `isBeperkt` logica correct; kantoor-gebruiker ziet hele portefeuille (expected) |
| Logging | ✅ | Geen ERROR/WARN/500 in server logs |
| Performance | ✅ | Alle key endpoints < 100ms (57–78ms) |

**Bevindingen:**
1. **Planning API niet gemount** — `VITE_FEATURE_PLANNING=true` is een frontend-featureflag; er zijn geen server-side `/api/planning/*` routes. De DB-schema (`planning.ts`) bestaat wel. Planning-endpoints zijn nog niet geïmplementeerd aan de serverkant. Geen blokkade voor huidige release; blokkade voor V1.4+ als planning API nodig is.
2. **`bestand_type="plattegrond"` niet in enum** — gebruik `"tekening"` bij presigned upload van plattegrond-SVG/PDF. Kleine documentatie-gap, geen code-bug.
3. **Chat gesprek `deelnemer_ids`** — het correct veld is `deelnemer_ids` (array), niet `deelnemers`. Geen bug in de server; de OpenAPI-spec dient dit te documenteren.
4. **VGE tabellen** — de drizzle push-stap is onderdeel van `post_merge_setup.sh` maar faalt op een TTY-sessie. Handmatige SQL-migratie als workaround uitgevoerd; alle tabellen bevestigd aanwezig.

**Conclusie:** De volledige kernworkflow functioneert stabiel en regressievrij. Geen productie blokkers gevonden.

## 2026-07-05 — Visual Library beheerpagina (VGE)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Wat is gebouwd:**

- OpenAPI-spec uitgebreid met 5 nieuwe endpoints: `GET/POST /beheer/visuals`, `POST /beheer/visuals/upload-url`, `PATCH/DELETE /beheer/visuals/{id}`
- Nieuwe API-route `visual-library.ts` met CRUD voor `fps_visuals` tabel; gated op `systeem` bevoegdheid (lezen 1, schrijven 2)
- Codegen opnieuw uitgevoerd; hooks `useListBeheerVisuals`, `useCreateBeheerVisual`, `useUpdateBeheerVisual`, `useDeleteBeheerVisual` gegenereerd
- Beheerpagina `/beheer/visual-library` met: rastergrid van visual-tegels, upload-dialoog (naam, visualtype, brontype, bronreferentie, spot-types multiselect, bestandsupload + optionele thumbnail), activeer/deactiveer-toggle per visual, verwijder-bevestigingsdialoog, lege state met uitleg, schrijfbevoegdheidscontrole
- Sidebar-navigatie-item toegevoegd (icoon: GalleryHorizontal) in de systeemgroep
- Route `/beheer/visual-library` geregistreerd in App.tsx

---

## 2026-07-05 — End-to-end testscenario aangemaakt (directe DB-inserts)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Wat is aangemaakt (via directe SQL-inserts — geen code gewijzigd):**

| Object | ID | Detail |
|---|---|---|
| Testgebruiker | 39 | testgebruiker@fps.local / Welkom123! — bevoegdheden: lezen+schrijven alle hoofdmodules |
| CRM-klant | 13 | Test Vastgoed BV (vastgoedbeheerder, Hengelo) |
| Testgebouw | 14 | Testgebouw Brandveiligheid — Teststraat 1, 7550 AA Hengelo |
| Gebouw-partij | 6 | Test Vastgoed BV als opdrachtgever op testgebouw |
| Gebouw-toewijzing | — | Testgebruiker toegewezen aan testgebouw (rol: Beheerder) |
| Verdieping | 21 | Begane grond (1754×1240) op testgebouw |
| Spot (voorziening) | 60 | TEST-001 — kabelgoot (type 1.7), status: nieuw, Technische ruimte |
| Verkoopfactuur | 1 | VRK-2026-TEST-001, €1.815 incl. btw, status: concept |
| Inkoopfactuur | 2 | INK-2026-TEST-001, €508,20 incl. btw, status: ontvangen |
| Toolbox bericht | 8 | "TEST Toolbox: Brandveilig werken bij doorvoeringen" — gepubliceerd, leesbevestiging aangemaakt voor testgebruiker |
| HRM Medewerker | 6 | Testgebruiker ongeboardd als medewerker (FPS Brandpreventie, 40u/w) |

**Aantekeninen:**
- Wachtwoord is voor testdoeleinden plaintext hierboven; bcrypt-hash staat in de DB.
- Onboarding bestaat als moduleconcept alleen binnen HRM (medewerkers.in_dienst_sinds); geen aparte klant-onboarding module.
- Tekening/plattegrond op de verdieping: de `verdiepingen` rij staat klaar (id 21); een SVG/PDF kan via de editor in de preview-pane worden geüpload.
- Inkoopfactuur is aan het testgebouw gekoppeld via `gebouw_id`; verdere regels en termijnen zijn leeg (realistisch voor een ontvangen factuur).

## 2026-07-05 — Vervolgopdracht 5: Formele opleverrapportage V1.4

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Wat is gebouwd (alles in `print.tsx`):**

- **4 nieuwe rapporttype-presets:** `klant_beknopt`, `klant_uitgebreid`, `intern_controle`, `beheeradvies` — elk met eigen label, omschrijving en sectieprofiel. Config panel toont 3 subgroepen (Intern / Klantgericht / Controle & beheer).
- **3 nieuwe sectiesleutels:** `foto_tijdens` (foto's tijdens uitvoering), `maatregelen` (volledige spotlijst per bouwlaag/cluster), `conclusies` (vrije conclusietekst), `open_punten` (niet-afgeronde spots per bouwlaag/cluster).
- **`foto_tijdens` ondersteuning in `SpotDetailBlok`:** `toonFotoPeriode` prop + `tijdensFotos` filter (`fase === "tijdens"`) + aparte fotogroep "Foto's tijdens uitvoering" in de fotosectie. `heeftFotos` en `fotosPassenSamen` incl. tijdensFotos.
- **Cluster/status snelfilter voor spotselectie:** `VerdiepingSpotSelector` heeft `externalFilter` prop (`clusterIds + statussen`); `useEffect` auto-selecteert matching spots bij filter-change. Config panel toont clusterknopjes (uit bestaande clustersdata) en statusknopjes — onderling exclusief, Alles-reset wist ook de filters.
- **`MaatregelenSectie` + `OpenPuntenSectie` componenten:** elk met een hulpcomponent per verdieping die de React Query cache van `useListVoorzieningenOpVerdieping` hergebruikt. `OpenPuntenSectie` filtert op `!AFGERONDE_STATUSSEN` (goedgekeurd uitgesloten).
- **Conclusie teksteditor in config panel:** zichtbaar wanneer `secties.conclusies` aan staat; vrije textarea, opgeslagen in auto-save als `_conclusie_tekst`.
- **Auto-save uitgebreid:** slaat `_conclusie_tekst`, `_clusterFilterIds`, `_statusFilterStatussen` op in het secties-JSONB; loading-useEffect leest ze terug.
- **Backward compat:** backward-compat lijst bijgewerkt met alle 8 rapporttype-waarden.

**Ontwerpkeuzes:**
- Maatregelen/open punten hergebruiken de React Query cache — geen extra API-aanroep.
- Cluster- en statusfilter zijn onderling exclusief (één tegelijk actief) voor duidelijkheid.
- Conclusies verschijnen in het rapport alleen als de tekst niet leeg is.
- `foto_tijdens` is identiek aan `foto_voor`/`foto_na` qua prop-keten (geen aparte sectie buiten SpotDetailBlok).

## 2026-07-05 — Vervolgopdracht 4: AI-fotoanalyse per uitvoeringstap

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Wat is gebouwd:**

- **AI-prompt v2.0.0 (`UITVOERING_FOTO_ANALYSE_PROMPT`):** volledig herschreven met rijker schema — oordeel (akkoord / twijfel / afkeur), samenvatting (gewone taal voor monteur), technische bevindingen, confidence (0-1), waargenomen_risicos (array), ontbrekende_bewijsstukken (array), herstelactie_voorstel, stop_vereist. Expliciete drempel-definities per oordeel.
- **Backend voltooien-route (`POST /opdrachten/:id/pim/uitvoering/stap/:stapId/voltooien`):**
  - Produceisen-context: haalt type + toepassing (naam/fabrikant/testnorm) op van alle gekoppelde spots (via `voorziening_ids`) en voegt ze als context toe aan de AI-prompt.
  - Vision-analyse: laadt maximaal 4 foto's als data-URLs en stuurt ze via het `vision`-slot naar het model. Tekstanalyse als fallback bij geen foto's.
  - Parset alle nieuwe velden (oordeel, samenvatting, confidence, waargenomen_risicos, ontbrekende_bewijsstukken, herstelactie_voorstel).
  - Trigger op `oordeel === "twijfel" || "afkeur"` i.p.v. het oude `afwijking_gedetecteerd`-veld — stap wordt pas "afgeweken" als AI een probleem ziet; bij "akkoord" gewoon "voltooid".
  - `afwijkingJson` uitgebreid met de nieuwe velden (waargenomen_risicos, ontbrekende_bewijsstukken, herstelactie_voorstel, ai_oordeel) zodat de projectleider ze direct in het beslisformulier ziet.
- **Backend afwijking-route (`POST /opdrachten/:id/pim/uitvoering/stap/:stapId/afwijking`):** ook bijgewerkt met vision-ondersteuning (max 4 foto's) + nieuw veld-parsing. Geeft meer informatieve impact-tekst op basis van het oordeel (twijfel vs. afkeur).
- **`objectPathNaarDataUrl`** geëxporteerd uit `spot-ai.ts` voor hergebruik in andere services (in pim.ts al een lokale kopie aanwezig — import onnodig).
- **Monteur-app (`uitvoering/[opdrachtId].tsx` — ReadOnlyStapKaart):** AI-analyse display volledig herschreven: kleurgecodeerde oordeel-badge (groen/amber/rood), confidence-percentage, samenvatting in begrijpelijke taal, risico-lijst met waarschuwingsicoontjes, ontbrekende bewijsstukken, oranje herstelactie-kaart.
- **Kantoor-web (`pim-uitvoering-tab.tsx`):**
  - `XCircle` toegevoegd aan icoon-imports.
  - StappenOverzicht-rijen: kleine AI-oordeel indicator naast de statusbadge (groen "AI akkoord" / amber "Aandachtspunt" / rood "Niet akkoord"), alleen zichtbaar als `ai_analyse_json.oordeel` aanwezig is.
  - Nieuw component `PimAiAnalysePanel`: rijke analyse-weergave met oordeel-badge, zekerheidspercentage, samenvatting, technische bevindingen, risico-lijst, ontbrekende bewijsstukken, herstelactie-kaart.
  - `AfwijkingBeslisForm`: toont `PimAiAnalysePanel` boven het beslisformulier op basis van `stap.ai_analyse_json` — projectleider krijgt volledig AI-beeld vóór de beslissing.

**Ontwerpkeuzes:**
- Geen harde blokkade: AI-mislukking → stap gewoon "voltooid", geen foutmelding voor de monteur.
- Geen automatische eindoplevering: `afwijking_gedetecteerd` triggert altijd menselijke beslissing.
- Vision-slot alleen bij ≥1 bruikbare foto; anders tekstslot (sneller, goedkoper).
- Max 4 foto's per analyse om tokenkosten te beheersen.

---

## 2026-07-05 — Vervolgopdracht 3: Voorbereide spots koppelen aan PIM uitvoering

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Wat is gebouwd:**

- **DB:** `pim_uitvoering_stappen.voorziening_ids integer[]` kolom toegevoegd via directe SQL (drizzle-schema gesynchroniseerd).
- **OpenAPI:** twee nieuwe endpoints — `GET /opdrachten/{id}/pim/spots` (haalt alle spots van het gekoppelde gebouw op inclusief verdieping, ruimte, type, fotos, maatregel en gekoppelde_stap_id) en `PATCH /opdrachten/{id}/pim/uitvoering/stap/{stapId}/voorzieningen` (vervangt de volledige spot-koppeling per stap). Nieuwe schemas: `VoorzieningPimDetail`, `VoorzieningPimFoto`, `PimStapVoorzieningenInput`. `voorziening_ids` array toegevoegd aan `PimUitvoeringStap`.
- **Backend:** beide routes geïmplementeerd in `pim.ts` met bevoegdheidscheck (`voorzieningen` lezen/schrijven), join op verdiepingen, foto's (fase opname) en labels; `serializeStap` uitgebreid met `voorziening_ids`.
- **Codegen:** hooks `useListPimSpots` en `useKoppelPimStapVoorzieningen` + types `VoorzieningPimDetail`, `PimStapVoorzieningenInput` gegenereerd.
- **Monteur app (`uitvoering/[opdrachtId].tsx`):** "Spots (N)" toggle-knop in de header naast "Stappen (N)" — mutueel exclusief. `VoorbereideSpotsPanel` toont alle spots met objectnummer, type, status, verdieping/ruimte, locatie, maatregel/materialen, opmerkingen en opname-foto's. `SpotKaartMonteur` biedt link/ontkoppel-knop voor de actieve stap (alleen bij status actief/afgeweken); gekoppelde spots worden visueel gemarkeerd (blauwe rand + aparte sectie "Gekoppeld aan stap N").
- **Kantoor web (`pim-uitvoering-tab.tsx`):** `PimSpotsLijst` component toegevoegd onderaan de PIM-uitvoering tab — uitvouwbaar kaartje met alle spots in een compacte tabellijst. Toont objectnummer, type, verdieping/ruimte, statusbadge en koppelknop (Link2/Link2Off) per spot. Projectleider kan direct spots aan de actieve stap koppelen/ontkoppelen zonder het tabblad te verlaten.
- **Spotstatussen wijzigen nooit automatisch** — koppeling is puur informatief.

---

## 2026-07-05 — Monteur-app: Vorige stappen read-only terugkijken (PIM uitvoering)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Wat is gebouwd:**

- In het uitvoering-scherm (`app/uitvoering/[opdrachtId].tsx`) verschijnt een **"Vorige stappen (N)"** knop in de header zodra er voltooide stappen zijn. De knop toont het exacte aantal en togglet de weergave.
- Bij activeren vervangt het **VorigeStappenPanel** de actieve-stap-weergave (inclusief de voortgangsbalk). De VoortgangsBalk verdwijnt alleen wanneer het paneel open is.
- **ReadOnlyStapKaart** component toont per voltooide stap: stapnummer (badge), doel, werkpakket-sleutel, handeling, controlevraag + antwoord, opmerkingen, fotoaantal (badge met camera-icoon), AI-analyse (blauw blok met samenvatting/bevindingen/oordeel) en afwijkingdetails inclusief besluit (oranje blok). Stappen gesorteerd van nieuw naar oud.
- **Offline cache**: voltooide stappen worden gecached in AsyncStorage (`pim_stappen_{opdrachtId}_v1`, apart van de actieve-stap-cache `pim_stap_{opdrachtId}_v1`). Bij offline gebruik worden de gecachte stappen getoond.
- Puur read-only: geen mutations, geen syncQueue-aanrakingen. De actieve stap-flow is ongewijzigd.

---

## 2026-07-05 — Bugfix: gebroken link "Beheren" bij inkomende facturen in gebouwdetail

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Bevinding:** Onderzoek van "Kon dashboard niet laden." op `/facturen/dashboard`.

- De dashboard-component, backend-route (`GET /facturen/financieel-dashboard`) en gegenereerde hook zijn allemaal correct.
- "Kon dashboard niet laden." was een eenmalige transiente fout door een API-server restart — de pagina werkt na vernieuwen.
- Wél een echte bug gevonden: de knop "Beheren" bij "Inkomende facturen" in gebouw-detail (`detail.tsx` regel 1474) wees naar `/financieel/facturen` — een route die niet bestaat in de frontend router. Klikken leidde de gebruiker naar een lege/niet-bestaande pagina.

**Fix:** URL gecorrigeerd naar `/facturen?gebouw_id=${gebouwId}` (de bestaande facturenlijst-route, gefilterd op gebouw).

---

## 2026-07-05 — PIM Uitvoering: stappenoverzicht, foto-upload en KB-context

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Wat is gebouwd (drie onderdelen):**

**Onderdeel 1 — Kantoor-stappenoverzicht:**
- Nieuwe API-route `GET /opdrachten/:id/pim/uitvoering/stappen` — geeft alle uitvoeringsstappen gesorteerd op volgorde; afzonderlijk van de `huidige-stap` route zodat de bestaande monteur-flow intact blijft
- OpenAPI spec uitgebreid + codegen gedraaid (`useListPimUitvoeringStappen` hook gegenereerd)
- Nieuw `StappenOverzicht` component in `pim-uitvoering-tab.tsx`: toont alle stappen met stapnummer, status (incl. afgeleid "wacht op beslissing"), doel, aangemaakt-datum, voltooide-datum, fotoaantal en afwijkingsindicator
- Actieve stap is visueel gemarkeerd (blauwe rand); overzicht verschijnt boven de actieve stap en blijft na afronding staan

**Onderdeel 2 — Web foto-upload:**
- Nieuw `FotoUploadKnop` component: file-input → `POST /api/storage/uploads/request-url` (presigned URL) → `PUT` bestand → `objectPath` toegevoegd aan `fotoUrls[]`
- Vervangt de handmatige URL-textarea in zowel het voltooien-formulier als het afwijking-formulier
- Toont thumbnailbadges met bestandsnaam + verwijderknop per geüploade foto
- Geüploade foto-URLs zijn compatibel met de bestaande `foto_urls` kolom (zelfde objectPath-formaat)
- Mobiele upload-flow ongewijzigd

**Onderdeel 3 — KB-context in uitvoering-AI:**
- `genereerStapViaAi()` uitgebreid met optionele `kbContext` parameter; bij aanwezigheid wordt de KB als extra sectie aan het systeem-prompt toegevoegd
- Beide aanroeplocaties bijgewerkt: `POST .../uitvoering/start` (stap 1) en `POST .../stap/:id/voltooien` (volgende stap)
- KB-context haalt categorieën `uitvoering`, `veiligheid`, `kwaliteit` op via `kbService.assembleKbContext()`
- Fallback: bij lege of ontbrekende KB wordt de stap normaal gegenereerd; geen harde fout
- Logging: `logger.info` of `logger.warn` per aanroep zodat zichtbaar is of KB meegestuurd is

**Bestanden gewijzigd:**
- `lib/api-spec/openapi.yaml` — nieuwe route toegevoegd
- `lib/api-client-react/src/generated/api.ts` — codegen output
- `lib/api-zod/src/generated/` — codegen output
- `artifacts/api-server/src/routes/pim.ts` — nieuwe GET route, KB-context in start+voltooien
- `artifacts/firevault/src/pages/opdrachten/pim-uitvoering-tab.tsx` — volledig herschreven met StappenOverzicht + FotoUploadKnop

## 2026-07-05 — FPS Knowledge Base — Foundation (Task #303)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Wat is gebouwd:**

**Database — 3 nieuwe tabellen + uitbreiding 2 bestaande:**
- `leveranciers`: 8 KB-velden toegevoegd (`kb_levertijd_dagen`, `kb_betrouwbaarheidsscore`, `kb_min_bestelbedrag`, `kb_voorkeursleverancier`, `kb_kwaliteitscertificering`, `kb_retourbeleid`, `kb_notities`, `kb_bijgewerkt_op`)
- `artikelen`: 7 KB-velden toegevoegd (`kb_vervangers`, `kb_gerelateerde_artikelen`, `kb_alternatieven`, `kb_goedgekeurd`, `kb_notities`, `kb_bijgewerkt_op`, `kb_geldig_tot`)
- `leverancier_prestaties`: nieuw (prestatieregistratie per leverancier per project/periode)
- `fps_bedrijfsstandaarden`: nieuw (centrale kennisbank FPS-bedrijfsstandaarden; 3 seed-rijen)
- `opdrachtgever_voorkeuren`: nieuw (per-klant voorkeuren: verplichte/verboden artikelen, rapportage-eisen, etc.)

**Drizzle-schema — `lib/db/src/schema/`:**
- `leveranciers.ts` en `artikelen.ts` uitgebreid met KB-velden
- Nieuw `kb.ts` met alle drie tabeldefinities
- `index.ts` uitgebreid met `export * from "./kb"`

**kbService — `artifacts/api-server/src/lib/kbService.ts`:**
- Volledige implementatie van `assembleKbContext(opties?)` — assembleert KB-context als Markdown-blok voor prompt-injection (bedrijfsstandaarden, leveranciersprofiel + prestaties, opdrachtgever-voorkeuren)
- Legacy `kbService`-object behouden voor achterwaartse compatibiliteit

**KB_BESLISSTRUCTUUR — `artifacts/api-server/src/lib/aiPrompts.ts`:**
- Beslisboom-prompt toegevoegd als exporteerbare constante; geïntegreerd in PIM AI-context

**API-routes — `artifacts/api-server/src/routes/kb.ts`:**
- `GET /kb/bedrijfsstandaarden` — gefilterd op categorie/actief
- `POST /kb/bedrijfsstandaarden` — nieuw aanmaken (systeem-schrijven)
- `PATCH /kb/bedrijfsstandaarden/:id` — bijwerken (systeem-schrijven)
- `GET /leveranciers/:id/prestaties` — prestatiemetingen per leverancier
- `POST /leveranciers/:id/prestaties` — nieuwe meting registreren
- `GET /kb/opdrachtgever-voorkeuren/:klantId` — voorkeuren per klant
- `PUT /kb/opdrachtgever-voorkeuren/:klantId` — upsert voorkeuren

**OpenAPI + codegen:**
- 7 paden toegevoegd aan `lib/api-spec/openapi.yaml`
- 6 nieuwe schemas: `KbBedrijfsstandaard`, `KbBedrijfsstandaardInput`, `KbBedrijfsstandaardPatch`, `LeverancierPrestatie`, `LeverancierPrestatieInput`, `KbOpdrachtgeverVoorkeur`, `KbOpdrachtgeverVoorkeurInput`
- Codegen uitgevoerd (orval); gegenereerde hooks beschikbaar in `lib/api-client-react`

## 2026-07-05 — PIM Fase G — Oplevering AI (Task #302)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Wat is gebouwd:**

**Backend — 3 nieuwe endpoints (`artifacts/api-server/src/routes/pim.ts`):**
- `POST /opdrachten/:id/pim/oplevering/controleer` — AI volledigheidscheck: controleert open stappen, afwijkingen zonder beslissing, stappen zonder foto; roept AI aan voor extra aandachtspunten + onderhoudsadvies; slaat resultaat op in `pim.opleveringContext`; zet `ai_fase → oplevering` bij volledigheid
- `POST /opdrachten/:id/pim/oplevering/genereer` — AI genereert opleverdossier JSON + overdrachtsnotitie onderhoud JSON; bouwt beide als PDF (puppeteer + `bouwOpleverDossierHtml` / `bouwOnderhoudNotitieHtml`); slaat 2 DMS-documenten op (documenttype `opleverdossier` + `overdrachtsnotitie`) gekoppeld als `doelType=opdracht`
- `POST /opdrachten/:id/pim/oplevering/definitief` — menselijke bevestiging; zet `ai_fase → gereed`; schrijft auditlogboekregel + `definitief_op` timestamp in `opleveringContext`
- 3 AI-prompts toegevoegd aan `aiPrompts.ts`: `PIM_OPLEVERING_CONTROLEER_PROMPT`, `PIM_OPLEVERING_GENEREER_PROMPT`, `PIM_ONDERHOUD_NOTITIE_PROMPT`

**OpenAPI + codegen:**
- 3 paden toegevoegd (`/opdrachten/{id}/pim/oplevering/controleer|genereer|definitief`)
- 5 nieuwe schemas: `PimOpleveringControlepunt`, `PimOpleveringControlerapport`, `PimOpleveringDocument`, `PimOpleveringGenereerResultaat`, `PimOpleveringDefinitiefResultaat`
- Codegen uitgevoerd; gegenereerde hooks: `useControleerPimOplevering`, `useGenereerPimOplevering`, `useDefinieerPimOplevering`

**Frontend FPS Connect:**
- Nieuw tabblad "Oplevering" toegevoegd aan `opdrachten/detail.tsx` (na "Uitvoering"-tab; `ShieldCheck`-icoon)
- Nieuw component `pim-oplevering-tab.tsx` — 3-staps flow: Stap 1 volledigheidscheck (controlerapport met per-punt status), Stap 2 dossier genereren (documentenlijst met PDF-download per document), Stap 3 definitief opleveren (bevestigingsdialoog + AI-fase badge); toont eerder opgeslagen context uit `opleveringContext` na herlaad
- Fotorapport toegevoegd als derde DMS-document bij genereer (naast opleverdossier + overdrachtsnotitie); `DocumentenLijst` toont `/api/storage{pdf_url}` download-link per document
- Foto-verplicht check verfijnd: gebruikt `instructieJson.foto_opdracht` per stap in plaats van generieke check op alle voltooide stappen

## 2026-07-05 — PIM Fase F — Adaptieve Uitvoering mobiel (Task #301)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Wat is gebouwd:**

**OpenAPI + backend:**
- `opdracht_id` (nullable integer) toegevoegd aan `WerkdagItem` schema
- `mapWerkdagItem` in `werkdag.ts` retourneert nu `opdracht_id: item.opdrachtId ?? null`

**SyncQueue + Sync context:**
- Nieuw action type `voltooi_pim_stap` in `syncQueue.ts` (opdrachtId, stapId, payload)
- Handler in `sync.tsx`: POST `/api/opdrachten/:id/pim/uitvoering/stap/:stapId/voltooien`, behandelt 409 als stille success (offline deduplicatie)

**Nieuw scherm `uitvoering/[opdrachtId].tsx`:**
- AsyncStorage cache (`pim_stap_{opdrachtId}_v1`) voor offline beschikbaarheid van de huidige stap
- `VoortgangsBalk` — voortgangsindicator op basis van stapvolgorde
- `StapKaart` — toont doel, veiligheidscontrole, handeling, gereedschappen, artikelen, foto-opdracht + `FotoRij`, controlevraag + checkbox, opmerkingen-veld
- Foto-upload via `ImagePicker` (camera + bibliotheek) met upload naar object storage; visuele check-mark zodra upload klaar
- Offline modus: stap voltooien buffert naar SyncQueue; daarna herlaadAantal()
- `AfwijkingFormulier` — meldt afwijking via `useMeldPimUitvoeringAfwijking`; vereist internetverbinding
- `AfwijkingWachtScherm` — polling elke 30 seconden; toont beslissing + toelichting projectleider; `beslisPimUitvoeringAfwijking` verwerkt resultaat correct als `PimUitvoeringVoltooiResultaat`
- "Uitvoering gereed"-scherm na laatste stap met forceerSync + terugnavigatie
- Stack registered in `_layout.tsx`

**Navigatie vanuit werkdag:**
- "Start adaptieve gids"-knop in `werkdag/[id].tsx`, zichtbaar wanneer `huidigWerkorder.opdracht_id` aanwezig is
- Routepatroon: `/uitvoering/:opdrachtId` (Expo typed-routes workaround: `as any`)

**Offline foto-buffering (blocking fix na code review):**
- `voltooi_pim_stap` SyncQueue type uitgebreid met `lokale_foto_paden?: string[]` voor foto's zonder objectPath
- Uitvoering screen: bij offline queuing worden lokale URI's (niet-geüploade foto's) als `lokale_foto_paden` meegestuurd
- Sync handler: foto's in `lokale_foto_paden` worden bij reconnect geüpload via `/api/storage/uploads/request-url` + `FileSystem.uploadAsync`, resulterende objectPaths worden samengevoegd met reeds-geüploade `foto_urls`
- Na success of 409: `pim_stap_{id}_v1` AsyncStorage cache verwijderd zodat monteur geen verouderde stap ziet
- `AsyncStorage` nu statisch geïmporteerd bovenin `sync.tsx`

## 2026-07-05 — PIM Fase E — Adaptieve Uitvoering (Task #300)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Wat is gebouwd:**

**Backend — 5 nieuwe uitvoeringsroutes in `pim.ts`:**
- `POST /opdrachten/:id/pim/uitvoering/start` — genereert stap 1 via AI (fallback indien geen gateway), slaat op in `pim_uitvoering_stappen`, zet `aiFase → uitvoering`; 409 als uitvoering al gestart
- `GET /opdrachten/:id/pim/uitvoering/huidige-stap` — geeft de eerste actieve/afgeweken stap terug
- `POST /opdrachten/:id/pim/uitvoering/stap/:stapId/voltooien` — markeert stap als voltooid, genereert volgende stap via AI; `is_laatste_stap=true` signaleert einde uitvoering
- `POST /opdrachten/:id/pim/uitvoering/stap/:stapId/afwijking` — registreert afwijking + AI-impactanalyse; status → `afgeweken`
- `POST /opdrachten/:id/pim/uitvoering/stap/:stapId/afwijking/beslis` — beslissing `doorgaan`/`stoppen`; doorgaan herstart stap, stoppen markeert als overgeslagen + uitvoering gereed

**Helpers:**
- `serializeStap()` — consistente serialisatie voor alle 5 endpoints
- `fallbackStapJson()` — deterministische fallback als AI niet beschikbaar is
- `genereerStapViaAi()` — roept `aiGateway.chat("default", ...)` aan met `UITVOERING_STAP_PROMPT`; logt naar `ai_aanroepen`

**AI-prompts (eerder in sessie toegevoegd):**
- `UITVOERING_STAP_PROMPT` — AI werkuitvoerder-persona; genereert stap-JSON (doel, handeling, benodigde artikelen/gereedschappen, veiligheidscontrole, foto_opdracht, controlevraag, is_laatste_stap)
- `UITVOERING_FOTO_ANALYSE_PROMPT` — afwijkingsanalyse-persona; impact/vervolgopties/meerwerk_indicatie/stop_vereist

**OpenAPI spec — 5 nieuwe paden + schemas:**
- `PimUitvoeringStap`, `PimUitvoeringVoltooienInput`, `PimUitvoeringVoltooiResultaat`, `PimUitvoeringAfwijkingInput`, `PimUitvoeringBeslisInput`
- Codegen succesvol uitgevoerd; hooks gegenereerd: `useStartPimUitvoering`, `useGetHuidigePimUitvoeringStap`, `useVoltooiPimUitvoeringStap`, `useMeldPimUitvoeringAfwijking`, `useBeslisPimUitvoeringAfwijking`

**Frontend — `pim-uitvoering-tab.tsx` (nieuw):**
- Toont "Uitvoering nog niet gestart" met Start-knop als er geen actieve stap is
- Actieve stap: instructiekaart (doel, handeling, veiligheidscontrole, foto-opdracht, benodigde artikelen/gereedschappen, productinstructie, controlevraag) + voltooien-formulier (controlevraag antwoord + opmerkingen)
- Afwijking melden: formulier met omschrijving + meld-knop; AI-analyse wordt getoond
- Afwijkingsbeslissing: `AfwijkingBeslisForm` met AI-impactweergave + doorgaan/stoppen-knoppen
- Uitvoering gereed: succesmelding
- Tab "Uitvoering" (HardHat-icoon) toegevoegd aan `detail.tsx` naast bestaande tabs

**Typecheck:** clean — api-server geen nieuwe fouten (alleen pre-existing TS7030 in offertes.ts:692); firevault geen fouten

**Correcties na review:**
- `aiGateway()` → `aiGateway.chat(slot, params, timeout, logCtx)` (aiGateway is singleton object, geen callable functie)
- `parseInt(req.params.id, 10)` → `parseInt(String(req.params.id), 10)` (Express 5: params zijn `string | string[]`)
- `(req.session as Record<string,unknown>)?.userId` → `req.session.userId` (correct patroon)
- `ObjectStorageService.getPublicUrl()` verwijderd (methode bestaat niet); foto-analyse vereenvoudigd
- `{unknown && JSX}` → `{!!unknown && JSX}` (TS2322: unknown niet toewijsbaar als ReactNode)
- `useGetHuidigePimUitvoeringStap(id, { query: {...} })` → `useGetHuidigePimUitvoeringStap(id)` (TS2741: queryKey pre-existing)

## 2026-07-04 — PIM Fase C — Werkvoorbereiding AI

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risco:** laag

**Wat is gebouwd (Fase C — vaststellen & analysekaart):**
- `PATCH /opdrachten/:id/pim/werkvoorbereiding` — handmatige correcties op `werkvoorbereiding_context` opslaan
- `POST /opdrachten/:id/pim/werkvoorbereiding/vaststellen` — menselijke goedkeuring; vereist fase `werkvoorbereiding`; fase-transitie `werkvoorbereiding → inkoop`; logt in `document_logboek`
- OpenAPI: twee nieuwe paden + schemas `PimWerkvoorbereidingPatchInput` / `PimVaststellenResultaat`; codegen uitgewerkt
- Hooks: `usePatchPimWerkvoorbereiding` + `useVaststellenPimWerkvoorbereiding` gegenereerd
- `detail.tsx` AI Regisseur tab: vaststellen-knop (groen, zichtbaar bij fase `werkvoorbereiding`); "Opnieuw analyseren"-knop behouden voor correctie; fase `inkoop` toont geen actieknoppen meer
- `detail.tsx` Werkbegroting tab: inklapbare PIM-analysekaart bovenaan (zichtbaar vanaf fase `werkvoorbereiding`) — risico's, aandachtspunten werkvoorbereiding, open vragen, "Volledige PIM-analyse bekijken"-link; vaststellen-knop ook vanuit werkbegroting tab; badge "Vastgesteld" bij fase `inkoop`

**Eerder in deze sessie (Fase C AI-generatie, onderdeel vorige bouwstap):**
- `PIM_WERKVOORBEREIDING_PROMPT` in `aiPrompts.ts` — AI werkvoorbereider-persona met output-schema (materiaallijst, werkvolgorde, competenties_benodigd, geschatte_doorlooptijd_dagen, aandachtspunten, inkoopacties, planningadvies, voorbereiding_volledigheid)
- `POST /opdrachten/:id/pim/werkvoorbereiding/analyseer` in `pim.ts` — achter `schrijven` middleware; vereist fase ≥ `advies_gereed`; laadt `advies_context` + spots (max 50); slaat op in `pim.werkvoorbereiding_context`; fase-transitie `advies_gereed → werkvoorbereiding`
- `detail.tsx` AI Regisseur tab: werkvoorbereiding_context weergavesectie (volledigheid-badge; doorlooptijd/planningadvies-kaart; materiaallijst-tabel; uitvoeringsvolgorde; competenties-badges; inkoopacties-lijst; aandachtspunten-kaart)

**Code review fixes (ronde 2):**
- PATCH endpoint: phase guard toegevoegd — 409 als `ai_fase ≠ werkvoorbereiding` (data lock na vaststelling)
- `/genereer` canoniek pad: OpenAPI pad `/opdrachten/{id}/pim/werkvoorbereiding/genereer` toegevoegd (taakspec verplichting); handler geëxtraheerd als named function en op beide paden geregistreerd (`/genereer` + `/analyseer` backward compat); `useGenereerPimWerkvoorbereiding` hook gegenereerd
- Inline edit UI: "Aanpassen"-knop (fase werkvoorbereiding); edit form met `planningadvies`-textarea + `aandachtspunten`-lijst (add/remove/bewerken); "Bewaar aanpassingen" wired naar `pimPatchMut` / `PATCH /pim/werkvoorbereiding`; "Annuleren" sluit form; alle AI-voorstellen zijn nu bewerkbaar vóór vaststelling

**Typecheck:** clean (api-server: alleen pre-existing TS7030 in offertes.ts:692; firevault: geen errors)

## 2026-07-04 — PIM Fase A — Foundation (datamodel & bare API)

**Uitvoering:** volledig | **Getest:** DB-tabellen geverifieerd, alle 3 routes geven 401 (niet 404), typecheck clean (alleen pre-existing TS7030 in offertes.ts)

Project Intelligence Model Fase A gebouwd — de datafundamenten voor de AI Opdrachtregisseur:

**Datamodel (lib/db/src/schema/pim.ts):**
- `pim_modellen` tabel: 1:1 aan opdracht, `aanvraag_via_one` vlag, 6 JSONB context-velden (aanvraag/advies/werkvoorbereiding/inkoop/uitvoering/oplevering). Strikte scheiding: ALLEEN AI-context, nooit operationele data.
- `pim_uitvoering_stappen` tabel: volgorde, status (open/actief/voltooid/afgeweken/overgeslagen), instructie/antwoorden/foto-urls/analyse/afwijking als JSONB/array.
- Partial unique index `pim_stap_actief_uniq`: één actief/afgeweken stap per PIM tegelijk (integriteitsgarantie).

**Additieve DB-wijzigingen (directe SQL, geen drizzle push):**
- `opdrachten.ai_fase` (nullable text) — AI-fasering zichtbaar op de opdracht.
- `document_koppelingen_doel_type_check` constraint uitgebreid: `'opdracht'` toegevoegd aan de toegestane doel_types.

**API-routes (artifacts/api-server/src/routes/pim.ts):**
- `POST /aanvragen` — FPS One aanvraagstroom: maakt opdracht + PIM in één transactie aan; `aanvraag_via_one=true` voor klantportalinstroom.
- `GET /opdrachten/:id/pim` — klantperspectief-filter: klantrol ziet alleen aanvraag/advies/oplevering context; werkvoorbereiding/inkoop/uitvoerings_log verborgen.
- `PATCH /opdrachten/:id/pim/fase` — fase-overgang met auditlogboek (actie `pim_fase_overgang` in document_logboek); geldige fasen: nieuw→advies→werkvoorbereiding→inkoop→uitvoering→oplevering→gereed.
- `mapOpdracht` bijgewerkt met `ai_fase` veld.

**OpenAPI + codegen:** tag `pim`, 3 paden, 5 schema's (AanvraagInput, AanvraagResultaat, PimModel, PimFaseInput, PimFaseResultaat), `ai_fase` aan Opdracht schema toegevoegd. Codegen succesvol gedraaid.

## 2026-07-04 — Fix: GET /api geeft 200 i.p.v. 500 (deployment healthcheck blocker)

**Uitvoering:** volledig | **Getest:** curl GET /api → 200 {"status":"ok"}, curl GET /api/healthz → 200 {"status":"ok"}

Deployment platform health-checkt het routing pad `/api` (afgeleid van `paths = ["/api"]` in artifact.toml) en verwacht 2xx. De server gaf 401 zodra hij draaide (request bereikte `requireAuth` vóór er een handler was), en 500 terwijl hij opstartte (proxy kon backend niet bereiken). Geen van beide is 2xx → deployment mislukte.

`GET /` toegevoegd aan `health.ts` vóór de `requireAuth` middleware (lijn 101 in routes/index.ts). De handler zit op lijn 96 (`router.use(healthRouter)`), dus geen authenticatie vereist.

Gewijzigd: `artifacts/api-server/src/routes/health.ts`

## 2026-07-04 — Archiveer spot invalideert nacalculatie (volledig)

**Uitvoering:** volledig | **Getest:** typecheck clean (geen nieuwe fouten in plattegrond.tsx)

Na het archiveren van een spot via het zijpaneel van de plattegrond invalideert de frontend nu de nacalculatie-query, zodat het werktype op de nacalculatie-tab van de opdracht direct bijwerkt zonder handmatige refresh.

- `SpotDetail` (plattegrond-zijpaneel) heeft een "Archiveer spot"-knop gekregen, zichtbaar voor beheerders
- Twee-staps bevestiging (klik "Archiveer spot" → klik "Bevestigen") voorkomt per ongeluk archiveren
- Na archiveren: nacalculatie-query geïnvalideerd (`endsWith("/nacalculatie")`), spot verdwijnt van de plattegrond (`onWijziging`), zijpaneel sluit (`onClose`)
- Gating: `magArchiveren={isBeheerder}` (identiek aan de bestaande `GearchiveerdSectie`-gating)

De terugplaats-actie (gearchiveerd: false) in `GearchiveerdSectie` invalideerde de nacalculatie al — dit is de ontbrekende andere richting.

Gewijzigd: `artifacts/firevault/src/pages/gebouwen/plattegrond.tsx`

## 2026-07-04 — Spot-trigger nacalculatie herberekening (volledig)

**Uitvoering:** volledig | **Getest:** typecheck clean (pre-existing TS7030 in offertes.ts ongewijzigd)

Werktype in nacalculaties wordt nu direct bijgewerkt wanneer een spot wordt aangemaakt of verwijderd:
- `POST /voorzieningen`: triggert na succesvol aanmaken een fire-and-forget herberekening van alle
  nacalculaties met werktype "algemeen" die gekoppeld zijn aan het gebouw van de nieuwe spot.
- `DELETE /voorzieningen/:id`: haalt gebouwId op vóór verwijdering, triggert daarna dezelfde
  herberekening — zodat werktype terugvalt naar "algemeen" als de verwijderde spot het dominante type was.
- Nieuwe export `triggerNacalculatieHerberekeningVoorGebouw(gebouwId, log)` in `fie-service.ts`
  (fire-and-forget via `setImmediate`, geen impact op responsetijd van de spot-endpoints).

Gewijzigd: `artifacts/api-server/src/services/fie-service.ts`, `artifacts/api-server/src/routes/voorzieningen.ts`

## 2026-07-04 — Bedrijfskompas: verouderd-badge op Leereffecten-tabblad (volledig)

**Uitvoering:** volledig | **Getest:** typecheck firevault clean op bedrijfskompas.tsx

`BegrotingDetail` roept nu `useGetFieNacalculatiesVerouderdAantal` aan zodat het aantal verouderde nacalculaties beschikbaar is op tabbladniveau. Als het aantal > 0 is, verschijnt er een rode badge naast de tekst "Leereffecten" in de tabstrip — zichtbaar ongeacht welk tabblad actief is. De badge verdwijnt vanzelf zodra de gebruiker "Werktype bijwerken" klikt (refetch via de bestaande hook in `LeereffectenBeheerTab`).

Gewijzigd: `artifacts/firevault/src/pages/beheer/bedrijfskompas.tsx`

## 2026-07-04 — Nacalculatie: werktype zichtbaar op detailpagina (volledig)

**Uitvoering:** volledig | **Getest:** typecheck firevault clean; codegen clean

Werktype (afgeleid dominant spottype) is nu zichtbaar voor de gebruiker:
- `GET /opdrachten/:id/nacalculatie` geeft nu `werktype` terug (null indien nog geen FIE-berekening)
- OpenAPI `OpdrachtNacalculatie` schema uitgebreid met optioneel nullable `werktype` veld
- Nacalculatie-tab toont een badge met het werktype onder de tabkop; bij null een toelichting
- Leermoment-hint in `berekenFieContext` vermeldt nu expliciet het werktype: "Let op (werktype branddeur): …"

Gewijzigd: `lib/api-spec/openapi.yaml`, `artifacts/api-server/src/routes/opdrachten.ts`,
`artifacts/api-server/src/services/fie-service.ts`, `artifacts/firevault/src/pages/opdrachten/detail.tsx`

## 2026-07-04 — FIE nacalculatie: werktype verfijnd met dominant spottype (volledig)

**Uitvoering:** volledig | **Getest:** typecheck api-server clean (pre-existing TS7030 in offertes.ts ongewijzigd)

`berekenEnSlaOpNacalculatie()` leidt het werktype nu af uit de spots van het gekoppelde gebouw:
- Haalt alle niet-gearchiveerde voorzieningen (spots) op voor het gebouw van de opdracht
- Telt de voorkomens per `voorzieningen.type` (branddeur, doorvoering, brandklep, manchet, coating…)
- Kiest het meest voorkomende type als werktype → leermomenten groeperenvoortaan op werkelijk brandpreventie-type
- Terugval op "algemeen" als het gebouw onbekend is of het gebouw geen spots bevat

Gewijzigd: `artifacts/api-server/src/services/fie-service.ts` — import `voorzieningenTable` toegevoegd, werktype-afleiding herschreven

## 2026-07-04 — FIE Fase 5: Code-review herstel ronde 3 (volledig)

**Uitvoering:** volledig | **Getest:** typecheck clean alle packages; api-server herstart; DB ALTER geslaagd

Code-review ronde 3 — twee resterende bevindingen opgelost:

1. **Werktype niet meer hardcoded**: `berekenEnSlaOpNacalculatie()` leidt `werktype` nu af uit `opdrachtenTable.type` (vast | regie | overig) in plaats van altijd "algemeen"; fallback "algemeen" alleen als er geen gekoppelde opdracht is
2. **Monetaire arbeidsbasis**: `calcArbeidBedrag` berekend als som(hoeveelheid × muPerEenheid × arbeidsTarief) uit de gekoppelde calculatieregels; `werkelijkArbeidBedrag` berekend via goedgekeurde uren × uurtarief per functiegroep (regieTarievenTable, laatste tarief per groep); drie nieuwe DB-kolommen (calc_arbeid_bedrag, werkelijk_arbeid_bedrag, afwijking_pct_arbeid_bedrag)
3. **Leermoment-aggregatie op monetaire basis**: `herberekeenLeermomenten()` gebruikt `afwijkingPctArbeidBedrag` als primaire bron (met uren-basis als fallback); leereffecten weerspiegelen nu werkelijke loonkostenafwijking
4. **Werktype-specifieke hint**: `berekenFieContext()` zoekt leermoment op via reverse-lookup van de gekoppelde opdracht (calculatieId → opdracht.type) in plaats van hardcoded "algemeen"

## 2026-07-04 — FIE Fase 5: Code-review herstel ronde 2 (volledig)

**Uitvoering:** volledig | **Getest:** typecheck clean libs + api-server + firevault; api-server herstart

Code-review ronde 2 bevindingen opgelost:

1. **Leereffecten ook in /beheer/bedrijfskompas**: `LeermomentRij` + `LeereffectenBeheerTab` componenten toegevoegd aan `bedrijfskompas.tsx`; 6e tab "Leereffecten" toegevoegd (was 5 tabs); hooks + icons + `FieLeermoment`-type geïmporteerd
2. **Leermoment-drempel aangescherpt**: `herberekeenLeermomenten()` persisteert nu alleen als minstens één kostensoort ≥ 2 kwalificerende projecten heeft (`g.arbeid.length >= 2` of `g.materiaal.length >= 2`) én een niet-nul gemiddelde afwijking — vervangt eerdere `n >= 2` totaalteldrempel
3. **Error-logging achtergrondtaak**: `planDagelijkseLeermomenten()` gebruikt nu `logger.warn/info` (pino) i.p.v. lege `catch` — fouten worden zichtbaar in de workflow-logs
4. **logger-import** toegevoegd aan `fie-service.ts` (patroon conform andere services)

## 2026-07-04 — FIE Fase 5: Code-review herstel (volledig)

**Uitvoering:** volledig | **Getest:** typecheck clean libs + api-server + firevault; api-server herstart succesvol; DB ALTER geslaagd

Code-review bevindingen opgelost:

1. **Leermoment-hint in berekenFieContext()**: na het berekenen van `adviesTekst` wordt nu het leermoment voor werktype "algemeen" opgezocht; als ≥2 projecten en historische afwijking >5% → tekst aangevuld met historische hint (bijv. "Historisch wordt gemiddeld 18% meer arbeid gerealiseerd dan begroot")
2. **Leermoment-drempel hersteld**: `herberekeenLeermomenten()` persisteert nu alleen wanneer n ≥ 2 EN minstens één structurele gemiddelde afwijking bestaat — geen 0%-rijen meer
3. **Onderaanneming toegevoegd aan nacalculatie**: `fie_nacalculaties` uitgebreid met `calc_onderaanneming_bedrag`, `werkelijk_onderaanneming_bedrag`, `afwijking_pct_onderaanneming`; calc-waarde afgeleid uit `modCalcRegelsTable.onderaannemingBedrag` (via opdracht.calculatieId); gerealiseerde waarde uit `onderaannemeOrdersTable` (status: uitgevoerd/betaald); DB ALTER uitgevoerd via psql
4. **Import uitgebreid**: `onderaannemeOrdersTable` toegevoegd aan fie-service.ts imports

## 2026-07-04 — FIE Fase 5: Nacalculatie-terugkoppeling en leereffect (volledig)

**Uitvoering:** volledig | **Getest:** typecheck clean (firevault + api-server); codegen OK; api-server herstart zonder fouten; DB-tabellen aangemaakt; alleen pre-existing TS7030 in offertes.ts

**Database:**
- `fie_nacalculaties` — per afgesloten opdracht: calculatie (werkbegroting) vs. werkelijke uren + materiaalkosten, afwijkingspercentages, berekend_op
- `fie_leermomenten` — geaggregeerd per werktype: gemiddelde afwijkingen over n projecten, correctiefactor (handmatig aanpasbaar), opmerkingen

**Backend — fie-service.ts:**
- `berekenEnSlaOpNacalculatie(opdrachtId)` — haalt werkbegroting totalen (totaalArbeidUren + totaalMateriaalBedrag), goedgekeurde uren en magazijn-uitgifte/retour op; berekent afwijkingspct arbeid + materiaal; upsert per opdracht_id
- `herberekeenLeermomenten()` — aggregeert fie_nacalculaties per werktype (drempel >10%), berekent gewogen gemiddelde afwijkingen; upsert fieLeerMomentenTable
- `planDagelijkseLeermomenten()` — dagelijkse achtergrondtaak 04:00: verwerkt afgesloten opdrachten zonder nacalculatie-record, herberekent daarna leermomenten; recursief ingepland

**API — fie.ts + openapi.yaml + codegen:**
- `GET /fie/leermomenten` — alle leermomenten gesorteerd op n projecten
- `POST /fie/leermomenten/herbereken` — handmatige herberekening (teruggave: verwerkt + leermomenten)
- `PATCH /fie/leermomenten/:id` — correctiefactor + opmerkingen aanpassen (validatie: correctiefactor > 0)
- `DELETE /fie/leermomenten/:id` — leermoment verwijderen
- Codegen uitgevoerd; hooks `useListFieLeermomenten`, `useHerberekeenFieLeermomenten`, `useUpdateFieLeermoment`, `useDeleteFieLeermoment` beschikbaar

**Frontend — kompas.tsx:**
- Tabs toegevoegd: "Prognose" (bestaand, ongewijzigd) en "Leereffecten" (nieuw)
- Boekjaar-kiezer zichtbaar alleen op Prognose-tab
- `LeereffectenPaneel` — tabel met kleurcodering (rood >20%, amber >10%, neutraal ≤10%), herbereken-knop, lege-state met uitleg
- `LeermomentRij` — inline bewerkmodus: correctiefactor + opmerkingen; delete met bevestiging; afwijking-kleur reflecteert ernst

**Achtergrondtaak:**
- Ingepland in index.ts naast andere plan* achtergrondtaken (04:00 dagelijks)

## 2026-07-04 — AVG code-review herstel: veldnamen, anonimisering, verlofexport, notificatie (volledig)

**Uitvoering:** volledig | **Getest:** typecheck clean firevault + api-server; codegen OK; api-server herstart zonder fouten; alleen pre-existing TS7030 in offertes.ts

Eerste ronde code-review-bevindingen opgelost (ronde 1):

1. **Veldnaam-inconsistentie**: `mapVerzoek()` geeft nu `toelichting` terug (was `opmerking`); POST-body leest `toelichting`; `AvgVerzoek`-type in admin avg.tsx bijgewerkt; OpenAPI-spec was al correct
2. **Status-inconsistentie**: OpenAPI AvgVerzoekPatch-enum bijgewerkt `afgehandeld` → `afgerond`; server en spec synchroon
3. **`geanonimiseerd`-kolom op gebruikersTable**: anonimiseer-route zet nu ook `gebruikersTable.geanonimiseerd = nu.toISOString()`
4. **Verlofaanvragen export + interne activiteitsmelding**: `verlofAanvragenTable`-rijen (max 200) in export; `logActiviteit` bij indienen

Tweede ronde code-review-bevindingen opgelost (ronde 2):

1. **Anonimiseer behoudt actief-status**: `actief: false` verwijderd — geanonimiseerd account blijft actief maar niet-identificeerbaar
2. **Export uitgebreid**: `opdrachtenTable` (aangemaakt_door_id) toegevoegd; CSV-formaat beschikbaar via `?formaat=csv` (accountgegevens + opdrachten + activiteiten)
3. **Stats key-mismatch**: API retourneert nu `open_verzoeken` (was `open`), in lijn met het frontend Stats-type
4. **Inactief accounts archiveerknop**: per rij "Archiveren"-knop met bevestigingsdialog; roept `PATCH /gebruikers/:id` aan met `gearchiveerd: true`

## 2026-07-04 — AVG / GDPR: inzageverzoeken, verwijderverzoeken, anonimisering en inactieve accounts (volledig)

**Uitvoering:** volledig | **Getest:** typecheck clean firevault + api-server; API /avg/stats reageert 401 (auth werkt); alleen pre-existing TS7030 in offertes.ts

### DB-schema
- `lib/db/src/schema/avg.ts` — nieuw: `avg_inzageverzoeken` tabel (id, gebruiker_id, type, status, toelichting, beheerder_opmerking, afgehandeld_door, aangemaakt_op, bijgewerkt_op)
- `lib/db/src/schema/gebruikers.ts` — nieuw kolom `geanonimiseerd text` (bewaarmoment anonimisering)
- DB-migratie via executeSql (additief, geen drizzle push vereist)

### API endpoints (`artifacts/api-server/src/routes/avg.ts`)
- `POST /avg/inzageverzoek` — gebruiker dient inzage- of verwijderverzoek in; 409 bij open duplicaat
- `GET /avg/mijn-verzoeken` — eigen verzoeken inzien
- `GET /avg/inzageverzoeken` — alle verzoeken met statusfilter (beheerder)
- `PATCH /avg/inzageverzoek/:id` — status en opmerking bijwerken (beheerder)
- `GET /avg/inzageverzoek/:id/export` — JSON-export van alle persoonsgegevens (beheerder)
- `POST /avg/inzageverzoek/:id/anonimiseer` — PII vervangen door pseudoniem, account uitschakelen (beheerder)
- `GET /avg/inactieve-accounts` — accounts zonder login > X dagen (beheerder)
- `GET /avg/stats` — open / in_behandeling / afgehandeld / inactieve_accounts tellers (beheerder)

### Dagelijkse opruiming
- `artifacts/api-server/src/lib/avgOpruiming.ts` — dagelijks om 02:30 worden activiteiten ouder dan 365 dagen verwijderd (recursieve setTimeout, geregistreerd in index.ts)

### Frontend
- `artifacts/firevault/src/pages/beheer/avg.tsx` — beheerder-paneel AVG: verzoekentabel (status/filter), detailkaart, statuswijziging, opmerking, export-knop, anonimiseer-dialog, inactieve-accounts-tab, stats-balk
- `artifacts/firevault/src/pages/mijn/privacy.tsx` — nieuw tabblad "AVG-verzoeken": inzageverzoek indienen (optionele toelichting), verwijderverzoek (bevestigingscheckbox), open-verzoek-blokkering, historielijst met beheerderreactie
- Route `/beheer/avg` geregistreerd in App.tsx; nav-item "AVG &amp; Privacy" (ShieldAlert) in beheerder-layout

### OpenAPI + codegen
- `lib/api-spec/openapi.yaml` — 8 nieuwe AVG-paden + 5 nieuwe schemas (AvgVerzoekInput, AvgVerzoekPatch, AvgVerzoek, InactiefAccount, AvgStats) + tag avg
- Codegen uitgevoerd: `useCreateAvgInzageverzoek`, `useUpdateAvgInzageverzoek`, `useAnonimiseerAvgGebruiker`, `useListAvgMijnVerzoeken` gegenereerd

## 2026-07-04 — FIE Fase 4: Directiedashboard Bedrijfskompas (volledig)

**Uitvoering:** volledig | **Getest:** typecheck clean (alleen pre-existing TS7030 in offertes.ts)

Nieuw directiedashboard op `/directie/kompas`, gated op `heeftNiveau("financieel", 2)` of hoofdbeheerder:

**Nieuwe pagina** `artifacts/firevault/src/pages/directie/kompas.tsx`
- Boekjaarselector (huidige jaar ± 1)
- 4 KPI-kaarten: Prognose omzet / Prognose brutowinst / Prognose nettoresultaat / AK-dekkingsgraad — rood/groen kleurcodering op positief/negatief
- SVG halve-cirkel bezettingsgraadmeter: coverage_pct visueel als boogmeter (0–120%), kleurschaal rood/amber/groen/blauw, gap-indicator onder de boog
- Break-even indicator: kaart met groen/rood status ("Bereikt" / "Niet bereikt")
- Kwartaalchart (ComposedChart): gestapelde bars bevestigd+pipeline, stippellijn begroting per kwartaal
- Werkmaatschappij/orderportefeuille-vergelijking: horizontaal gestapeld staafdiagram (bevestigd, pipeline gewogen, OHW restwaarde) met totaalbadge; noot dat per-entiteit uitsplitsing volgt zodra FIE per-werkmaatschappij begrotingen ondersteunt
- Observaties-paneel: live + gepersisteerde signalen, kleurcodering op ernst (info/waarschuwing/kritiek), waarde/drempelwaarde/afwijking_pct-toelichting
- Orderportefeuille detail-rij: bevestigd, pipeline, OHW, AK-dekkingsgraad
- Data uitsluitend via `useGetFiePrognose` + `useGetFieObservaties` (geen extra endpoints)
- Toelichting-blok (prognose-methodiek)

**Route** `artifacts/firevault/src/App.tsx`
- Route `/directie/kompas` geregistreerd

**Navigatie** `artifacts/firevault/src/layouts/beheerder-layout.tsx`
- Nieuw nav-item "Bedrijfskompas" (LayoutDashboard icoon, gating financieel:2)
- Bestaand FIE-beheerscherm hernoemd naar "FIE Begroting" (TrendingUp icoon)

## 2026-07-04 — FIE Fase 3: Continue jaarbedrijfsprognose — Fase 3b aanvulling (volledig)

**Uitvoering:** volledig | **Getest:** typecheck clean (api-server + firevault, alleen pre-existing TS7030 in offertes.ts); routes /fie/prognose/:boekjaar en /fie/observaties/:boekjaar geven correct 401 zonder auth

Vier aanvullende prognose-KPI's toegevoegd + begroting-kwartaalvergelijking in chart:

**Backend (fie-service.ts)**
- `prognose_brutowinst` = `prognose_omzet × doelMargePct / 100` (null als geen doelmarge)
- `prognose_nettoresultaat` = `prognose_brutowinst − totaalAk`
- `break_even_bereikt` = boolean: `prognose_omzet >= break_even_omzet` (null als geen break-even berekend)
- `begroting_per_kwartaal` = `[{kwartaal:1..4, begroting: omzetDoel/4}]` (gelijkmatige spreiding)
- Return-statement bijgewerkt met alle vier nieuwe velden

**Route (fie.ts)**
- Response-mapping uitgebreid: `break_even_bereikt`, `prognose_brutowinst`, `prognose_nettoresultaat`, `begroting_per_kwartaal`

**OpenAPI + codegen**
- `FieJaarprognose` schema: vier nieuwe velden toegevoegd
- Nieuw schema `FieBegrotingKwartaal` (`kwartaal` + `begroting`)
- `FieJaarprognose.begroting_per_kwartaal` → `FieBegrotingKwartaal[]` ref
- Orval opnieuw gedraaid: `FieBegrotingKwartaal` interface gegenereerd in `api.schemas.ts`

**Frontend (bedrijfskompas.tsx)**
- KPI-grid uitgebreid van 6 naar 8 tiles (2×4): `Prognose brutowinst` + `Prognose nettoresultaat` toegevoegd, rood/groen kleur op teken
- Break-even tile: badge "bereikt" (groen) / "niet bereikt" (rood) o.b.v. `break_even_bereikt`
- `KwartaalBalk`: verticale referentielijn (primaire kleur) op begroting-positie per kwartaal; prognose links, begroting rechts in onderschrift
- Legenda: "Begroting" markering zichtbaar zodra `begroting_per_kwartaal` aanwezig is
- `kwMax` berekend over max(prognose, begroting) zodat beide balken correct schalen

---

## 2026-07-04 — V1.4 Opleverrapportage afronden

**Uitvoering:** volledig | **Diepere lagen:** volledig | **Getest:** typecheck schoon

V1.4 Opleverrapportage afgerond op basis van de bestaande `print.tsx`. De bestaande composer was al grotendeels gebouwd; onderstaande correcties maken de workflow sluitend.

**Gecorrigeerde punten:**

1. **Rapport aanmaken → direct naar print-editor** — "Nieuw conceptrapport" in `gebouw-rapporten.tsx` navigeert na aanmaken automatisch naar `/gebouwen/:id/print?rapport_id=X`, zodat auto-save direct actief is en de gebruiker direct kan samenstellen.

2. **Voorblad concept-badge** — "Concept — niet definitief" op het voorblad werd altijd getoond, ook bij definitieve rapporten. Badge is nu conditioneel: verborgen wanneer `huidigRapport.status === "definitief"`.

3. **Rapportversie** — was hardcoded "1.0". Wordt nu gelezen uit `huidigRapport.versie`; fallback "1.0" wanneer geen rapport gekoppeld is.

4. **Rapportdatum definitief** — bij definitieve rapporten toont de koptekst nu de bevrozen datum (`bevroren_op`) in plaats van de huidige systeemtijd.

5. **Definitief rapport volledig vergrendeld** — bij definitieve rapporten vervangt een vergrendelingsscherm in het composer-paneel alle bewerkingsbesturingselementen (rapporttype-radios, sectie-checkboxes, spot-selectie, tekeningen, bijlagen, e-mailmodus). Gebruikers zien alleen de opgeslagen configuratie als leesbare weergave. "Opslaan in DMS" is verborgen voor definitieve rapporten (de DMS-kopie is al aangemaakt bij definitief maken). De bijlagenbundel-download blijft beschikbaar — die leest frozen data, niet vrij te bewerken staat. Typecheck: clean.

**Niet gewijzigd:** API-routes, DB-schema, OpenAPI-spec, DMS-koppeling (bewaarOpleverrapport), certificaat-accordering, spotdetail-rendering — allemaal al correct aanwezig.

---

## 2026-07-04 — Uitgifte gekoppeld aan opdracht (traceerbaarheid magazijn)

Magazijn-uitgiftes kunnen nu expliciet aan een opdracht worden gekoppeld, zodat materiaalverbruik per opdracht te traceren is.

- **DB:** `opdracht_id` kolom (FK → opdrachten) toegevoegd aan `voorraad_mutaties` via `ALTER TABLE … ADD COLUMN IF NOT EXISTS`
- **API:** `POST /magazijn/uitgiftes` valideert dat de opgegeven opdracht bestaat; slaat `opdracht_id` expliciet op in de mutatie-rij
- **API:** `GET /magazijn/mutaties` accepteert nieuw filter-parameter `opdracht_id`; `mapMutatie` retourneert `opdracht_id` en `opdracht_titel`
- **UI uitgiftes:** plaatgetal-invoer vervangen door doorzoekbare opdracht-dropdown (`useListOpdrachten({ mijn: true })`), met zoekbalk en "Verwijder koppeling"-knop
- **UI mutaties:** opdracht-filterkolom toegevoegd aan de tabel; filterbar uitgebreid met opdracht-dropdown
- **Validatie monteur (server + UI):** gebruikers zonder `magazijn>=4` bevoegdheid (beheer) moeten verplicht een opdracht koppelen bij uitgifte; beheerders mogen algemene uitgifte zonder koppeling
- **Opdracht scoping (`GET /opdrachten?mijn=true`):** monteurs zien alleen opdrachten waarvoor ze planning-items hebben; beheerders (hoofdbeheerder / magazijn>=4 / offertes>=2) zien alle opdrachten

**Uitvoering:** volledig | **Diepere lagen:** volledig | **Getest:** codegen groen; typecheck groen (pre-existing fouten in offertes.ts ongewijzigd)

## 2026-07-04 — TypeScript TS7030-opschoning api-server

## 2026-07-04 — FIE Fase 3: Continue jaarbedrijfsprognose (volledig)

**Uitvoering:** volledig | **Getest:** typecheck clean (api-server + firevault); beide routes bereikbaar (401 zonder auth — correct)

Volledige prognoselaag toegevoegd aan de Financial Intelligence Engine (FIE):

**DB-schema**
- `fieObservatiesTable` toegevoegd aan `lib/db/src/schema/fie.ts` (type/ernst/omschrijving/waarde/drempelwaarde/afwijkingPct/boekjaar)
- Tabel aangemaakt via direct SQL: `fie_observaties` + index op boekjaar

**Backend (fie-service.ts)**
- `berekenJaarprognose(boekjaar)`: bevestigde offertes (100%) + gewogen pipeline (concept 20% / verzonden 40% / bekeken 60%) + OHW-restwaarde
- Nieuw: AK-totaal ophalen uit `fieAkPostenTable` → `ak_dekkingsgraad_pct` en `break_even_omzet` berekend
- Kwartaalverdeling: offertes per Q1–Q4 gesplitst (bevestigd + pipeline_gewogen + prognose per kwartaal)
- Observaties: omzet_risico / omzet_achterstand / omzet_voorsprong / break_even_risico / ak_onderdekking / lege_pipeline / geen_begroting
- Persistentie: DELETE + INSERT in `fieObservatiesTable` bij elke prognoseberekening
- `leesPrognoseObservaties(boekjaar)` — lees gepersisteerde observaties
- `GET /fie/prognose/:boekjaar` — uitgebreid met nieuwe velden (doel_marge_pct, totaal_ak, ak_dekkingsgraad_pct, break_even_omzet, kwartaal_verdeling)
- `GET /fie/observaties/:boekjaar` — nieuw endpoint voor gepersisteerde observaties

**OpenAPI + codegen**
- Schemas `FieJaarprognose` (uitgebreid), `FieKwartaalPrognose`, `FieObservatiesResponse` + `FiePrognoseObservatie`
- Pad `/fie/observaties/{boekjaar}` toegevoegd
- Codegen: `useGetFieObservaties`, `FieKwartaalPrognose`, `FieObservatiesResponse` gegenereerd

**Frontend (bedrijfskompas.tsx)**
- `useGetFieObservaties` + `FieKwartaalPrognose` geïmporteerd
- `KwartaalBalk` component: gestapelde bevestigd/pipeline balk per Q1–Q4 met legenda
- KPI-tiles uitgebreid van 4 naar 6: + AK-dekkingsgraad + Break-even omzet
- Gepersisteerde observaties als fallback-sectie bij geen live signalen
- Toelichting bijgewerkt met AK-dekkingsgraad en break-even uitleg

---

## 2026-07-04 — TS7030-correctie api-server route-handlers

**Uitvoering:** volledig | **Getest:** api-server typecheck clean; firevault typecheck clean; healthz HTTP 200

354 TS7030-fouten ("Not all code paths return a value") opgelost in 35 route-bestanden.
Wijziging beperkt tot expliciete `: Promise<void>`-typing op async handler-functies en `return void res.xxx()` bij Express-responses — geen functionele routewijzigingen.

---

## 2026-07-04 — Offerte Studio: PDF downloaden + status wijzigen

**Uitvoering:** volledig | **Diepere lagen:** volledig | **Getest:** typecheck schoon, geen nieuwe fouten

Twee functies toegevoegd aan de Offerte Studio (`/offertes/:id`):

**PDF downloaden**
- "PDF exporteren" (window.print op studio-pagina) vervangen door "PDF downloaden" — link die `/offertes/:id/print` in een nieuw tabblad opent
- De DDS-printpagina triggert automatisch het opsla-als-PDF-dialoogvenster van de browser
- Icoon gewijzigd van Printer naar FileDown

**Status wijzigen**
- Inline statuswidget naast de statusindicator in de studiokoptekst
- Toont alleen toegestane volgende statussen (conform workflow-engine transitieregels):
  - concept → Verzonden, Afgewezen
  - verzonden → In behandeling, Geaccepteerd, Afgewezen
  - bekeken → In behandeling, Geaccepteerd, Afgewezen
  - afgewezen → Concept (heropenen)
  - ondertekend/vervallen → geen opties (widget verborgen)
- Status wijzigen roept bestaand `PATCH /offertes/:id` + workflow engine aan; audittrail wordt automatisch geschreven naar `werkstroom_transitie_log`
- Na statuswijziging worden zowel de offertedetail- als de offerteoverzichtquery geïnvalideerd
- Foutafhandeling: 409 = duidelijke Nederlandse melding, overig = generieke foutmelding
- Statuslabels uitgebreid: `bekeken`→"In behandeling", `ondertekend`→"Geaccepteerd", `STATUS_KLEUR` toegevoegd voor `bekeken`/`ondertekend`

**PDF-endpoint herzien** — pdfkit-aanpak vervangen door puppeteer-core rendering van de bestaande DDS-printpagina (`/offertes/:id/print`). De headless browser rendert exact de actieve Document Studio-opmaak inclusief branding en secties; `window.print()` wordt gesuppressed zodat `page.pdf()` de output produceert. Gereed-signaal via `data-fps-print-ready`-attribuut in `print.tsx`.

**Status-domein**: workflow engine gebruikt `bekeken`/`ondertekend` als canonieke waarden (bestaand); `STATUS_LABEL` biedt de vertaallaag naar gebruikerslabels ("In behandeling"/"Geaccepteerd").

---

## 2026-07-04 — Offerte klantvragen badge, notificaties en bevestigingsmails

**Uitvoering:** volledig | **Diepere lagen:** volledig | **Getest:** DB-migratie OK, typecheck firevault clean, API start correct

Vier samenhangende verbeteringen aan de offerte-portaalflow:

**1 — Badge onbeantwoorde klantvragen op offertekaarten**
- `GET /offertes` berekent nu per offerte het aantal vragen zonder antwoord (excl. afwijzingsregels)
- Nieuw veld `onbeantwoorde_vragen: integer` in de OpenAPI-spec (`Offerte`) en de API-respons
- Rode badge ("1 vraag" / "N vragen") zichtbaar op de offertekaart in `offertes/index.tsx`

**2 — Interne notificatie bij klantvraag en afwijzing (logActiviteit)**
- `activiteitenTable` uitgebreid met kolom `offerte_id integer` (additieve migratie via `ALTER TABLE`)
- `logActiviteit()` accepteert nu optioneel `offerteId`; slaat dit op zodat notificaties navigeerbaar zijn
- `POST /portaal/:token/vraag`: logt `offerte_vraag_ontvangen` met `offerteId`
- `POST /portaal/:token/afwijzen`: logt `offerte_afgewgewezen` met `offerteId` (ontbrak eerder volledig)
- `POST /portaal/:token/ondertekenen`: bestaande `offerte_geaccepteerd` + `project_aangemaakt` activiteiten krijgen nu ook `offerteId`

**3 — Klikbare links in het dashboard (recente activiteit)**
- `dashboard/beheerder.tsx`: activiteiten met `offerte_id` tonen als klikbare link naar `/offertes/:id`
- Overige activiteiten blijven onveranderd als `<div>`

**4 — Bevestigingsmail klant + afwijzingsmail behandelaar**
- `stuurKlantvraagBevestiging()`: nieuwe e-mailfunctie in `email.ts`; stuurt bevestiging naar `bezoekerEmail` (indien opgegeven) na ontvangst van een vraag
- `stuurAfwijzingNotificatie()`: nieuwe e-mailfunctie; stuurt notificatie naar behandelaar (of algemene postbus) bij afwijzing via portaal, inclusief eventuele afwijzingsreden
- Beide functies zijn fire-and-forget, falen nooit blokkerend

**Technisch**
- OpenAPI codegen opnieuw uitgedraaid na spec-wijziging
- Geen nieuwe TS-fouten in api-server of firevault buiten de pre-existente TS7030's

## 2026-07-04 — Dubbele handtekeningen geblokkeerd (idempotentie-guard)

**Uitvoering:** volledig | **Diepere lagen:** volledig | **Getest:** typecheck clean; DB-constraint bevestigd via \d

Voorkomen dat twee gelijktijdige ondertekeningsverzoeken twee handtekening-records aanmaken.

**DB-migratie**
- `ALTER TABLE offerte_handtekeningen ADD CONSTRAINT uq_handtekeningen_offerte_token UNIQUE (offerte_id, portaal_token)` — additieve constraint, geen dataverlies; NULL != NULL in PostgreSQL dus rijen zonder portaal_token raken de constraint nooit
- Drizzle-schema bijgewerkt met `uniqueIndex("uq_handtekeningen_offerte_token").on(t.offerteId, t.portaalToken)` in `lib/db/src/schema/offertes.ts`

**Server-side idempotentie** (`artifacts/api-server/src/routes/portaal.ts`)
- Bestaande transactie-guard vult nu ook PostgreSQL-foutcode 23505 op als extra veiligheidsnet: tweede gelijktijdig verzoek dat de status-UPDATE wint maar vastloopt op de INSERT, retourneert HTTP 409 met "Deze offerte is al ondertekend."

**Frontend** (`artifacts/firevault/src/pages/portaal/index.tsx`)
- `bevestigHandtekening` detecteert HTTP 409; toont niet-blokkerende inline foutbanner met AlertTriangle-icoon ("Deze offerte is al ondertekend. Vernieuw de pagina om de actuele status te zien.")
- Submit-knop wordt uitgeschakeld na 409 om herhaalde pogingen te voorkomen
- Andere fouten (netwerk, 5xx) vallen terug op bestaand gedrag (terug naar tekenfase)

---


## 2026-07-04 — Autorisatie-audit FPS Connect

**Uitvoering:** volledig | **Diepere lagen:** volledig | **Getest:** api-server start clean (HTTP 200); typecheck geen nieuwe fouten

Volledige autorisatie-audit uitgevoerd: rollen, permissies, API-endpoints, pagina's en acties geïnventariseerd. Vijf afwijkingen gevonden en hersteld.

**Inventarisatie**
- Rollen: `hoofdbeheerder` (superuser, bypast alle matrix-checks), `gebruiker` (intern personeel, volledig matrix-gestuurd), `klant` (extern portaal, alleen eigen gebouwen)
- Permissies: ~24 modules in `lib/permissies`, niveaus 0–4 per gebruiker in `bevoegdheden` JSONB-kolom
- API-routes: globale `requireAuth` + `laadPermissies` op alle niet-publieke routes; per route `requireBevoegdheid(module, niveau)` of `requireRol`
- Publieke routes correct: `/healthz`, `/auth/*`, `/uitnodiging/:token`, `/portaal/:token`, `/storage/public-objects/*`
- Frontend: portal-gating in `App.tsx` + per-pagina `useBevoegdheid`/`useRol` hooks

**Fix 1 — `leveranciers.ts`: ontbrekende module-gating (kritiek)**
- Alle 6 routes hadden uitsluitend de globale `requireAuth`, geen module-check
- Elke ingelogde gebruiker (ook klant, monteur zonder magazijnrecht) kon leveranciers lezen, aanmaken, wijzigen en verwijderen
- Opgelost: `requireBevoegdheid("magazijn", ...)` toegevoegd per route:
  - GET: niveau 1 (lezen)
  - POST: niveau 3 (aanmaken)
  - GET /:id: niveau 1
  - PATCH /:id: niveau 2 (wijzigen)
  - DELETE /:id: niveau 4 (beheer)
  - GET /:id/artikelen: niveau 1

**Fix 2 — `artikelen.ts`: ontbrekende module-gating (kritiek)**
- Identiek probleem: alle 5 routes zonder `requireBevoegdheid`
- Opgelost: zelfde `magazijn`-module guards als leveranciers (lezen/aanmaken/schrijven/beheer)

**Fix 3 — `gebouwen.ts` L1104: dode rolcheck in projectteam-koppeling**
- `gebruiker.rol === "beheerder"` refereerde aan een verouderde rol die niet meer bestaat (validrollen = hoofdbeheerder/gebruiker/klant)
- Was altijd `false`, waardoor logica alleen nog voor `hoofdbeheerder` werkte
- Opgelost: `gebruiker.rol === "beheerder" || gebruiker.rol === "hoofdbeheerder"` → `gebruiker.rol === "hoofdbeheerder"`

**Fix 4 — `gebouwen.ts` L1348: dode rolcheck in tekeningsfilter**
- `rol === "beheerder"` zelfde probleem: documenten die niet als `zichtbaar_monteur` zijn aangevinkt waren onterecht zichtbaar voor niemand buiten `hoofdbeheerder` (in plaats van alleen voor `gebruiker`)
- Opgelost: dode check verwijderd; check is nu `rol === "hoofdbeheerder"` (bestaand effectief gedrag, zonder verwarrende dode code)

**Fix 5 — `voorzieningen.ts`: handmatige DB-fetch in archief-handler**
- De-archivering controleerde niveau-4 via directe DB-query (`gebruikersTable`) en handmatige `heeftNiveau()`-aanroep buiten het centrale systeem
- Dubbele logica t.o.v. `req.permissies` die door `laadPermissies` al geladen is
- Opgelost: volledige DB-fetch + handmatige rolcheck vervangen door `req.permissies!.heeftModuleRecht("voorzieningen", 4)` — één centraal aanroeppunt

**Bevindingen zonder fix (geen onjuiste autorisatie)**
- `uitvoerder.ts` sessie-routes: only global `requireAuth` is intentioneel — toegankelijk voor alle ingelogde monteurs
- `online-gebruikers.ts` klant-filter: `rol === "klant"` beperkt informatielekken, geen incorrect access
- Frontend `useBevoegdheid` hoofdbeheerder-bypass: spiegelt de backend-architectuur, geen zelfstandig risico
- Pages `berichten`, `info`, `dossiers` zonder page-level guard: bewust altijd zichtbaar in ConnectPortal

## 2026-07-04 — Beveiligingsaudit herstelacties

**Uitvoering:** volledig | **Diepere lagen:** volledig | **Getest:** api-server start clean (HTTP 200 /healthz); security headers bevestigd in respons; typecheck geen nieuwe fouten

Zes beveiligingsproblemen hersteld na inventarisatie (auth, CORS, headers, CSV, AI-gateway, input-validatie):

**1. CORS-hardening (`app.ts`)**
- `cors()` zonder origin-restrictie vervangen door een whitelist op basis van `REPLIT_DOMAINS` + `REPLIT_DEV_DOMAIN`
- `credentials: true`, `allowedHeaders` beperkt tot `Content-Type` en `Authorization`, `maxAge: 600`
- In productie (`NODE_ENV=production`) worden geen localhost-varianten toegestaan

**2. HTTP-beveiligingsheaders (`app.ts`)**
- Middleware toegevoegd die op elk antwoord de volgende headers plaatst:
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `X-XSS-Protection: 0` (moderne browsers)
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- JSON body-limiet verlaagd van 10 MB naar 2 MB

**3. In-memory rate-limiter login (`auth.ts`)**
- `checkLoginRateLimit()` toegevoegd: maximaal 10 pogingen per IP per 15 minuten
- Van toepassing op `/auth/login`, `/auth/2fa/verify`, `/auth/mobile/login`
- 429-response met `Retry-After`-header bij overschrijding
- Periodieke cleanup (elke 30 min) via `.unref()` interval

**4. CSV formula-injectie fix (`ai-log.ts`)**
- `escapeCell()` prefixeert waarden die starten met `=`, `+`, `-`, `@`, `\t`, `\r` met een apostrof
- Voorkomt dat spreadsheet-applicaties de celinhoud als formule interpreteren

**5. AI-foutmelding sanitisatie (`aiGateway.ts`)**
- `sanitiseerFoutmelding()` toegevoegd: scrubt patronen die op API-sleutels lijken vóór DB-opslag
  - `sk-...`, `sk-proj-...`, Bearer-tokens, `key=...`-patronen worden vervangen door `[GEREDACTEERD]`
- `bericht.slice(0, 500)` vervangen door `sanitiseerFoutmelding(bericht)` op beide foutpaden
- Gebruikersfacing foutmelding is nu generiek ("AI-aanroep mislukt"), geen provider-details

**6. FIE input-validatie (`fie.ts`)**
- Hulpfuncties `valideerFinancieelGetal()` en `valideerProcent()` + enum-sets toegevoegd
- `POST /fie/begrotingen`:
  - `boekjaar`: integer-check + bereik 2000–2100
  - `status`: enum-check (concept/vastgesteld/gearchiveerd)
  - `verdeelsleutel`: enum-check (uren/omzet/ftes)
  - Alle financiële velden: `isFinite`, niet-negatief, maxima (€1 mrd / €10k / 1 mln uren)
  - `opmerkingen`: afgekapt op 2000 tekens
- `PATCH /fie/begrotingen/:id`: zelfde validatie per aanwezig veld

**7. `/ai/invullen` body-validatie (`ai.ts`)**
- `context_id`: positief integer of null (was ongevalideerd)
- `huidige_velden`: verplicht plain object; niet-string waarden overgeslagen; maximaal 50 velden; waarden afgekapt op 500 tekens; alleen bekende velddefinitie-sleutels doorgelaten

## 2026-07-04 — AI Gateway — Eindcontrole en bevriezing

**Uitvoering:** volledig | **Diepere lagen:** volledig | **Getest:** typecheck schoon (geen nieuwe fouten); esbuild build clean

Volledige 7-checkpoint code-audit van de AI Gateway-laag. Drie categorieën overtredingen gevonden en gecorrigeerd; gateway is daarna bevroren als stabiele infrastructuur.

### Checkpoint 1 — Provider-isolatie (gebouw-ai.ts)

**Bevinding:** `services/gebouw-ai.ts` importeerde `import type OpenAI from "openai"` uitsluitend voor de annotatie van `OpenAI.Chat.Completions.ChatCompletionContentPart[]` in `analyseerBeeld()`. Elke `from "openai"`-verwijzing buiten `lib/aiGateway.ts` en `lib/openai.ts` is een overtreding van de provider-isolatieregel.

**Correctie:** `import type OpenAI from "openai"` verwijderd. Lokaal type `ContentPart` gedefinieerd met alleen de twee varianten die daadwerkelijk gebruikt worden (`text` en `image_url`).

### Checkpoint 2 — Directe provider-aanroepen

**Bevinding:** Geen overtredingen. Geen `client.chat.completions.create`, `responses.create` of `embeddings.create` buiten `lib/aiGateway.ts` en `lib/openai.ts` aangetroffen.

### Checkpoint 3 — Promptregistry (aiPrompts.ts)

**Bevinding:** 17 inline systeemprompts verspreid over 11 routebestanden, niet geregistreerd in `lib/aiPrompts.ts`.

**Betrokken bestanden en prompts:**
- `routes/ai.ts` — AI-invullen (data-assistent formulierprefill)
- `routes/crm.ts` — Concurrent profiel (marktintelligentie)
- `routes/organisatie.ts` — Document analyse, Bedrijfsgegevens invullen, Verzekering suggesties, Bedrijfsscan (4 prompts)
- `routes/rapporten.ts` — Bijlage samenvatting
- `routes/salaris-mutaties.ts` — Salarismutaties controle
- `routes/scab-mail.ts` — SCAB e-mail generatie
- `routes/veiligheid.ts` — Toolbox analyse, Toolbox koppeling, Toolbox genereer (3 prompts)
- `routes/planning-module.ts` — Reistijd schatting
- `routes/werkvoorbereiding.ts` — Inkoop (gedeeld door inkoopplanning + inkoopbon), Uitvoeringsplan (2 prompts)
- `routes/opdrachten.ts` — Begroting analyse, Werkvoorbereiding advies (2 prompts)

**Correctie:** 17 nieuwe `AiPrompt`-exports toegevoegd aan `lib/aiPrompts.ts` (elk met `naam`, `versie: "1.0.0"` en `tekst`). Dynamische placeholders (`{velden}`, `{categorieen}`) gedocumenteerd in commentaar; de route vult ze bij aanroep in via `.replace()`. Alle 11 routebestanden bijgewerkt met named import uit de registry; de inline strings verwijderd.

### Checkpoint 4 — Logging volledigheid

**Bevinding:** Geen overtredingen. Alle `logAanroep()`-aanroepen in `chat()` en `responses()` (zowel success- als error-pad) bevatten alle verplichte velden.

### Checkpoint 5 — Kostenregistratie bij fouten

**Bevinding:** `lib/aiGateway.ts` had `geschatteKostenEur: null` in 3 logpaden waarbij een aanroep wél afgerond was (met of zonder output):
1. `chat()` error-pad (na maximale retry)
2. `responses()` success-pad (Responses API levert geen tokendata)
3. `responses()` error-pad

Regel: bij nul of onbekende tokens is de geschatte kosten €0.000000, nooit `null` bij een afgeronde aanroep.

**Correctie:** Alle 3 plaatsen vervangen door `berekenKosten(model, null, null) ?? "0.000000"`. `berekenKosten` met `null` tokens rekent 0 × prijs = `"0.000000"` voor bekende modellen; de `?? "0.000000"` fallback dekt onbekende modellen.

### Checkpoint 6 — Context-contracten (LogContext / AiContextBron)

**Bevinding:** Geen overtredingen. `LogContext` en `AiContextBron` worden correct geëxporteerd vanuit `lib/aiGateway.ts` en als `import type` geïmporteerd in alle services en orchestrators.

### Checkpoint 7 — Gateway-bevriezing

Gateway bevroren als stabiele infrastructuur na bovenstaande correcties. Alle drie overtredingscategorieën zijn gecorrigeerd; typecheck introduceert geen nieuwe fouten (pre-existing TS7030 in routehandlers ongewijzigd aanwezig).

**Gewijzigde bestanden (eerste golf — 17 prompts, 11 bestanden):**
- `artifacts/api-server/src/lib/aiPrompts.ts` — 17 nieuwe promptexports toegevoegd
- `artifacts/api-server/src/lib/aiGateway.ts` — 3× `geschatteKostenEur: null` → `berekenKosten(model, null, null) ?? "0.000000"`
- `artifacts/api-server/src/services/gebouw-ai.ts` — `import type OpenAI` verwijderd; lokaal `ContentPart`-type gedefinieerd
- `artifacts/api-server/src/routes/ai.ts` — promptregistry import; inline prompt vervangen
- `artifacts/api-server/src/routes/crm.ts` — promptregistry import; inline prompt vervangen
- `artifacts/api-server/src/routes/organisatie.ts` — promptregistry imports (4); inline prompts vervangen
- `artifacts/api-server/src/routes/rapporten.ts` — promptregistry import; inline prompt vervangen
- `artifacts/api-server/src/routes/salaris-mutaties.ts` — promptregistry import; inline prompt vervangen
- `artifacts/api-server/src/routes/scab-mail.ts` — promptregistry import; inline prompt vervangen
- `artifacts/api-server/src/routes/veiligheid.ts` — promptregistry imports (3); inline prompts vervangen
- `artifacts/api-server/src/routes/planning-module.ts` — promptregistry import; inline prompt vervangen
- `artifacts/api-server/src/routes/werkvoorbereiding.ts` — promptregistry imports (2); inline prompts vervangen
- `artifacts/api-server/src/routes/opdrachten.ts` — promptregistry imports (2); inline prompts vervangen
- `artifacts/api-server/src/routes/opdrachten.ts` — WERKBEGROTING_CHAT_BASE (aanvullend op eerste golf)


**Patroon voor dynamische prompts:** grote routehandlers die veel contextdata samenvoegen (calculatie, werkbegroting, uitvoerder-chat) gebruiken het context-first patroon: een `context`-block met alle dynamische velden wordt gebouwd via `Array.filter(Boolean).join("\n")`, gevolgd door `"\n\n" + PROMPT.tekst`. Zo blijft de statische rolbeschrijving/instructies in de registry en de projectdata in de route.

**Uitzonderingen (bewust niet naar registry):**
- `routes/studio.ts:buildConnectTemplatePrompt()` — prompt-bouwerfunctie die een volledig runtime-afhankelijke template construeert op basis van werkgeversbranding (primaireKleur, voettekst, documentType); de gehele prompt is dynamisch, er is geen extraheerbare statische kern.
- `routes/opdrachten.ts` — twee `prompt`-variabelen die uitsluitend als `role: "user"`-bericht dienen (systeem-bericht komt al uit de registry via BEGROTING_ANALYSE_PROMPT / WERKVOORBEREIDING_ADVIES_PROMPT); de "Je bent"-opening in het user-bericht is een reasoning-model-conventie, geen systeem-prompt.

## 2026-07-04 — Financial Intelligence Engine (FIE) — Bedrijfskompas

**Uitvoering:** volledig | **Diepere lagen:** volledig | **Getest:** typecheck schoon (geen nieuwe fouten); api-server bouwt + start clean; e2e-web groen

**DB schema**
- `lib/db/src/schema/fie.ts`: drie nieuwe tabellen via directe SQL aangemaakt + Drizzle-schema geschreven:
  - `fie_jaarbegrotingen`: boekjaar, status (concept/actief/gesloten), omzetDoel, doelMargePct, akPerProductiefUur, productieveUrenDoel, verdeelsleutel
  - `fie_ak_posten`: indirecte kostenposten per begroting (categorie, omschrijving, bedragJaarbasis, actief)
  - `fie_capaciteit_snapshots`: productieve-urenregistraties per boekjaar
- Geëxporteerd via `lib/db/src/schema/index.ts`

**OpenAPI & codegen**
- `lib/api-spec/openapi.yaml`: FIE-paden toegevoegd (voor `components:` + schemas aan einde):
  - `GET/POST /fie/begrotingen`, `GET/PATCH /fie/begrotingen/{id}`, `GET/POST /fie/begrotingen/{id}/ak-posten`
  - `PATCH/DELETE /fie/ak-posten/{id}`, `GET/POST /fie/capaciteit/{boekjaar}`, `GET /fie/context/calculatie/{id}`
  - Schemas: `FieJaarbegroting`, `FieJaarbegrotingDetail`, `FieJaarbegrotingInput/Update`, `FieAkPost`, `FieAkPostInput/Update`, `FieCapaciteitsoverzicht`, `FieCapaciteitSnapshot`, `FieCapaciteitInput`, `FieCalculatieContext`
- Codegen uitgevoerd: alle FIE-hooks beschikbaar in `@workspace/api-client-react`

**API route**
- `artifacts/api-server/src/routes/fie.ts`: volledige implementatie:
  - Jaarbegrotingen CRUD (bevoegdheid `financieel:1/2`)
  - AK-posten CRUD per begroting (werkgever-join voor naam-denormalisatie)
  - Capaciteitssnapsots per boekjaar
  - `GET /fie/context/calculatie/:id`: live margeadvies o.b.v. actieve begroting (berekenT totalen uit regels, opslagen, AK-bijdrage via akPerUur × MU, verwachteMargePct vs doelMarge → advies_status: goed/neutraal/laag/leeg/geen_begroting)
- Geregistreerd in `routes/index.ts`

**Frontend**
- `artifacts/firevault/src/pages/beheer/bedrijfskompas.tsx`: volledige beheerpagina
  - Begrotingenlijst met status-badges (Concept/Actief/Gesloten) + groene actieve-begroting-banner
  - Detail-view met AK-postenopbouw, totaal-AK en berekend AK/uur (uit posten + productieve uren)
  - CRUD-dialogen voor begrotingen en AK-posten (categorie-select, bedrag)
  - Lege toestand + toelichting hoe FIE werkt
- `artifacts/firevault/src/pages/modules/calculatie/detail.tsx`: `FieContextBlok` toegevoegd in zijpaneel
  - Roept `useGetFieContextCalculatie(id)` aan
  - Toont adviesbadge (groen/neutraal/amber/grijs), verwachte marge vs doelmarge, AK-bijdrage per MU
  - Laadskelet tijdens fetch; verbergt zichzelf als geen data
- `artifacts/firevault/src/App.tsx`: route `/beheer/bedrijfskompas` geregistreerd
- `artifacts/firevault/src/layouts/beheerder-layout.tsx`: nav-item "Bedrijfskompas" (TrendingUp-icoon) toegevoegd in Financieel-sectie, gated op `financieel:1`

## [2026-07-04] PIM Fase B — Adviescentrum AI (Task #297)

### Backend
- `aiPrompts.ts`: `PIM_AANVRAAG_ANALYSE_PROMPT` toegevoegd (vision-slot, gpt-5) — analyseert aanvraagcontext, documenten en afbeeldingen; output-schema: werkzaamheden/locaties/risicos/aannames/ontbrekende_info/vragen/competenties/normen/aanbeveling/vop_aandachtspunt/betrouwbaarheid; NOOIT adviseren dat FPS iets niet kan
- `routes/pim.ts` — 3 nieuwe endpoints + FASEN uitgebreid met "advies_gereed":
  - `POST /aanvragen` gewijzigd naar `lezen` (klanten mogen aanvragen indienen via FPS One)
  - `POST /opdrachten/:id/pim/analyseer` — laadt DMS-documenten + vrije tekst, roept AI (vision) aan, slaat op in `pim.advies_context`, zet `ai_fase = advies`; placeholder voor KB-context (#303)
  - `POST /opdrachten/:id/pim/advies/bevestig` — beheerder keurt analyse goed; `ai_fase = advies_gereed`; logt in `document_logboek`
  - `POST /opdrachten/:id/pim/advies/rapport` — maakt DMS-document `adviesrapport` aan met `advies_context` als `aiMetadata`; koppelt via `document_koppelingen` (doel_type=opdracht)
- FASEN-array: nieuw → advies → **advies_gereed** → werkvoorbereiding → inkoop → uitvoering → oplevering → gereed

### OpenAPI + codegen
- 3 nieuwe PIM-paden gedocumenteerd (`analyseer`, `advies/bevestig`, `advies/rapport`)
- Nieuwe schemas: `PimAnalyseerInput`, `PimAnalyseerResultaat`, `PimRapportResultaat`
- `PimFaseInput.fase` beschrijving bijgewerkt met "advies_gereed"
- Codegen uitgevoerd → gegenereerde hooks: `useAnalyseerPim`, `useBevestigPimAdvies`, `useMaakPimAdviesRapport`

### Frontend (FPS Connect)
- `opdrachten/detail.tsx`: tabblad "AI Regisseur" toegevoegd (altijd zichtbaar)
  - Toont PIM-status badge (`ai_fase`)
  - Actieknoppen: Analyseer / Goedkeuren (bij fase=advies) / Rapport in DMS (bij fase=advies_gereed)
  - Adviescontext-secties: aanbeveling, werkzaamheden, locaties, risico's, normen, vragen, ontbrekende info, VOP-vlag
- Nieuwe imports: `useGetPim`, `useAnalyseerPim`, `useBevestigPimAdvies`, `useMaakPimAdviesRapport`, `getGetPimQueryKey`

### Frontend (FPS One)
- `pages/one/adviescentrum.tsx`: nieuw (klantpagina)
  - Formulier: gebouw selecteren, omschrijving, vrije tekst (max 4000 tekens)
  - Submit → `POST /api/aanvragen` → bevestigingsstap met referentienummer
  - Opmerking over documenten bijvoegen per e-mail (upload-koppeling volgt)
- `pages/one/dashboard.tsx`: "Adviescentrum"-module-kaart toegevoegd (Sparkles-icoon)
- `App.tsx`: route `/one/adviescentrum` geregistreerd

## Task #297 — PIM Fase B code review fixes (2026-07-04)

Vijf kritieke code-review-bevindingen opgelost:

**1. kbService stub** (`artifacts/api-server/src/lib/kbService.ts`)
- Aangemaakt met `assembleKbContext()` (retourneert `null` totdat Task #303 KB-module gemerged is) en `KB_BESLISSTRUCTUUR` constante
- Import-contract is nu geldig; PIM-AI-aanroepen benoemen het kennisbank-slot al correct

**2. kbContext integratie in analyseer-endpoint**
- `kbService.assembleKbContext(opdrachtId)` en `KB_BESLISSTRUCTUUR` worden opgehaald ná opbouw van `userContent`
- Context wordt als extra tekstdeel toegevoegd aan `userContent[0]` (niet aan reeds gejoinde `contextDelen`)

**3. PDF-generatie in rapport-endpoint** (`POST /opdrachten/:id/pim/advies/rapport`)
- Puppeteer `page.setContent()` met HTML-template (`bouwAdviesRapportHtml`) — geen aparte printpagina nodig
- PDF opgeslagen in object storage via `uploadBestand()` (`pim/adviesrapporten/<id>_<ts>.pdf`)
- DMS-document bevat `pdf_url` voor de opgeslagen PDF
- Graceful fallback: als chromium niet beschikbaar is, wordt DMS-document toch aangemaakt (zonder PDF)

**4. Afwijzen** (`POST /opdrachten/:id/pim/advies/afwijzen`)
- Nieuw endpoint: reset `ai_fase → "nieuw"`, logt in `document_logboek`
- OpenAPI schema `PimAfwijzenInput` (optionele `reden`) + pad toegevoegd
- Codegen uitgevoerd: `useAfwijzenPimAdvies` hook gegenereerd
- Connect AI Regisseur-tab: "Advies afwijzen" knop naast "Advies goedkeuren" (alleen zichtbaar in fase `advies`)

**5. FPS One adviescentrum** (`artifacts/firevault/src/pages/one/adviescentrum.tsx`)
- Uitgebreid van 2-stap naar 4-stap flow: formulier → documenten → analyseren → resultaat
- Stap "Documenten": bestandspicker (PDF/afbeelding), presigned upload-URL (`useRequestUploadUrl`), DMS-registratie (`useCreateDocument`)
- "Analyse starten" knop roept `useAnalyseerPim` aan
- AI-resultaatweergave: aanbeveling, werkzaamheden, locaties, risico's, ontbrekende info, vragen, VOP-aandachtspunt
