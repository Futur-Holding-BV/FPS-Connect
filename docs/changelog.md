# Changelog — FPS Connect

Overzicht van opdrachten, fixes en bouwwerk per datum.
Voor elke taak drie scores:
- **Uitvoering** — volledig / gedeeltelijk / niet

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
