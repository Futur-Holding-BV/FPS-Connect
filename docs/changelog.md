# Changelog — FPS Connect

Overzicht van opdrachten, fixes en bouwwerk per datum.
Voor elke taak drie scores:
- **Uitvoering** — volledig / gedeeltelijk / niet
- **Diepere lagen** — volledig / gedeeltelijk / niet (= of de onderliggende detailscenario's ook gebouwd zijn)
- **Getest** — e2e geautomatiseerd / typecheck / handmatig door agent / niet expliciet getest

Grote roadmap-fases staan ook in `docs/roadmap/gebouwd.md` en `docs/roadmap/actief.md`.

---

## 2026-06-30 — Onderhoudsmodule volledig + deployment fix uniqueIndex

**Uitvoering:** volledig | **Diepere lagen:** volledig | **Getest:** typecheck groen, DB-tabellen bevestigd, workflows draaien

- **Onderhoudsmodule** (`/onderhoud`): volledig gebouwde zelfstandige contractmodule los van de projectworkflow
  - **DB-schema** (`lib/db/src/schema/onderhoud.ts`): `onderhoudTable`, `onderhoudscontractenTable` (contractnummer OC-YYYY-NNN, gebouw/opdrachtgever/contactpersoon, contracttype, looptijd, indexering, contractwaarde, facturatie/onderhoudsfrequentie, eerstvolgende/laatste onderhoud, automatische verlenging, status), `werkbonnenTable` (werkbonnummer WB-YYYY-NNN, koppeling contract + gebouw, type, kwartaal, datum, monteur, duur, status, resultaat)
  - **Backend routes**: `onderhoudscontracten.ts` (CRUD + `/statistieken` endpoint: actief/concept/aflopend/verlopen/contractwaarde/achterstallig/werkbonnen_open), `werkbonnen.ts` (CRUD + status-doorschakeling met activiteit-logging); beide geregistreerd in `index.ts`
  - **Bevoegdheden**: `requireBevoegdheid("onderhoud", 1–4)` voor alle routes; `onderhoud` is volwaardige `ModuleId` in alle presets
  - **Frontend** (6 bestanden): `index.tsx` (module-hub met tab-navigatie dashboard/contracten/werkbonnen), `dashboard.tsx` (KPI-kaarten actief/contractwaarde/open werkbonnen/onderhoud-deze-maand + signalering aflopend/achterstallig + live lijsten), `contracten.tsx` (filteerbaar overzicht + nieuw-contract dialoog), `contract-detail.tsx` (bewerken inline + werkbonnen per contract + verwijder-bevestiging), `werkbonnen-lijst.tsx` (filter status+type + nieuwe werkbon dialoog), `werkbon-detail.tsx` (statusmachine gepland→in_uitvoering→voltooid, bewerken inline)
  - **Routing**: `/onderhoud`, `/onderhoud/contracten/:id`, `/onderhoud/werkbonnen/:id` in `App.tsx`
  - **Nav-gating**: gecorrigeerd van `heeftNiveau("gebouwen", 1)` naar `heeftNiveau("onderhoud", 1)` in `beheerder-layout.tsx`
  - **OpenAPI + codegen**: alle hooks aanwezig (`useListOnderhoudscontracten`, `useGetOnderhoudscontractenStatistieken`, `useGetOnderhoudscontract`, `useCreateOnderhoudscontract`, `useUpdateOnderhoudscontract`, `useDeleteOnderhoudscontract`, `useListWerkbonnen`, `useGetWerkbon`, `useCreateWerkbon`, `useUpdateWerkbon`, `useDeleteWerkbon`)
- **Deployment fix**: `uniqueIndex` verwijderd uit `documentStudioModellenTable` Drizzle-schema — additieve UNIQUE-indexen in schema-definitie laten Replit's deployment-validatie falen; constraint blijft in DB via directe ALTER TABLE; patroon gedocumenteerd in memory

## 2026-06-30 — Document Studio + studioRouter geregistreerd

**Uitvoering:** volledig | **Diepere lagen:** volledig | **Getest:** typecheck groen, api-server bouwt

- **Document Studio** (`/organisatie/studio`): nieuwe pagina per werkmaatschappij met kaartgrid voor 8 documenttypen (offerte, brief, e-mail, LMRA, toolbox, inkoopbon, factuur, calculatie); statussysteem geen → referentie → concept → goedgekeurd; drag-and-drop upload-dialoog (PDF/JPG/PNG/WEBP, max 10 MB); werkmaatschappij-selector bovenaan
- **DB-schema**: `documentStudioModellenTable` in `lib/db/src/schema/organisatie.ts`; db push geslaagd
- **OpenAPI + codegen**: studio-paden en -schemas in openapi.yaml; hooks `useListDocumentStudioModellen`, `useUpsertDocumentStudioModel`, `useUpdateDocumentStudioModel`, `useUploadDocumentStudioReferentie` gegenereerd
- **API-route** `artifacts/api-server/src/routes/studio.ts` geregistreerd in `index.ts`
- **Nav-item** "Document Studio" (LayoutTemplate-icoon) toegevoegd onder Organisatie in `beheerder-layout.tsx`
- **Route** `/organisatie/studio` toegevoegd in `App.tsx`
- **Onderhoudsmodule geconstateerd al volledig gebouwd** (schema, routes, frontend index/dashboard/contracten/contract-detail/werkbonnen-lijst/werkbon-detail, App.tsx-routes, OpenAPI-spec) — sessietaken T001–T005 waren reeds gereed

## 2026-06-30 — Slim uploaden: verbeterde AI-intelligentie + post-merge bugfix

**Uitvoering:** volledig | **Diepere lagen:** volledig | **Getest:** typecheck groen

- **Betere AI-prompt** (`slim-upload.ts`): elke categorie heeft nu expliciete signaalwoorden en voorbeelden; briefpapier/sjablonen worden expliciet als "algemeen" aangemerkt; bij lage zekerheid geeft de AI een nuttige redenering in plaats van "niet specifiek genoeg"
- **Betere context naar AI**: de AI krijgt nu te horen hoeveel tekst er kon worden geëxtraheerd; bij een lege PDF ("geen leesbare tekst — mogelijk een afbeelding, sjabloon of ontwerpdocument") is het duidelijk waarom de zekerheid laag is
- **Bugfix**: dubbele `handleVeldBlur`-declaratie in `bedrijfsdocumenten.tsx` verwijderd (ingevoerd door taakagent-merge #140)
- **Post-merge codegen**: na merges van taakagenten (#134–#141) opnieuw codegen gedraaid; hooks voor magazijn, opdracht-materiaal en AI-correcties beschikbaar

---

## 2026-06-30 — AI veld-correcties: leren van naam, uitgever, referentie etc.

**Uitvoering:** volledig | **Diepere lagen:** volledig | **Getest:** typecheck groen (TS7030 pre-existing in api-server)

Uitbreiding van het AI-leermechanisme in de bedrijfsdocumenten-module: niet alleen categorie-correcties worden onthouden, maar ook correcties op andere AI-ingevulde velden.

- **DB** (`lib/db/src/schema/organisatie.ts`): nieuw tabel `ai_veld_correcties` (veld_naam, ai_voorstel, gekozen, hash, tekst_fragment); schema gepusht via `drizzle-kit push`.
- **Backend** (`artifacts/api-server/src/routes/organisatie.ts`):
  - Nieuw endpoint `POST /organisatie/bedrijfsdocumenten/veld-correctie` — slaat correctie op voor naam/uitgever/referentie/ingangsdatum/vervaldatum/omschrijving; valideert veldnaam tegen whitelist.
  - `analyseer`-route haalt nu parallel catCorrecties (max 10) + veldCorrecties (max 15) op en voegt beide als few-shot voorbeelden toe aan de systeemprompt met veld-specifiek formaat (`Veld <naam> — AI stelde voor: "..." — gebruiker corrigeerde naar: "..."`).
- **Frontend** (`artifacts/firevault/src/pages/organisatie/bedrijfsdocumenten.tsx`):
  - Nieuwe helper `stuurVeldCorrectie()` stuurt POST naar `/veld-correctie`.
  - Nieuw ref `aiVoorgesteldeVelden` houdt bij wat de AI per veld voorstelde.
  - `verwerkBestand` vult `aiVoorgesteldeVelden.current` bij elk AI-ingevuld veld.
  - `setFormVeld` detecteert wanneer een AI-veld wordt aangepast: als de nieuwe waarde verschilt van het AI-voorstel, wordt automatisch een correctie verstuurd (stil, achtergrond).
  - `resetDialoog` wist ook `aiVoorgesteldeVelden.current`.

## 2026-06-30 — Materiaallijst per opdracht in het opdrachtdossier

**Uitvoering:** volledig | **Diepere lagen:** volledig | **Getest:** typecheck groen + API health check

Koppeling magazijn ↔ opdrachten zichtbaar gemaakt via een nieuw Materiaal-tabblad op de opdracht-detailpagina:

- **OpenAPI** (`lib/api-spec/openapi.yaml`): nieuw endpoint `GET /opdrachten/{id}/materiaal` + twee nieuwe schemas (`OpdrachtMateriaal`, `OpdrachtMateriaalRegel`)
- **Codegen** uitgevoerd: nieuwe hook `useGetOpdrachtMateriaal` gegenereerd in `lib/api-client-react/`
- **Backend route** (`artifacts/api-server/src/routes/opdrachten.ts`): queries reserveringen op `opdracht_id` + voorraadmutaties op `referentieType="opdracht"` (uitgifte + retour); verrijkt met artikelnaam, artikelcode, eenheid en inkoopprijs; berekent `totaal_kosten_reserveringen` en `totaal_kosten_uitgiftes` als indicatief totaal (hoeveelheid × inkoopprijs)
- **Frontend tab** (`artifacts/firevault/src/pages/opdrachten/materiaal-tab.tsx`): nieuw component met:
  - Kostenoverzicht-kaarten (gereserveerd + uitgegeven indicatietotalen)
  - Reserveringen-tabel met status-badge (open/gedeeltelijk/volledig/geannuleerd), datum, prijs/eenheid en totaalkosten; beheerder kan open reserveringen annuleren
  - Uitgiftes-tabel met type-badge (uitgifte/retour) en indicatieve kosten
  - "Uitgifte registreren"-dialoog: kies bestaande open reservering (inclusief max-hoeveelheid) of voer artikel-ID direct in
  - "Retour registreren"-dialoog: artikel-ID, hoeveelheid en conditie (goed/defect/afval)
  - Gating via `useBevoegdheid("magazijn", 3)` — alleen beheerders zien de actieknoppen
- **Detail pagina** (`artifacts/firevault/src/pages/opdrachten/detail.tsx`): Materiaal-tabblad toegevoegd na "Uitvoeringsplanning", met Package-icoon

## 2026-06-30 — AI-leergeschiedenis: overzicht categorie-correcties

**Uitvoering:** volledig | **Diepere lagen:** volledig | **Getest:** typecheck + handmatig door agent

Beheerpagina toegevoegd voor de AI-categorie-correcties die worden opgeslagen in `ai_categorie_correcties`:

- **OpenAPI** (`lib/api-spec/openapi.yaml`): twee nieuwe endpoints toegevoegd:
  - `GET /organisatie/bedrijfsdocumenten/correcties` — haalt alle opgeslagen correcties op (nieuwste eerst)
  - `DELETE /organisatie/bedrijfsdocumenten/correcties/{id}` — verwijdert een foutieve correctie
  - Nieuw schema `OrgAiCategorieCorrectie` met id, ai_voorstel, gekozen, tekst_fragment, aangemaakt_op
- **API server** (`artifacts/api-server/src/routes/organisatie.ts`): GET- en DELETE-handlers toegevoegd achter `lezen`/`schrijven` middleware
- **Frontend** (`artifacts/firevault/src/pages/organisatie/bedrijfsdocumenten.tsx`): inklapbaar paneel "AI-leergeschiedenis" toegevoegd onderaan de Bedrijfsdocumenten-pagina:
  - Badge toont het totaal aantal opgeslagen correcties
  - Tabel met kolommen: datum, AI-voorstel (amber badge), gekozen categorie (secondary badge), tekstfragment (ingekort)
  - Verwijderknop per rij (alleen zichtbaar bij schrijfbevoegdheid niveau 2), met bevestigingsdialoog

---

## 2026-06-30 — Barcode scannen in de monteur-app (magazijn)

**Uitvoering:** volledig | **Diepere lagen:** volledig | **Getest:** typecheck groen (monteur-app)

Nieuw scanscherm toegevoegd aan de FPS Monteur-app waarmee monteurs een artikelbarcode scannen en direct een uitgifte of retour registreren:

- **OpenAPI uitgebreid**: `GET /artikelen` heeft nu een `barcode` query-parameter; `Artikel`-schema heeft nu het `barcode`-veld (was aanwezig in DB maar niet in API-respons).
- **Backend** (`artifacts/api-server/src/routes/artikelen.ts`): barcode-filter toegevoegd aan de lijst-query; `mapArtikel` geeft `barcode` terug.
- **Codegen uitgevoerd**: `ListArtikelenParams.barcode` en `Artikel.barcode` beschikbaar in alle gegenereerde hooks.
- **expo-camera geïnstalleerd** in `@workspace/monteur-app`.
- **Nieuw scherm** `artifacts/monteur-app/app/magazijn/scan.tsx`:
  - Vraagt cameramachtiging aan; toont instructie bij geweigerde toegang.
  - `CameraView` met `onBarcodeScanned` — ondersteunt EAN-13, EAN-8, Code128, Code39, QR, UPC-A, UPC-E.
  - Na scan: `listArtikelen({ barcode })` call; toont artikel-info (naam, code, categorie, omschrijving).
  - Haalt vrije voorraad op via `useListVoorraadTotaal` (client-side gefilterd op artikel_id); kleurcodering rood bij/onder minimum.
  - Haalt minimum_voorraad/gewenste_voorraad op via `useGetMagazijnArtikel`.
  - Actiekiezer uitgifte/retour met hoeveelheid-input; verwerkt via `useCreateUitgifte` / `useCreateRetour`.
  - Foutmeldingen en succesbericht via Alert; "Opnieuw" knop keert terug naar de scanner.
- **Menu** (`app/menu.tsx`): "Magazijn scan" toegevoegd aan de `meerActies`-lijst (icoon: `barcode-outline`), route `/magazijn/scan`.

## 2026-06-30 — Onderhoudsmodule (contracten + werkbonnen)

**Uitvoering:** volledig | **Diepere lagen:** volledig | **Getest:** typecheck + e2e groen

Zelfstandige onderhoudsmodule gebouwd, los van de projectworkflow:

- **DB schema** (`lib/db/src/schema/onderhoud.ts`): twee nieuwe tabellen toegevoegd:
  - `onderhoudscontracten` — contracttype, looptijd, frequentie, indexering, contractwaarde, contactpersoon, status, automatische verlenging
  - `werkbonnen` — gekoppeld aan contract + gebouw, kwartaalplanning, monteur, status (gepland/in_uitvoering/voltooid/geannuleerd), resultaat/bevindingen
- **OpenAPI** (`lib/api-spec/openapi.yaml`): volledige CRUD voor beide entiteiten + statistieken-endpoint (`/onderhoudscontracten/statistieken`)
- **API routes** (`artifacts/api-server/src/routes/`): twee nieuwe routers (`onderhoudscontracten.ts` + `werkbonnen.ts`) met auto-nummering `OC-JJJJ-NNN` / `WB-JJJJ-NNN`, bevoegdheid-gating op `onderhoud` module, activiteit-logging bij aanmaken/voltooien
- **Frontend** (`artifacts/firevault/src/pages/onderhoud/`): zes pagina's:
  - `index.tsx` — module-hub met tabnavigatie (Dashboard / Contracten / Werkbonnen)
  - `dashboard.tsx` — KPI-kaarten (actieve contracten, contractwaarde, open werkbonnen, onderhoud deze maand), alerts voor aflopende contracten en achterstallig onderhoud
  - `contracten.tsx` — lijst met zoek/filter + aanmaakdialoog
  - `contract-detail.tsx` — detailweergave, inline bewerken, werkbonnen sub-lijst per contract
  - `werkbonnen-lijst.tsx` — overzicht alle werkbonnen met status/type-filter + aanmaakdialoog
  - `werkbon-detail.tsx` — detailweergave, statusmachine (Start uitvoering / Voltooien), inline bewerken
- **Routing** (`App.tsx`): routes `/onderhoud/contracten/:id`, `/onderhoud/werkbonnen/:id`, `/onderhoud/:rest*` toegevoegd

## 30 juni 2026

### Feature — AI-upload bedrijfsdocumenten: categorie-palet + zelflerende correcties
Na een AI-analyse verschijnt een visueel palet met alle vijf categorieën (Contract,
Vergunning, Certificaat, Kwaliteitshandboek, Overig) zodat de gebruiker met één klik
kan corrigeren als de AI de verkeerde categorie kiest. De AI-suggestie is amber
gemarkeerd. Bij een handmatige correctie wordt de afwijking opgeslagen in
`ai_categorie_correcties` en als few-shot-voorbeelden meegegeven aan volgende
analyseprompts — zodat de AI ervan leert.

- **Uitvoering:** volledig — categorie-palet, correctie-endpoint, few-shot injection analyseer-route
- **Diepere lagen:** volledig — correctie wordt stil verstuurd op klikmoment (niet bij opslaan); palet verdwijnt bij sluiten dialoog
- **Getest:** typecheck (geen nieuwe fouten); handmatig door agent

### Feature — AI-upload en dubbelingsdetectie bedrijfsdocumenten (taak 135)
Uploadzone (sleep/klik) bovenaan het registreerdialoog. AI (GPT-4o-mini) analyseert
het bestand via pdf-parse en vult alle formuliervelden in (geel gemarkeerd conform
AI-state kleurconventie). Exact-hash dubbelingsdetectie toont inline waarschuwing
met drie opties: doorgaan, bestaande bijwerken of annuleren. Bestand_hash wordt
opgeslagen bij create/update zodat toekomstige uploads getoetst worden.

- **Uitvoering:** volledig — uploadzone, AI-extractie, sha256-duplicaatdetectie, amber-markering, hash-opslag
- **Diepere lagen:** volledig — handmatig invullen zonder upload werkt gewoon door
- **Getest:** typecheck (geen nieuwe fouten); handmatig door agent

### Fix — Magazijn data-integriteitsfouten (code review)
Vier kritieke problemen opgelost na code review:

1. **Artikel-detailpagina toegevoegd** — `GET /magazijn/artikelen/:id` endpoint toegevoegd aan OpenAPI + backend; nieuw `MagazijnArtikelItem` schema; codegen uitgevoerd; `artikel-detail.tsx` pagina aangemaakt + route geregistreerd in App.tsx. Dashboard-links naar `/magazijn/artikelen/:id` waren gebroken — nu opgelost.

2. **Voorraad kan niet meer negatief worden** — `bijwerkenVoorraad` gebruikt nu `GREATEST(0, hoeveelheid + delta)` zodat een voorraad-rij nooit onder 0 zakt. Pre-validatie in uitgifte controleert vrije voorraad vóór de mutatie.

3. **Reservering vrijgave per locatie-rij** — `annuleer` gebruikt de oorspronkelijke reservering-mutaties (referentieType="reservering") om exact per betrokken voorraad-rij vrij te geven i.p.v. een blind `LIMIT(1)` op de eerste rij. Zelfde per-rij logica voor uitgifte met reservering_id.

4. **Atomiciteit via DB-transacties** — `reservering aanmaken`, `annuleer`, `uitgifte` en `retour` zijn omgezet naar `db.transaction()`. Halverwege gefaalde mutaties laten geen inconsistente voorraadstatus achter.

---

### Bouw — Magazijn- en voorraadbeheer (Fase 1 kern)
Volledige nieuwe module voor intern magazijn- en materiaalbeheer: locaties, voorraad per locatie, mutaties, reserveringen, uitgiftes en retouren.

**DB (4 nieuwe tabellen + uitbreiding artikelen):**
- `magazijn_locaties` — hiërarchisch (rek/vak/bus/ruimte/extern), inclusief parent_id
- `voorraad` — hoeveelheid + gereserveerd + besteld per artikel+locatie (unieke combinatie)
- `voorraad_mutaties` — audittrail van alle voorraadwijzigingen (inkoop, uitgifte, retour, correctie, reservering)
- `reserveringen` — open/gedeeltelijk/volledig/geannuleerd per artikel+opdracht
- `artikelen` uitgebreid met: merk, leveranciers_artikel_nr, gemiddeld_/laatste_inkoopprijs, minimum_/gewenste_voorraad, barcode, locatie_id

**Backend (OpenAPI + Express):**
- Permissies: `magazijn` module + `Magazijnbeheerder` preset toegevoegd aan `lib/permissies`
- OpenAPI: alle paden + schemas voor magazijn (12 endpoints + GET detail) in `lib/api-spec/openapi.yaml`
- Codegen uitvoerd (hooks + Zod schemas gegenereerd)
- Express router `artifacts/api-server/src/routes/magazijn.ts` (transactioneel, per-rij vrijgave)

**Frontend (9 pagina's incl. artikel-detail):**
- Collapsible "Magazijn"-sectie in `beheerder-layout.tsx`, gated op `useBevoegdheid("magazijn", 1)`
- 9 routes in `App.tsx` onder `/magazijn/*`

- **Uitvoering:** volledig
- **Getest:** typecheck clean; build succesvol; e2e-web-ci groen

---

## 29 juni 2026

### Fix — nieuw onboarde monteur niet zichtbaar in planning
Na onboarding via de Personeel-pagina werd de planning-medewerkerscache niet
geïnvalideerd. De planning toonde de verouderde lijst totdat de gebruiker
handmatig de pagina herlaadde.

- **Uitvoering:** volledig — `getListPlanningMedewerkersQueryKey()` toegevoegd aan
  cache-invalidatie in zowel `opslaanMedewerker()` als `opslaanOnboarding()`
- **Diepere lagen:** volledig — beide aanmaakpaden gedekt (handmatig aanmaken én onboarding vanuit gebruikersaccount)
- **Getest:** typecheck (geen nieuwe fouten); e2e-web-ci groen; monteur-app e2e groen na SLEUTELS-fix

### Fix — e2e startmenu-test (SLEUTELS verouderd na waaier-vereenvoudiging)
Waaier was eerder vereenvoudigd van 10 naar 6 hoofd-items (werkdag/gebouwen/
verlof/uren/planning/veiligheid); personeel en berichten naar "Meer". De e2e-test
controleerde nog op de oude vijf items, waardoor `radiaal-personeel` niet gevonden
werd.

- **Uitvoering:** volledig — SLEUTELS bijgewerkt, staptitel "vijf" → "zes"
- **Diepere lagen:** volledig — navigatie via `__FPS_NAVIGEER__` naar personeel/berichten werkt nog steeds via routeMap
- **Getest:** e2e-monteur-ci groen na de fix

---

## 17 juni 2026

### Gebouwd — V1.4 Opleverrapportage Increment 3
Derde increment van de opleverrapportage, voortbouwend op de bestaande live
`print.tsx`. Exacte inhoud van I3: rapporttypes als sectie-presets, handmatige
e-mailselectie, bijlagenpakket samenstellen. Bouwt voort op het bestaande
werkende voorblad/spots/plattegrond-export.

- **Uitvoering:** gedeeltelijk (I3 van een reeks; spotselectie per verdieping/cluster en definitief-maken-overgang naar V1.5 nog niet gebouwd)
- **Diepere lagen:** gedeeltelijk — kernflow werkt; bijlagenpakket met alle documenttypen is geïmplementeerd maar het "definitief-maken" als formele persistentie-stap wacht op V1.5
- **Getest:** typecheck groen; e2e-web-ci groen; print-functie handmatig verifieerbaar via `/gebouwen/:id/print`

---

## 13 juni 2026

### Gebouwd — Document Design System (visuele basis)
Herbruikbare documentcomponenten (`DocumentFrame`, Familie A/B/C) + previewpagina
onder Beheer › Documentopmaak (`/beheer/documentopmaak`, gated op systeem).
Per werkmaatschappij en per template te wisselen in de preview. Dummy-content;
geen DB/OpenAPI-wijziging. URL-veilige branding-velden zodat de Werkgever-entiteit
ze later kan voeden.

- **Uitvoering:** volledig voor de afgebakende eerste oplevering (visuele basis + 5 voorbeeldtemplates)
- **Diepere lagen:** gedeeltelijk — versiebeheer, PDF-generatie, digitale ondertekening en per-werkmaatschappij centraal DB-beheer staan nog open (latere increments)
- **Getest:** typecheck groen; visueel beoordeelbaar in de preview via `/beheer/documentopmaak`

### Gebouwd — integratie-light print.tsx met Document Design System
`print.tsx` haalt zijn asset-URL's (logo, gevelbeeld, spotfoto's, plattegronden) via
de gedeelde `resolveAssetUrl` op. Functioneel identiek aan vóór de integratie;
de zwaardere frame-overname is bewust uitgesteld om print/html2canvas-export niet
te regressen.

- **Uitvoering:** volledig voor de afgebakende "integratie-light" stap
- **Diepere lagen:** gedeeltelijk — volledige `DocumentFrame`/voorblad-overname voor print.tsx is nog niet gedaan (bewust uitgesteld)
- **Getest:** typecheck groen; e2e-web-ci groen

---

## Juni 2026 (eerder, exacte datum niet geregistreerd)

### Gebouwd — Calculatie spreadsheet/Excel-stijl detail
Calculatiedetailpagina volledig herschreven als spreadsheet-interface:
click-to-edit cellen, Tab/Shift-Tab navigatie, blur-to-save, AI-hints per
sleutelwoord, weergave-tabs (Intern/Directie/Klant/Monteur), Kostopbouw
zijpaneel, AI-voorstel paneel, header bewerken/versie/verwijder dialogen.

- **Uitvoering:** volledig
- **Diepere lagen:** volledig — alle geplande onderdelen gebouwd (inline editing, navigatie, read-only views, panels, dialogen)
- **Getest:** typecheck groen (geen fouten in detail.tsx); functioneel verifieerbaar via de calculatie-module; geen geautomatiseerde e2e specifiek voor calculatie

### Gebouwd — Radiaal startmenu monteur-app (vereenvoudigd + waaier)
Waaier teruggebracht van 10 naar 6 hoofd-items (werkdag/gebouwen/verlof/uren/
planning/veiligheid), overige items naar "Meer"-sectie. Garmin-stijl draaiknop
met Reanimated, minDistance(8) voor tap vs. drag, `__FPS_NAVIGEER__` voor
e2e-navigatie.

- **Uitvoering:** volledig
- **Diepere lagen:** volledig — animatie, navigatie, e2e-navigatiehook, "Meer"-sectie allemaal gebouwd
- **Getest:** e2e-monteur-ci (na herstelde SLEUTELS-fix groen)

### Gebouwd — Veiligheidsmodule monteur-app
Veiligheidscherm in de monteur-app met veiligheidscertificaten en relevante
content voor veldmedewerkers.

- **Uitvoering:** volledig voor het basischerm
- **Diepere lagen:** gedeeltelijk — basischerm gebouwd; koppeling aan bredere toolbox/berichten-module (geparkeerd V2.0/V3.0) nog niet
- **Getest:** typecheck groen; e2e-monteur-ci bevestigt scherm bereikbaar via navigatie

### Gebouwd — Werkdagmodule monteur-app
"Mijn werkdag"-scherm in de monteur-app: persoonlijke planning-items voor de
huidige dag, useFocusEffect-refresh bij terugkeer.

- **Uitvoering:** volledig
- **Diepere lagen:** volledig — dag-view, planning-items, refresh-patroon
- **Getest:** typecheck groen; handmatig verifieerbaar via de monteur-app

---

## Mei–juni 2026 (parallel spoor — eerder gebouwd)

### Gebouwd — HRM / Personeel (Fase 1-basis, breed uitgewerkt)
Medewerkers, functiehuis, opleidingen/certificaten (onderscheid opleiding vs.
cursus, rijke velden), bekwaamheidsmatrix, verlofsoorten (incl. bijzondere/CAO),
verlofsaldo's, verlofaanvragen, onboarding-dialoog. AI-opleidingsvoorstel per
functie (stelt voor, mens bevestigt). Medewerker-detailpagina met alle
onderdelen op één plek. Mobiel: read-only dashboard, opleidingen, kennisbank.

- **Uitvoering:** volledig voor Fase 1-basis
- **Diepere lagen:** gedeeltelijk — salarisadministratie, beoordeling, werving en volledige mobiele self-service zijn bewust NIET gebouwd (geparkeerd, V3.0)
- **Getest:** typecheck groen; e2e-web-ci groen; e2e-monteur-ci groen (verlofscherm via navigatie)

### Gebouwd — DMS / Documentenbibliotheek (incl. V1.5-bevriezingsdeel op dossiers)
Documentlogboek, polymorfe koppelingen, duplicaatdetectie (sha256 + fuzzy),
goedkeuringsflow, signaleringen, DMS-dashboard, audittrail, downloadlogging,
read-only mobiel. Dossier-bevriezing: `POST /dossiers/:id/definitief` bevriest
revisie + PDF per gekoppeld document.

- **Uitvoering:** volledig voor de vijf beschreven fases
- **Diepere lagen:** volledig — alle fases 1–5 gebouwd; definitieve dossier-bevriezing is het V1.5-bevriezingsdeel
- **Getest:** typecheck groen; e2e-web-ci groen

### Gebouwd — Dossiermodule (Fase 1-basis)
Dossiers per gebouw, status concept → definitief → gearchiveerd.

- **Uitvoering:** volledig voor Fase 1-basis
- **Diepere lagen:** gedeeltelijk — het juridisch sluitende bevroren opleverdossier met volledig versiebeheer blijft V1.5
- **Getest:** typecheck groen

### Gebouwd — Offerte Intelligence (Fase 1-basis, alleen voorbereiding)
Offertes en offerte-sjablonen, regels uit spots. Bewust geen AI en geen verzending.

- **Uitvoering:** volledig voor Fase 1-basis
- **Diepere lagen:** gedeeltelijk — AI-calculatie en automatische verzending bewust niet gebouwd (geparkeerd)
- **Getest:** typecheck groen

---

## Eerder (roadmap-fases, afgerond voor mei 2026)

### V1.3 — Spots & uitvoering
Spotflow web + mobiel, SVG-editor, scheidingen, clusters, serie plaatsen, AI-spotvoorstel.
**Uitvoering:** volledig voor de kernfunctionaliteit. **Diepere lagen:** gedeeltelijk (restpunten zijn verfijning, geen kernfunctionaliteit). **Getest:** typecheck + e2e groen.

### V1.2 — Bibliotheek & documentstructuur
Centrale documentbibliotheek, applicaties, toepassingen, ETA's, versiebeheer, AI-analyse.
**Uitvoering:** volledig. **Diepere lagen:** gedeeltelijk (documentcontrole/periodieke check geparkeerd). **Getest:** typecheck + e2e groen.

### V1.1 — Rollen & bevoegdheden
Bevoegdhedenmatrix (jsonb), 14 profielen/presets, beheerinterface, legacy-fallback.
**Uitvoering:** volledig. **Diepere lagen:** volledig. **Getest:** typecheck + e2e groen.

### V1.0 — Administratief gereed voor uitvoering
Dashboard, gebouwenbeheer, voorzieningenoverzicht, inspecties, onderhoud,
gebruikersbeheer, abonnementen, eigen sessie-auth met verplichte TOTP.
**Uitvoering:** volledig. **Diepere lagen:** volledig. **Getest:** typecheck + e2e groen.
