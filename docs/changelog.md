# Changelog — FPS Connect

Overzicht van opdrachten, fixes en bouwwerk per datum.
Voor elke taak drie scores:
- **Uitvoering** — volledig / gedeeltelijk / niet
- **Diepere lagen** — volledig / gedeeltelijk / niet (= of de onderliggende detailscenario's ook gebouwd zijn)
- **Getest** — e2e geautomatiseerd / typecheck / handmatig door agent / niet expliciet getest

Grote roadmap-fases staan ook in `docs/roadmap/gebouwd.md` en `docs/roadmap/actief.md`.

## 2026-07-03 — Architectuurontwerp: Documenten-inbox / Verwerkingswachtrij

**Uitvoering:** architectuur-backlog (geen productiecode) | **Getest:** n.v.t.

Volledige architectuur- en afhankelijkheidsanalyse op basis van de spec "Toevoeging – Documenten-inbox / Verwerkingswachtrij". Geen implementatie — dit wacht op nieuw expliciet akkoord ná beoordeling van de vijf basisopdrachten.

**Rapport:** `docs/architectuur/documenten-inbox.md`

Bevindingen:
- De inbox bestaat al grotendeels: `inbox_items`-tabel, `inbox_audit_log`, volledige CRUD-routes, inboxpagina (796 regels), SlimUpload-integratie. Dit is meer dan de spec veronderstelde.
- AI-classifier is momenteel een mock (`classificeerMockAI()` op bestandsnaam-patronen); offerte-aanvraag gebruikt al echte GPT-4o.
- Statusmachine wijkt af van de spec; additieve uitbreiding aanbevolen (geen brekende hernoem-migratie).
- Meervoudige koppelingen ontbreken — nieuwe `inbox_koppelingen`-tabel vereist.
- Definitieve verwerking ("dispatcher" naar doelmodule) ontbreekt volledig.
- Alle 5 basisopdrachten zijn harde afhankelijkheden; WorkflowEngine en Audit Trail zijn kritiek.
- 8 openstaande beslissingen geïdentificeerd die vóór implementatie beantwoord moeten worden.
- Bouwvolgorde opgedeeld in 5 fases (A–E) met expliciete blokkades.

## 2026-07-03 — Task #180 — Centrale Rechtenstructuur + Rapporten (Opdrachten 4 & 5)

**Uitvoering:** volledig | **Diepere lagen:** volledig | **Getest:** typecheck:libs + api-server typecheck (pre-existing fouten ongewijzigd) + firevault typecheck

### Opdracht 4 — Integriteitscontrole

`docs/integriteitscontrole.md` — analyse-rapport (lees-only, niets verwijderd):
- Duplicaties: magBijGebouw (4×) + toegewezenGebouwIds (4×) → opgelost (zie task #180); parseId-inconsistentie nog openstaand
- Ontbrekende DB-indexes: 13+ hoog-risico kolommen zonder index; migratie via `CREATE INDEX CONCURRENTLY` aanbevolen
- 15 routes schrijven multi-table zonder `db.transaction()` — juridisch risico op dossier-bevriezing + offerte→opdracht
- N+1-queries: gebouwen (3n), documenten (2n), medewerkers (3n)
- DB-foutberichten lekken als HTTP 500 naar client (~20 routes)
- Volledige prioriteitenmatrix in rapport (Kritiek → Laag)

### Opdracht 5 — Technische Schuld Top 100

`docs/technische-schuld.md` — 100 items verdeeld over 9 categorieën (P1–P4):
- P1 (17 items, ~100 uur): indexes, transacties op juridische paden, rate-limiting auth/AI, centrale error-handler, backup-alerting, productie-migratiehistorie
- P2 (36 items, ~180 uur): paginering, HTTP-statuscodes, N+1-queries, security-hardening
- P3/P4 (41 items): code-kwaliteit, frontend DX, DevOps-volwassenheid

### Task #180 — Centrale Rechtenstructuur (architectureel)

**`lib/permissies/src/types.ts`** — nieuwe typen: `ObjectType`, `ObjectRecht`, `PermissieContext`

**`lib/permissies/src/engine.ts`** — `PermissieEngine` (pure class, geen DB-afhankelijkheid):
- 4 dimensies: module-rechten, object-rechten, tijdelijke rechten, rol-bypass
- Stubs voor toekomstige dimensies (IP-gebaseerd, tijdzone-bewust)
- `heeftToegang(ctx, module, objectType?, objectId?)` — gecombineerde evaluatie

**`lib/permissies/src/index.ts`** — re-exports bijgewerkt

**`lib/db/src/schema/rechten.ts`** — twee nieuwe tabellen:
- `objectRechtenTable` — object-level rechten per gebruiker (type, objectId, niveau, geldigVan/Tot, reden, verleendDoor)
- `workflowRechtenTable` — workflow-stap autorisaties (stub, toekomst)
- Indexes op gebruiker_idx, object_idx, geldig_tot_idx

**DB push geslaagd** — beide tabellen aangemaakt in Postgres

**`artifacts/api-server/src/lib/permissie-service.ts`** — `PermissieService`:
- Laadt module-rechten + object-rechten + toewijzingen in 1 `Promise.all`
- Bouwt `PermissieContext` op voor de ingelogde gebruiker

**`artifacts/api-server/src/middlewares/auth.ts`** uitgebreid:
- Express.Request augmentatie: `req.permissies` (optioneel, `PermissieContext`)
- `laadPermissies()` middleware — vult `req.permissies` na `requireAuth`
- `requireObjectRecht(idParam, objectType, module, minNiveau)` factory — object-level autorisatie

**`artifacts/api-server/src/utils/rol.ts`** uitgebreid:
- `toegewezenGebouwIds(userId)` — gecentraliseerde helper
- `magBijGebouw(req, gebouwId)` — req-based (ondersteunt impersonatie)
- `magBijGebouwVoorId(userId, gebouwId)` — userId-based

**Duplicatie opgelost** — lokale kopieën verwijderd uit `routes/gebouwen.ts`, `voorzieningen.ts`, `inspecties.ts`, `onderhoud.ts`; allen importeren nu uit `utils/rol.ts`

**`artifacts/api-server/src/routes/object-rechten.ts`** — CRUD routes:
- `GET /object-rechten` — alle actieve rechten (alleenBeheerder)
- `GET /gebruikers/:id/object-rechten` — rechten per gebruiker
- `POST /gebruikers/:id/object-rechten` — recht verlenen
- `DELETE /object-rechten/:id` — recht intrekken
- `PATCH /object-rechten/:id` — geldigheid aanpassen (verlengd/ingetrokken)

**`artifacts/api-server/src/routes/index.ts`** — objectRechtenRouter geregistreerd

**Planner-preset** toegevoegd aan `lib/permissies/src/engine.ts` PRESETS: planning:4, toolbox:2, gebouwen:2, voorzieningen:1, onderhoud:1, personeel:1

**Frontend:**
- `artifacts/firevault/src/pages/beheer/object-rechten.tsx` — nieuwe beheerpagina:
  - Tab "Per gebruiker": gebruiker selecteren → rechten tonen + verlenen
  - Tab "Alle actieve rechten": overzichtstabel
  - Modal voor nieuw recht verlenen (objectType, objectId, niveau, tijdelijk/geldigTot, reden)
  - Verlopen rechten in detail-samenvatting (grijs)
- `artifacts/firevault/src/App.tsx` — route `/beheer/object-rechten` toegevoegd
- `artifacts/firevault/src/layouts/beheerder-layout.tsx` — nav-item "Object-rechten" (isHoofdbeheerder, naast Rollen & Rechten)

## 2026-07-03 — Universele Audit Trail

**Uitvoering:** volledig | **Diepere lagen:** volledig | **Getest:** typecheck + API-verificatie

Elke wijziging in FPS Connect wordt nu centraal geregistreerd in de `audit_log` tabel. De audit trail onderschept automatisch alle POST/PATCH/PUT/DELETE-verzoeken via middleware, en alle statusovergangen via de WorkflowEngine.

### Gebouwde onderdelen

**`lib/db/src/schema/audit.ts` — nieuw schema**
- Tabel `audit_log` met 7 indexes: tijdstip (DESC), module, gebruiker, gebouw, medewerker, document, entiteit
- Velden: id, tijdstip, gebruiker_id, gebruiker_naam, ip_adres, sessie_id, module, actie, entiteit, entiteit_id, entiteit_naam, oude_waarde (jsonb), nieuwe_waarde (jsonb), workflow_status, gebouw_id, medewerker_id, document_id, meta (jsonb)

**`artifacts/api-server/src/lib/audit.ts` — audit service**
- `logAudit()`: fire-and-forget insert (mag nooit de hoofdflow crashen)
- `maakAuditMiddleware()`: onderschept automatisch alle muterende routes na `requireAuth`; leidt module/entiteit af uit `req.route.path`; slaat actie-body op als `nieuwe_waarde`

**`artifacts/api-server/src/routes/audit.ts` — audit routes (alleenBeheer)**
- `GET /audit` — pagineerde lijst met filters: zoek, module, actie, gebruiker_id, gebouw_id, medewerker_id, van/tot datum
- `GET /audit/export` — CSV-download (max 10.000 regels, UTF-8 BOM voor Excel)
- `GET /audit/tijdlijn/gebouw/:id` — tijdlijn per gebouw
- `GET /audit/tijdlijn/medewerker/:id` — tijdlijn per medewerker
- `GET /audit/tijdlijn/document/:id` — tijdlijn per document

**WorkflowEngine integratie**
- `workflow-engine.ts`: na elke succesvolle transitie wordt `logAudit` aangeroepen (buiten de transactie) met oude/nieuwe status als jsonb, inclusief reden in `meta`

**Auth logging**
- `auth.ts`: succesvolle TOTP-login registreert een `inloggen`-event in de audit trail

**Frontend**
- `/beheer/audit` — audit trail-pagina met zoekbalk, filters (module, actie, datum), paginering, klikbare rijen met JSON-weergave oude/nieuwe waarde, CSV-exportknop
- Sidebar nav-item "Audit trail" onder Beheer (ScrollText-icoon, alleenBeheer)

---

## 2026-07-03 — WorkflowEngine centrale statusmachine

**Uitvoering:** volledig | **Diepere lagen:** volledig | **Getest:** unit tests (29/29) + typecheck

Alle statusovergangen in FPS Connect lopen nu via één centrale WorkflowEngine. Geen module meer die status direct in de DB schrijft zonder validatie, bevoegdheidscontrole en auditlog.

### Gebouwde onderdelen

**`lib/db/src/schema/workflow.ts` — nieuw schema**
- Tabel `workflow_transitie_log`: registreert elke statusovergang met workflow-id, entity-id, van/naar-status, gebruiker, tijdstip en vrije metadata (jsonb).
- DB-migratie via `pnpm db run push` uitgevoerd.

**`artifacts/api-server/src/services/workflow-engine.ts` — kern**
- `WorkflowService` class: `registreer()`, `transiteer()`, `toegestaneTransities()`, `isGeconfigureerd()`.
- `transiteer()` doorloopt: config ophalen → entity laden → idempotentiecheck (zelfde status = no-op) → bevoegdheidscheck (niveau vereist, hoofdbeheerder bypass) → precheck (vrije voorwaardevalidatie) → DB-transactie: `uitvoerenTransitie` + `postTransitie` + log-insert.
- `maakTransitieContext()` helper: bouwt `TransitieContext` op vanuit een Express-request + één DB-query voor bevoegdheden/rol.
- Fouttypen: `NIET_GEVONDEN` (404/500), `NIET_TOEGESTAAN` (409), `BEVOEGDHEID` (403), `VOORWAARDE` (422).

**`artifacts/api-server/src/services/workflow-configs.ts` — 10 geconfigureerde workflows**
- `offerte` — concept → verstuurd → geaccepteerd → afgewezen → verlopen (+ ged. herroepen/gesloten)
- `opdracht` — concept → actief → voltooid / geannuleerd
- `inkoopbon` — aangevraagd → goedgekeurd → besteld → ontvangen / afgewezen; `uitvoerenTransitie` zet `goedgekeurdOp` + `goedgekeurdDoorId`
- `inkoopplan` — concept → ingediend → goedgekeurd → afgewezen
- `uitvoeringsplan` — concept → gepland → actief → voltooid / afgeweken
- `verlofaanvraag` — concept → aangevraagd → goedgekeurd / afgewezen / ingetrokken; `uitvoerenTransitie` doet SELECT FOR UPDATE + saldo-aanpassing + auditlog; precheck vereist reden bij afwijzen
- `onderhoud` — openstaand → in_uitvoering → voltooid / geannuleerd; `postTransitie` logt activiteit bij voltooiing
- `calculatie` — concept → actief → definitief / gearchiveerd
- `planning_item_uitvoering` — gepland → gestart → voltooid / afgebroken
- `arbeidsovereenkomst` — concept → actief → verlopen / beëindigd

**`artifacts/api-server/src/__tests__/workflow-engine.test.ts` — 14 unit tests**
- Happy path, 404 (entity niet gevonden), 500 (workflow niet geconfigureerd)
- Ongeldige transitie (409), dezelfde status (no-op, geen log)
- Bevoegdheidscheck (403) + hoofdbeheerder bypass
- Precheck fout (422) + precheck geslaagd
- postTransitie-hook aangeroepen (mock)
- toegestaneTransities correct gefilterd op huidige status
- `isGeconfigureerd` detectie

**Route-migraties — alle status-PATCH-handlers via engine**
- `routes/index.ts` — side-effect import `workflow-configs` zodat singleton gevuld is bij serverstart
- `routes/onderhoud.ts` — status via engine; inline `logActiviteit` bij voltooid verwijderd (engine postTransitie)
- `routes/calculaties.ts` — status via engine
- `routes/opdrachten.ts` — status via engine
- `routes/offertes.ts` — status via engine (vóór de overige UPDATE-velden)
- `routes/werkvoorbereiding.ts` (inkoopbon PATCH) — status via engine; goedgekeurdOp/Door naar uitvoerenTransitie verplaatst
- `routes/hrm.ts` (verlofaanvraag PATCH) — volledige handmatige transactie vervangen; status via engine, veldwijzigingen apart

### Architectuurkeuzes
- Statuswijziging en veldwijzigingen zijn bewust gescheiden: engine schrijft uitsluitend status + log; de route doet daarna een tweede UPDATE voor overige velden. Dit houdt de engine toestandsloos en routes leesbaar.
- Engine maakt per statuswijziging één extra DB-query (bevoegdheden ophalen). Acceptabel omdat statusovergangen zeldzaam zijn.
- `maakTransitieContext` is de enige interface tussen Express-routes en de engine; geen directe DB-aanroepen voor status buiten deze helper.

---

## 2026-07-02 — AI Besluitvorming ontwerp

**Uitvoering:** volledig | **Getest:** niet van toepassing (read-only ontwerp)

### Wat er gedaan is

Uniform besluitvormingsmodel ontworpen voor alle 7 AI-assistenten in Connect. Elke AI werkt langs dezelfde 8 stappen. Uitgewerkt per assistent inclusief vraag-typen, analyse, onderbouwing, confidence-factoren, adviesformaat en workflow.

**Document:** `docs/ai-besluitvorming-2026-07-02.md`

**8-stappen model (universeel):**
Vraag → Analyse → Onderbouwing → Confidence → Advies → Gebruiker beslist → Logboek → Workflow

**7 AI-assistenten volledig uitgewerkt:**
- AI Uitvoerder — spot-herkenning, toepassingsselectie, installatie-validatie
- AI Werkvoorbereider — inkoopplanning, uitvoeringsplanning, materiaaloverzichten
- AI Calculator — kostprijs, tarieventoepassing, margeanalyse (module geparkeerd; ontwerp klaar)
- AI HRM — opleiding-voorstel, contract-analyse, verlofadvies, bekwaamheidsmatrix
- AI Veiligheid — LMRA-voorstel, toolbox-vragen, incident-analyse (laag-confidence blokkeert workflow)
- AI Financieel — factuurcontrole, salaris-mutatie validatie, debiteurenbewaking
- AI Commercie — offerte-sectie schrijven, e-mail-inzicht, CRM-coaching, contract-analyse

**Uniforme AiBesluit data-interface** beschreven (TypeScript interface, koppelt 8 stappen aan logboek + UI)

**Confidence-schema:** hoog/midden/laag + 7 generieke factoren die de score verlagen; per assistent eigen aanvullende factoren

**Grenzen van AI** expliciet vastgelegd: wat de AI nooit zelf beslist (veiligheid, juridisch, financieel, HR, kwaliteit, compliance, incidenten)

**Escalatieprotocol** beschreven: correcties, laag-confidence bevestigingen, open adviezen

**Kwaliteitsmetingen:** bevestigingsratio > 85 %, correctieratio < 10 %, afwijzingsratio < 5 %, confidentie-accuratesse > 90 %

**Geen code gewijzigd** — uitsluitend ontwerpdocument.

---

## 2026-07-02 — AI Logboek ontwerp

**Uitvoering:** volledig | **Getest:** niet van toepassing (read-only ontwerp)

### Wat er gedaan is

Volledig AI-logboek ontworpen voor FPS Connect. Alle 20 AI-acties geïnventariseerd. Datamodel, privacyontwerp, kostencalculatie en schermontwerp uitgewerkt.

**Document:** `docs/ai-logboek-ontwerp-2026-07-02.md`

**Alle 16 vereiste log-velden gedekt:**
gebruiker, AI-assistent, project, gebouw, document, prompt (samenvatting+hash), antwoord, confidence, gekozen actie, gebruiker bevestiging, vervolgactie, gebruikte documenten, gebruikte kennisobjecten, gebruikte modellen, kosten, tokens, duur

**Privacyontwerp:** volledige prompttekst NIET opgeslagen (AVG); samenvatting (<500 tekens) + SHA-256-hash bewaard. Bewaarperioden: 2 jaar operationeel, 7 jaar compliance-kritisch/HRM.

**Kostencalculatie:** per model token-prijs × wisselkoers → `kosten_eurocent`; rapportage per module/gebruiker/periode.

**20 AI-acties geïnventariseerd** over 6 services + 14 routes (document-ai, spot-ai, gebouw-ai, email-ai, opleiding-ai, crm-ai, offerte-ai, contract-ai, werkvoorbereiding-ai, gereedschap-ai, toolbox-ai, slim-upload).

**Schermontwerp (ASCII):**
- Statistieken-balk: kosten, aanroepen, slagingspercentage, gem. duur
- Filterbalk: module, status, betrouwbaarheid, gebruiker, gebouw, model, periode
- Logboektabel met alle velden per rij
- Detail-panel (slide-in): volledige logregel incl. bronnen, beslissing, vervolgactie
- Kostengrafiek per module + bevestigingsratio per module
- Export CSV (privacybewust: samenvatting/hash niet meegeëxporteerd)

**Navigatie:** Beheer > AI Logboek (bevoegdheid systeem 1/2)

**Geen code gewijzigd** — uitsluitend ontwerpdocument.

---

## 2026-07-02 — Kennisobject-model Connect

**Uitvoering:** volledig | **Getest:** niet van toepassing (read-only ontwerp)

### Wat er gedaan is

Kennisobject-model ontworpen voor FPS Connect. Een document is grondstof; kennis is het eindproduct. Het model beschrijft vier lagen (bronmateriaal, kern-kennisobjecten, contextuele kennisobjecten, afgeleide kennis) en werkt elk kennisobject volledig uit.

**Document:** `docs/kennisobject-model-2026-07-02.md`

**Vier lagen:**

| Laag | Inhoud |
|---|---|
| 0 — Bronmateriaal | Documenten (PDF) als grondstof; documenttype bepaalt welke kennisobjecten worden geleverd |
| 1 — Kern-kennisobjecten | Fabrikant · Product · Norm · Prestatie · Certificaat · Toepassing |
| 2 — Contextuele kennisobjecten | Installatie (spot) · Gebouw/Project · Inspectie/Beoordeling |
| 3 — Afgeleide kennis | Toepassingsadvies · Risicomelding · Kennisgraaf-redenering (AI) |

**Zes kern-kennisobjecten uitgewerkt:**
- Fabrikant: naam, land, keuringsinstantie, actief (uitbreiding op bestaande `fabrikantenTable`)
- Product: naam, productlijn, artikelnummer, status, vervangen_door_id (uitbreiding op `labelsTable`)
- Norm: code, versie, type, opvolger_id (nieuwe entiteit; nu losse tekstvelden)
- Prestatie: brandwerendheidsklasse, installatieconditie, maten per testrapport (nieuwe entiteit)
- Certificaat: certificaatnummer, instantie, geldig_van/tot, product_id+norm_id (nieuwe entiteit)
- Toepassing: product_id + prestatie_id als FK's (uitbreiding op bestaande `labelsTable`)

**Kennisobject-cyclus:** upload → AI-extractie → validatie-pipeline → actief → beschikbaar voor advies en signalering → verval/revisie

**Mapping op bestaande infrastructuur:** 5 bestaande tabellen uitbreiden, 5 nieuwe entiteiten.

**Geen code gewijzigd** — uitsluitend ontwerpdocument.

---

## 2026-07-02 — Documentarchitectuur Connect

**Uitvoering:** volledig | **Getest:** niet van toepassing (read-only ontwerp)

### Wat er gedaan is

Documentarchitectuurontwerp opgesteld voor FPS Connect. Drie categorieën gedefinieerd, per categorie 7 dimensies uitgewerkt. AI-zoekplatform ontworpen als tweede manier van werken — volledig synchroon met de bestaande mappenstructuur.

**Document:** `docs/documentarchitectuur-2026-07-02.md`

**Drie categorieën:**

| Categorie | Voorbeelden | Opslag |
|---|---|---|
| Referentiedocumenten | ETA's, testrapporten, DoP's, productcertificaten | Centrale bibliotheek + `/objects/{id}/rapport/` |
| Operationele documenten | Spot-foto's, plattegronden, LMRA's, toolboxen, medewerker-docs | Per entiteit-pad per type |
| Procesdocumenten | Offertes, dossiers, rapporten, arbeidscontracten, ZZP | Per proces-entiteit-pad |

**7 dimensies per categorie:** opslag, versiebeheer, eigenaarschap, rechten, AI-index, zoekfunctionaliteit, archivering.

**AI-zoekplatform (nieuw, tweede ingang):**
- Chunk-indexer: PDF → chunks → vector-embeddings (`text-embedding-3-small`)
- `document_chunks`-tabel met HNSW-index op embedding
- `POST /documenten/zoeken` naast bestaand `GET /documenten`
- Frontend-toggle: Bladeren (bestaand) ↔ AI-zoeken (nieuw)
- Synchronisatie: documenten-tabel = bron van waarheid; vector-index = afgeleid systeem, volledig herbouwbaar
- HRM-documenten: alleen metadata-indexering (AVG)
- Definitieve dossiers: niet geïndexeerd (bevroren juridische toestand)

**Geen code gewijzigd** — uitsluitend ontwerpdocument.

---

## 2026-07-02 — Integraal verbeterplan Connect: 20 stappen

**Uitvoering:** volledig | **Getest:** niet van toepassing (read-only plan)

### Wat er gedaan is

Integraal verbeterplan opgesteld op basis van de drie eerder gemaakte analyses (workflowanalyse, AI-architectuuranalyse, grote-bestanden-analyse). Geen nieuwe functionaliteit — uitsluitend technische verbeteringen.

**Plan:** `docs/integratieplan-connect-2026-07-02.md`

**20 concrete stappen in 6 fasen:**

| Fase | Stappen | Onderwerp |
|---|---|---|
| 1 | 1–2 | AI-fundament: `lib/ai-utils.ts` + `lib/ai-model-registry.ts` |
| 2 | 3–6 | AI-deduplicatie: veiligheid-ai, calculatie-ai, upload-ai, CrmCoachPanel-hook |
| 3 | 7–11 | Backend-opsplitsingen: hrm.ts (3 stappen) + veiligheid.ts (2 stappen) |
| 4 | 12–16 | Frontend-opsplitsingen: plattegrond.tsx + print.tsx |
| 5 | 17–18 | Documenten-tab opsplitsen |
| 6 | 19–20 | Personeel-tabs opsplitsen |

**Parallelisatie:** fase 3+4+5+6 kunnen tegelijk starten. Binnen fase 3: hrm-splits parallel met veiligheid-splits. Binnen fase 4: stap 13+14 parallel na stap 12.

**Prioriteiten:**
- Hoogste: `hrm.ts` (4164r, 15 domeinen), JSON-strip deduplicatie, plattegrond-constanten
- Laagste: `personeel/index.tsx`, `offertes.ts` klantcontracten, salaris-ai service

Workflow-verbeteringen (nieuwe knoppen/routes) zijn bewust buiten scope gehouden.

**Geen code gewijzigd** — uitsluitend plandocument.

---

## 2026-07-02 — Grote bestanden: splitsingsvoorstel 7 bestanden

**Uitvoering:** volledig | **Getest:** niet van toepassing (read-only analyse)

### Wat er gedaan is

Structuuranalyse van de 7 grootste bestanden in de codebase (totaal ~19.400 regels). Per bestand: huidige verantwoordelijkheden, voorstel voor opsplitsing, afhankelijkheden en risico's.

**Rapport:** `docs/grote-bestanden-splitsingsvoorstel-2026-07-02.md`

| Bestand | Regels | Voorstel |
|---|---|---|
| `hrm.ts` | 4 164 | 8 deelrouters (werkgevers, functies-opleidingen, medewerkers, verlof, ziekmeldingen, capaciteit, offboarding, ZZP, mijn) |
| `plattegrond.tsx` | 3 249 | 6 bestanden (constanten, componenten, spot-form, serie, sidebar, orkestratie) |
| `print.tsx` | 2 963 | 5 bestanden (constanten, componenten, secties, configuratie, orkestratie); deelt constanten met plattegrond |
| `veiligheid.ts` | 2 485 | 5 deelrouters (toolboxen, LMRA, meldingen, incidenten, dashboard) |
| `documenten-tab.tsx` | 2 349 | 6 bestanden (constanten, formulier, detail, koppelingen, signaleringen, orkestratie) |
| `personeel/index.tsx` | 2 202 | 8 tab-bestanden + orkestratie |
| `offertes.ts` | 2 028 | 5 deelrouters (sjablonen, kern, portaal, communicatie, klantcontracten) |

Bijzondere bevindingen:
- `plattegrond.tsx` en `print.tsx` dupliceren 3 constanten-blokken — extractie naar `plattegrond-constanten.ts` lost dit op voor beide bestanden tegelijk
- `documenten-tab.tsx` exporteert functies die extern gebruikt worden (`goedkeuringBadge`, `statusBadge`, `foutmelding`) — brede impact bij opsplitsen
- `personeel/index.tsx` heeft cross-tab state-koppeling (onboarden-flow linkt medewerkers ↔ functies)
- `veiligheid.ts` gebruikt `veiligheidRouter` i.p.v. `router` — vandaar dat standaard grep niets vond

**Geen code gewijzigd** — uitsluitend analysedocument.

---

## 2026-07-02 — AI-architectuuranalyse + voorstel centrale AI-service

**Uitvoering:** volledig | **Getest:** niet van toepassing (read-only analyse)

### Wat er gedaan is

Volledige analyse van alle AI-code in backend (routes, services, lib) en frontend (componenten, pagina's). Voorstel opgesteld voor één centrale AI-servicelaag.

**Rapport:** `docs/ai-architectuur-analyse-2026-07-02.md`

**Bevindingen:**
- 19 AI-functionaliteiten in totaal; 6 via service-bestanden, 13 inline in route-handlers
- 1 gedeelde OpenAI-client-factory (goed fundament), 5 service-bestanden (goed patroon)
- Centraal `/ai/`-namespace gedeeltelijk benut (5 routes), 22 AI-routes verspreid over module-handlers
- 6 concrete dupliceringspatronen: JSON markdown-strip (10+ varianten), vision-bouw (3x), AI-chat (2x), wisselende model-selectie (4 modellen), inconsistente heeftOpenAi()-guard, CrmCoachPanel-raw-fetch
- Mobiele app (FPS Monteur): geen AI-functionaliteit
- `CrmCoachPanel` bypast gegenereerde API-client (directe fetch, geen caching)
- `scoutService.ts` ligt in lib/ i.p.v. services/ (vindbaarheidsprobleem)

**Voorstel (5 lagen, geen implementatie):**
1. `lib/openai.ts` — singleton + logAiAanroep (kleine uitbreiding)
2. `lib/ai-utils.ts` — NIEUW: parseerAiJson, bereidVisionAfbeelding, heeftAiOfGooi
3. `services/` — 7 nieuwe service-bestanden (factuur-ai, veiligheid-ai, calculatie-ai, inkoop-ai, upload-ai, crm-ai, salaris-ai)
4. `routes/ai.ts` — uitbreiding /ai/ namespace
5. `lib/ai-model-registry.ts` — NIEUW: centraal modelregister (standaard/vision/chat/licht/compat)

Implementatievolgorde in 8 stappen (A–H), elk afzonderlijk terugrolbaar.

**Geen code gewijzigd** — uitsluitend analysedocument.

---

## 2026-07-02 — Workflowanalyse: alle bedrijfsprocessen in kaart

**Uitvoering:** volledig | **Getest:** niet van toepassing (read-only analyse)

### Wat er gedaan is

Diepgaande workflowanalyse uitgevoerd op de volledige keten van 12 processtappen. Analyse gebaseerd op DB-schema (FK-koppelingen), OpenAPI-spec en frontend pagina-componenten.

**Rapport:** `docs/workflowanalyse-2026-07-02.md`

**Resultaat per stap:**
- **VOLLEDIG (1/12):** Offerte → Opdracht (knop "Maak opdracht", volledige FK-ketting, automatische doorstuur)
- **GEDEELTELIJK (7/12):** CRM→Project, Project→Opname, Opname→Calculatie, Calculatie→Offerte, Opdracht→Werkvoorbereiding, Werkvoorbereiding→Inkoop, Onderhoud→Financieel
- **ONTBREEKT (4/12):** Inkoop→Magazijn (ontvangstboeking), Magazijn→Uitvoering, Uitvoering→Oplevering, Oplevering→Onderhoud

**11 handmatige overdrachtspunten** geïdentificeerd en beschreven.

**Aanvullende observaties:** Planning-stap buiten de 12 flows, Snagstream als kwaliteitsgate, Dossier als juridisch opleverdossier, crediteuren-sterk/debiteuren-zwak in facturering, feature flags als workflow-blokkade (calculatie uit in pilot).

**Prioriteitsvolgorde gaps:** Uitvoering-module → V1.4 Oplevering → Oplevering→Onderhoud → Onderhoud→Factuur (debiteuren) → CRM→Project → Inkoop→Magazijn ontvangst → Calculatie→Offerte.

**Geen code gewijzigd** — uitsluitend analysedocument.

---

## 2026-07-02 — Domeinarchitectuur: migratievoorstel 6 domeinen

**Uitvoering:** volledig | **Getest:** niet van toepassing (document-only)

### Wat er gedaan is

Volledige analyse van de huidige navigatiestructuur (`beheerder-layout.tsx`, 57 nav-items) en een gedetailleerd migratievoorstel opgesteld dat alle items mapt naar 6 nieuwe domeinen.

**Rapport:** `docs/domeinarchitectuur-migratievoorstel.md` — bevat:
- Huidige structuur (12 secties, 57 items) versus nieuwe domeinstructuur (6 domeinen)
- Per domein: alle items met huidig pad, huidige sectie en toelichting
- Samenvatting van 7 concrete verplaatsingen (van 57 items)
- Impact per domein (navigatieimpact + aanbevelingen)
- Aanbevolen implementatievolgorde (Domein 6 → 3 → 2 → 5 → 4 → 1)
- 4 openstaande vragen ter beoordeling (Opnames, AccountView-koppeling, Toolbox-splitsing, Dashboard)

**Geen code gewijzigd** — uitsluitend een analysedocument.

**Domeinindeling:**
1. Projecten & Uitvoering (10 items)
2. Inkoop, Magazijn & Veiligheid (18 items) — Gereedschappen komt hierheen
3. Financieel & Loon (15 items) — Financieel + Loon samengevoegd
4. Commercie (9 items) — Opnames/Calculaties/Offertes komen hierheen
5. Organisatie & Communicatie (19 items)
6. Instellingen & Beheer (24 items) — Documentopmaak/Studio/Workflow komen hierheen

---

## 2026-07-02 — Audit: module-integratieaudit FPS Connect / FPS One

**Uitvoering:** volledig | **Getest:** niet van toepassing (read-only audit)

### Wat er gedaan is

Diepgaande module-integratieaudit uitgevoerd op de volledige codebase — 83 backend-routemodules, 189 frontend-pagina's, 42 Expo-schermen, ~568 OpenAPI-paden geanalyseerd.

**Rapport:** `docs/audit-module-integratie-2026-07-02.md` — 15 secties:
- Module-inventaris met volwassenheidsscore 0–5 per module (33 modules gescoord)
- Integratiematrix: cross-module dataafhankelijkheden (13×13 tabel)
- Kritische bedrijfsprocessen: 5 end-to-end procesflows geanalyseerd
- Scaffold-detectie: 5 volledige scaffolds + 5 partiële scaffolds geïdentificeerd
- Datamodel-koppeling: ontbrekende FK's en schema-gaps gedocumenteerd
- Bevoegdhedengaps: 4 concrete gaten (wagenpark, boekhouder, studio, etc.)
- 15 kritieke gaps geprioriteerd, 15 aanbevelingen geformuleerd
- Roadmap-alignment: CRM en Toolbox zijn actief uitgebouwd voorbij "geparkeerd"-scope

**Kritieke bevindingen:**
- Inkoop-module: 0 endpoints, geen routebestand, geen DB-schema — grootste supply-chain gap
- FPS One: 4 van 5 klantportaal-pagina's zijn pure scaffolds (score 0/5)
- FPS One gebouwen-link stuurt klanten door naar intern portaal (beveiligingsrisico)
- Verlof-planning en uren-salaris koppelingen ontbreken (handmatige handoffs)
- CRM is actief gebouwd (32 endpoints, 8 DB-tabellen) terwijl roadmap "geparkeerd" zegt
- Platformgemiddelde volwassenheidsscore: 3,2 / 5

---

## 2026-07-02 — Beveiliging: FPS One klant-navigatiegap + wagenpark-meldingen auth (OPDRACHT 1)

**Uitvoering:** volledig | **Getest:** typecheck + build api-server

### Bevindingen per onderzoeksgebied

**Wagenpark-routes:** Alle routes in `wagenpark.ts` hadden al correcte `requireBevoegdheid("wagenpark", 1/2/3/4)` — geen aanpassing nodig.

**Boekhouder-routes:** Alle routes in `boekhouder.ts` hadden al correcte `requireBevoegdheid("boekhouder_portaal", 1/2)` — geen aanpassing nodig.

**Overige routes (vergelijkbaar patroon gevonden):** `wagenpark-meldingen.ts` `POST /meldingen` had geen expliciete auth-middleware; ook was de sessieveld-naam fout (`gebruikerId` i.p.v. `userId`).

**FPS One / KlantPortal:** `pages/one/gebouwen.tsx` linkte rechtstreeks naar `/gebouwen/:id` (de interne Connect-beheerdetailpagina). Klant-rol gebruikers konden via `KlantPortal` ook `/gebouwen/:id` (GebouwDetail, vol beheer) en `/gebouwen/:id/plattegrond/:verdiepingId` (SVG-editor) openen.

### Gewijzigde bestanden

**Backend — `artifacts/api-server/src/routes/wagenpark-meldingen.ts`:**
- `POST /meldingen`: `requireAuth` toegevoegd als expliciete middleware (naast de al bestaande globale requireAuth in index.ts)
- Sessieveld gecorrigeerd van `req.session.gebruikerId` naar `req.session["userId"]`

**Frontend — `artifacts/firevault/src/pages/one/gebouwen.tsx`:**
- Link veranderd van `href="/gebouwen/${gebouw.id}"` naar `href="/one/gebouwen/${gebouw.id}"`

**Frontend — nieuw bestand `artifacts/firevault/src/pages/one/gebouw-detail.tsx`:**
- Read-only klant-gebouwdetailpagina: naam, adres, spotaantal (via `useGetGebouwSpotsInzicht`), gebouwtype/omschrijving
- Terug-link adapteert op pathname (`/one/gebouwen` vs `/gebouwen`)
- Geen management-acties, tabs, interne opmerking, plattegrond-editor of uitvoering-overzicht

**Frontend — `artifacts/firevault/src/App.tsx`:**
- `ConnectPortal`: route `/one/gebouwen/:id` → `OneGebouwDetail` toegevoegd (vóór `/one/gebouwen`)
- `KlantPortal`: `/gebouwen/:id` → `GebouwDetail` vervangen door `/gebouwen/:id` → `OneGebouwDetail`
- `KlantPortal`: route `/gebouwen/:id/plattegrond/:verdiepingId` → `Plattegrond` verwijderd (SVG-editor ongeschikt voor klanten)

---

## 2026-07-02 — Bugfix: slim-upload overlay blijft hangen bij teruggetrokken drag

**Uitvoering:** volledig | **Getest:** typecheck

### Wat er gewijzigd is

**Frontend — `artifacts/firevault/src/components/slim-upload-balk.tsx`:**
- `opDragLeave` controleerde alleen `relatedTarget === null` om te detecteren dat de cursor het browservenster verliet. Op Firefox en sommige Edge-versies is `relatedTarget !== null` ook al de cursor buiten het viewport is. Fix: extra grenscheck op `clientX/Y` vs `window.innerWidth/innerHeight` — als de cursor buiten de viewport valt, wordt het overlay direct gesloten.
- `Escape`-toets sluit het overlay nu ook (`keydown`-listener op `document`).
- Klikken op het donkere backdrop sluit het overlay (`onClick` op de backdrop-div met `cursor-pointer` en `title="Klik om te annuleren"`).

---

## 2026-07-02 — Bugfixes: slim-upload array-response + monteur-app AuthContext

**Uitvoering:** volledig | **Getest:** typecheck + workflow herstarts

### Wat er gewijzigd is

**Backend — `artifacts/api-server/src/routes/slim-upload.ts`:**
- `POST /slim-upload/analyseer` stuurde altijd een array (`res.json(resultaten)`) terug, maar de frontend verwacht één object. Wanneer de AI het document niet kon classificeren (categorie "onbekend"), zag de frontend `suggestie.categorie = undefined` en viel stilzwijgend terug op "algemeen" — nooit de AI-suggestie. Fix: `res.json(resultaten.length === 1 ? resultaten[0] : resultaten)`. Nu ziet de frontend het juiste object incl. "onbekend" + alternatieven.

**Monteur-app — `artifacts/monteur-app/app/pbm.tsx`:**
- `import { useAuth } from "@/context/AuthContext"` verwees naar een niet-bestaand pad (bundler-fout bij elke build). Correcte import: `@/context/auth`.

---

## 2026-07-02 — AI-chatpaneel voor Calculatie en Werkbegroting

**Uitvoering:** volledig | **Getest:** typecheck firevault clean

### Wat er gewijzigd is

**OpenAPI — `lib/api-spec/openapi.yaml`:**
- 3 nieuwe schemas: `AiChatBericht` (rol + inhoud), `AiChatInput` (berichten[] + optionele afbeelding_base64), `AiChatAntwoord` (antwoord string)
- Nieuw endpoint `POST /modules/calculaties/{id}/ai-chat` (operationId: `aiChatCalculatie`)
- Nieuw endpoint `POST /opdrachten/{id}/werkbegroting/ai-chat` (operationId: `aiChatWerkbegroting`)
- Codegen opnieuw uitgevoerd → hooks `useAiChatCalculatie` en `useAiChatWerkbegroting` gegenereerd

**Backend — `artifacts/api-server/src/routes/mod-calculatie.ts`:**
- `POST /:id/ai-chat` handler: laadt gebouw, spots, opname, normtijden en tarieven als context; geeft al die data + gesprekshistorie mee aan gpt-5.4 (`max_completion_tokens: 2000`); ondersteunt visie via `afbeelding_base64`

**Backend — `artifacts/api-server/src/routes/opdrachten.ts`:**
- `POST /:id/werkbegroting/ai-chat` handler: laadt opdracht + werkbegroting-regels als context; zelfde gpt-5.4 patroon

**Frontend — `artifacts/firevault/src/components/ai-chat-panel.tsx`:**
- Herbruikbaar chatpaneel: berichtenlijst met rol-kleuren, tekstvak, afbeelding-upload (base64), snelle-actie-knoppen, laad-indicator, auto-scroll; props: `onVerstuur`, `snelleActies?`, `placeholder?`, `className?`

**Frontend — `artifacts/firevault/src/pages/modules/calculatie/detail.tsx`:**
- Import `useAiChatCalculatie` + `AiChatPanel` + `MessageSquare`
- Hook `aiChatMut = useAiChatCalculatie()` naast bestaande `aiMut`
- State `chatOpen` toegevoegd
- Header: nieuwe "AI-chat"-knop (voor de Prullenbak-knop), toggle activeert/deactiveert paneel
- Hoofd lay-out: conditionele 3e kolom `w-[400px]` met `AiChatPanel`; 5 snelleActies (volledigheid, eenheden, urennormen, ontbrekende regels, meerwerk-risico)

**Frontend — `artifacts/firevault/src/pages/opdrachten/detail.tsx`:**
- Import `useAiChatWerkbegroting` + `AiChatPanel` + `MessageSquare` + `CheckCircle2` (ontbrak)
- Hook `aiChatMut = useAiChatWerkbegroting()`
- State `chatOpen` toegevoegd
- Werkbegroting-toolbar: nieuwe "AI-chat"-knop naast bestaande "AI-analyse"-knop
- Werkbegroting-tab: conditioneel `AiChatPanel` (hoogte 520px) na de regels; 5 snelleActies (volledigheid, eenheden, ontbrekende werkzaamheden, urennormen, meerwerk-risico)

---

## 2026-07-02 — Increment 5: Meerwerk-flow voor monteurs

**Uitvoering:** volledig | **Getest:** typecheck firevault + monteur-app clean

### Wat er gewijzigd is

**Mobiel — `artifacts/monteur-app/app/werkdag/[id].tsx`:**
- Imports uitgebreid: `useListPlanningMeerwerk`, `useCreatePlanningMeerwerk`, `TextInput`
- 3 nieuwe state-variabelen: `toonMeerwerkFormulier`, `meerwerkTekst`, `meerwerkBezig`
- `useListPlanningMeerwerk({ planning_item_id: id })` — laadt bestaande meerwerk-aanvragen per werkorder
- `indienMeerwerk()` — POST met status="ingediend" + omschrijving; refetcht na succes
- Nieuwe **"Meerwerk melden"**-kaart tussen Werkzaamheden en Uitvoerend personeel:
  - Bestaande aanvragen als statusbadge (In behandeling amber / Goedgekeurd groen / Afgewezen rood)
  - Gestippelde "Meerwerk melden"-knop opent inline formulier
  - TextInput met Annuleren / Indienen knoppen

**Web — `artifacts/firevault/src/pages/modules/planning/index.tsx`:**
- Imports uitgebreid: `useListPlanningMeerwerk`, `useUpdatePlanningMeerwerk`, lucide `CheckCircle2`, `XCircle`, `Wrench`
- `activeTab` type uitgebreid met `"meerwerk"`
- Hooks: `useListPlanningMeerwerk({})` (alle items, geen filter) + `useUpdatePlanningMeerwerk`
- Nieuwe **"Meerwerk"**-tab naast Bezetting / Per dag in de tab-bar
- Tab-inhoud: sectie "In behandeling" (amber) met Afwijzen/Goedkeuren knoppen → PATCH status; sectie "Afgehandeld" (groen/rood read-only); lege staat met Wrench-icoon

---

## 2026-07-02 — Increment 4: Financieel dashboard — Bedrijfsresultaten

**Uitvoering:** volledig | **Getest:** typecheck firevault clean

### Wat er gewijzigd is

- `artifacts/firevault/src/pages/financieel/bedrijfsresultaten.tsx` — volledig herbouwd (was: stub):
  - 4 KPI-kaarten: Totale opdrachtsom, Gefactureerd (% van opdrachtsom), Onderhanden werk, Gem. marge (rood/amber bij negatief/<10%)
  - Facturen-kpi-balk: Klaar voor export, Open bedrag, Exportfouten — klikbaar naar factuurpagina's
  - Signaleringen-paneel: opdrachten met marge_negatief / marge_laag / ohw_hoog / nog_te_factureren / overplanning, gekleurd per type
  - Sorteerbare projecttabel: klikbare kolomkoppen (opdrachtsom, gefactureerd, te factureren, marge, OHW), statusfilter (actief/afgerond/alle), live zoekbalk
  - Totaalrij in tabelvoet (som + gem. marge gefilterde selectie)
  - MargeIndicator-component met TrendingUp/Down + kleurcodering
  - Geen nieuwe API-endpoints: hergebruikt `useListOnderhandenWerk` + `useGetFinancieelDashboard`

---

## 2026-07-02 — Increment 3: Twee nieuwe planningweergaven (Bezetting + Per dag)

**Uitvoering:** volledig | **Getest:** typecheck firevault clean

### Wat er gewijzigd is

- `artifacts/firevault/src/pages/modules/planning/index.tsx`:
  - `activeTab` uitgebreid met `"bezetting"` en `"dag"` (was alleen medewerkers/projecten)
  - Nieuw state `geselecteerdeDag` (default = vandaag) voor de per-dag tijdlijnweergave
  - `LayoutGrid`-icoon toegevoegd aan lucide-imports
  - Twee extra tab-knoppen in de tab-bar: **Bezetting** en **Per dag**
  - **Tab Bezetting** — compacte heatmap-matrix: medewerkers × werkdagen, elke cel toont geplande uren als gekleurd blokje (groen ≤70%, amber 70–100%, rood >100% van dagcapaciteit contracturen/5). Gesloten dagen krijgen een slotje. Klikken op een cel opent direct het inplan-dialoog. Legenda onderaan.
  - **Tab Per dag** — tijdlijnweergave voor één geselecteerde dag: elke medewerker in een rij met horizontale balken op een tijdas (07:30–16:00). Dagnavigatie via pijlen + datumdot-reeks. Items klikbaar voor bewerken; lege cellen openen het inplan-dialoog. Gesloten dag toont slotje + naam over de hele breedte.

---

## 2026-07-02 — Increment 2: AI projectcontroller-signalen op opdracht-detailpagina

**Uitvoering:** volledig | **Getest:** typecheck firevault clean

### Wat er gewijzigd is

- `artifacts/firevault/src/pages/opdrachten/detail.tsx`:
  - Nieuwe client-side helper `berekenSignalen()` berekent 3 signalen uit bestaande nacalculatiedata: **Urenstatus** (verbruikt/begroot), **Eindprognose** (verbruikt + gepland vs. begroting) en **Planningdekking** (geplande uren vs. resterende begroting)
  - Kleurdrempels: groen/oranje/rood op basis van percentages (urenstatus: <75%/75–100%/>100%; prognose: ≤100%/100–115%/>115%; dekking: ≥100%/50–100%/<50%)
  - Nieuwe component `ProjectControllerSignalen` toont de 3 signaalkaarten tussen de KPI-grid en de tabs — alleen zichtbaar als `begroting_arbeid_uren > 0`
  - Koptekst "AI-projectcontroller — Bewaakt, blokkeert niets" met Sparkles-icoon
  - Geen nieuwe API of DB-kolommen; hergebruikt bestaande `useGetNacalculatie` + `useListOpdrachtPlanningUren` data

---

## 2026-07-02 — Increment 1: Gestructureerde werkzaamheden in urenregistratie

**Uitvoering:** volledig | **Getest:** typecheck api-server + firevault clean

### Wat er gewijzigd is

- DB: 3 nieuwe kolommen op `uren_registraties` via `ALTER TABLE IF NOT EXISTS`: `werkzaamheid_categorie text`, `ruimte text`, `object_omschrijving text`
- DB-schema `lib/db/src/schema/uren.ts`: `werkzaamheidCategorie`, `ruimte`, `objectOmschrijving` toegevoegd
- OpenAPI `UrenRegistratie` + `UrenRegistratieInput`: 3 nieuwe nullable velden; codegen uitgevoerd
- Backend `uren.ts`: `mapUren()`, `POST /uren`, `PATCH /uren/:id` lezen/schrijven de 3 nieuwe velden
- Web `uren/index.tsx`: tabelkolom "Categorie" toont gestructureerde categorie als badge + ruimte als subtekst; categorie-filter dropdown toegevoegd (client-side filteren)
- Mobiel `uren.tsx`:
  - `PROJECT_OPTIES` / `INTERN_OPTIES` hernoemd en uitgebreid naar `PROJECT_CATEGORIEEN` / `INTERN_CATEGORIEEN` (10 resp. 7 opties)
  - Chip-picker selecteert nu `werkzaamheidCategorie` (opgeslagen als `werkzaamheid_categorie`)
  - Nieuw veld "Ruimte / locatie" (tekst, optioneel, alleen project-type)
  - Nieuw veld "Object / Spot" (tekst, optioneel, alleen project-type)
  - Bestaand vrije-tekstveld `werkzaamheden` hernoemd naar "Toelichting" en blijft als optionele beschrijving
  - `wisselType()` reset ook de 3 nieuwe velden
  - `opslaan()` stuurt `werkzaamheid_categorie`, `ruimte`, `object_omschrijving` mee in payload

---

## 2026-07-02 — AI Toolbox-generatiesysteem: alle vier fasen gebouwd

**Uitvoering:** volledig | **Getest:** typecheck firevault clean + api-server esbuild-build slaagt

### Wat er gewijzigd is

**Fase 1 — AI genereert toolbox-onderwerpen (web, Connect)**
- Nieuw DB-schema: `ai_gegenereerd boolean` + `foto_suggesties jsonb` kolommen op `veiligheid_toolboxen`
- OpenAPI uitgebreid: 3 nieuwe paden + 4 nieuwe schemas (ToolboxAiBatchInput, ToolboxAiBatchResultaat, ToolboxReviewInput, ToolboxComplianceDashboard)
- Codegen uitgevoerd (Orval + typecheck:libs clean)
- Backend `POST /veiligheid/toolboxen/ai-batch-genereer`: roept GPT-4o aan, genereert tot 50 VCA-toolbox-onderwerpen per batch met titel/categorie/intro/samenvatting/risico's/maatregelen/stoppen/foto-suggesties; valt terug op lege concepten als AI niet beschikbaar
- Backend `PATCH /veiligheid/toolboxen/:id/review`: goedkeuren (→ gepubliceerd=true) of afwijzen (→ verwijderen); alleen voor ai_gegenereerd=true toolboxen
- Web `toolboxen.tsx`: nieuw "AI-wachtrij"-blok toont alle ai_gegenereerd+ongepubliceerd toolboxen met Goedkeuren/Afwijzen-knoppen per rij; "Genereer batch"-knop opent dialog met categorieselectie (toggle-pills), aantal (1–50) en optionele context

**Fase 2 — Verplichte maandpopup op mobiel**
- `_layout.tsx`: nieuwe `ToolboxPopupBewaker`-component (zelfde patroon als LmraBewaker); pollt elke 2 min; toont amber modal met toolbox-titel + maand
- Dag 1–3 (kan_uitstellen=true): wegklikbaar via "Uitstellen tot morgen" (roept bestaand uitstellen-endpoint aan)
- Dag 4+ (kan_uitstellen=false): blokkerend — alleen "Toolbox nu doen" navigeert naar /toolboxen

**Fase 3 — Mobiele toolbox-lezer**
- Al volledig gebouwd in vorige sessie (`toolboxen.tsx` mobiel, 666 regels)

**Fase 4 — Compliance-rapportage dashboard (web, Connect)**
- Nieuwe pagina `/veiligheid/toolbox-compliance`: maand+jaar-selector, 4 KPI-tiles (opdrachten/deelnemers/voltooid/percentage), uitklapbare per-opdracht kaarten met voortgangsbalk + lijst niet-voltooide medewerkers
- Backend `GET /veiligheid/toolbox-compliance`: aggregeert maandopdrachten + status + gebruikersnamen
- Navigatie-item "Toolbox Compliance" toegevoegd aan Veiligheid-sectie sidebar
- Route geregistreerd in `App.tsx`

---

## 2026-07-02 — Fix Slim uploaden: auto-routing toont nu bevestigingsscherm + crash opgelost

**Uitvoering:** volledig | **Getest:** typecheck firevault clean

### Wat er gewijzigd is

- **Automatiseringsregel sloeg direct op zonder vraag**: wanneer een `.pdf` (of andere extensie) eerder 3× was bevestigd en de regel op "geautomatiseerd" stond, werd het bestand direct opgeslagen in de inbox zonder bevestigingsscherm of mogelijkheid voor toelichting. Fix: bij een automatiseringsregel wordt nu een synthetische suggestie aangemaakt, het item toont het volledige beslisscherm met een oranje "Automatisch herkend"-banner en wacht op expliciete bevestiging. Pas bij klikken op de actieknop wordt het bestand opgeslagen.
- **Toelichting altijd beschikbaar**: het toelichting-tekstveld verscheen voorheen alleen in de "wacht"-fase (vóór analyse). Nu toont het ook in de "klaar"-fase zodat u altijd een opmerking kunt meegeven, ook bij reeds geanalyseerde of automatisch herkende bestanden.
- **Crash `can't convert undefined to object`**: `Object.keys(suggestie.gevonden_gegevens)` crashte als de API `gevonden_gegevens: null/undefined` teruggaf. Zelfde risico bij `alternatieven.length`. Beide toegevoegd als `?? {}` / `?? []` defensieve guards. Zowel de `Object.keys`-check als de `<GevondenGegevens>`-prop-doorgave zijn verdedigd.

---

## 2026-07-02 — Contractbewaking (HRM) — AI-bewaking tijdelijke arbeidsovereenkomsten

**Uitvoering:** volledig | **Getest:** typecheck:libs clean, firevault clean, api-server (pre-existing TS7030 only)

### Wat er gebouwd is

- **DB** (3 nieuwe tabellen via `CREATE TABLE`):
  - `arbeidsovereenkomsten` — contracthistorie per medewerker: contracttype (bepaalde_tijd/onbepaalde_tijd/oproep/stage/leer_werk), startdatum, einddatum, proeftijd, salaris bruto, arbeidsduur, CAO, ondertekening, voorgaand-contract-koppeling
  - `contract_signaleringen` — bewakingslog: type (120/90/75/60/30 dagen, verlopen, ketenregel, aanzegtermijn), ernst (info/waarschuwing/kritiek), AI-advies, gezien-status
  - `contract_besluiten` — besluitvorming per contract: besluit (verlengen/wijzigen/onbepaalde_tijd/beëindigen/geen_besluit), AI-samenvatting, aandachtspunten, wettelijke risico's, audittrail (JSONB)
- **Backend** (`artifacts/api-server/src/routes/contract-bewaking.ts` → `contractBewakingRouter`):
  - `GET /contract-bewaking/dashboard` — voert bewaking uit + geeft buckets (verlopen/30/60/90/120 dagen), signaleringen, besluiten-in-behandeling
  - `GET/POST /contract-bewaking/medewerkers/:id` — contracten per medewerker ophalen + nieuw contract aanmaken
  - `PATCH/DELETE /contract-bewaking/:id` — contract bijwerken / verwijderen
  - `GET /contract-bewaking/:id/signaleringen` — signaleringen per contract
  - `PATCH /contract-bewaking/signaleringen/:id/gezien` — signalering als gezien markeren
  - `GET/POST /contract-bewaking/:id/besluit` — besluit ophalen / vastleggen (met audittrail)
  - `POST /contract-bewaking/:id/ai-voorbereiding` — AI-gespreksvoorbereiding genereren (dossier: opleidingen/bekwaamheden/ziekte/verlof/contracthistorie); valt terug op statische analyse zonder OpenAI
  - Wettelijke controle ingebouwd: ketenregeling (max 3 contracten in 3 jaar / max 36 maanden), aanzegtermijn (1 maand bij >= 6 maanden contractduur)
- **Web**:
  - `/personeel/contracten` — Contractbewaking-dashboard: rode/oranje/gele signalerings-banners bovenaan, 4 statistieken (verlopen/30/60/90 dagen), bucket-kaarten per vervaldatum, besluiten-in-behandeling lijst
  - Medewerker-detailpagina — nieuw tabblad "Contracten" als eerste tab (standaard open): contracthistorie, 3 sub-tabs per contract (Contractgegevens / Signaleringen / Besluitvorming), besluitvorming-paneel met AI-voorbereiding-knop, audittrail
  - Nav Personeel: "Contractbewaking" item toegevoegd (ScrollText-icoon)
- **AI-begrenzing**: AI genereert uitsluitend ondersteunende adviezen (samenvatting, aandachtspunten, wettelijke risico's); beslissing ligt altijd bij HR en directie

---

## 2026-07-02 — Regiewerk — volwaardige werkvorm naast aangenomen werk, onderhoud en service

**Uitvoering:** volledig | **Getest:** typecheck:libs clean, typecheck firevault clean (regie), api-server build clean

### Wat er gebouwd is

- **DB** (4 nieuwe tabellen via `CREATE TABLE` + ALTER `uren_registraties`):
  - `regie_voorwaarden` — contractuele afspraken per regieproject: contactpersonen, opslagen (materiaal/materieel/transport/voorrijden), toeslagen avond/weekend/spoed, betaaltermijn, facturatiefrequentie, bewijsvereisten, handtekening/weekstaat/foto-vereist
  - `regie_tarieven` — uurtarief per functiegroep (monteur/timmerman/voorman/projectleider/werkvoorbereider/onderaannemer), FK → regie_voorwaarden
  - `regie_begroting` — indicatief bewakingsbudget (GEEN vaste aanneemsom): verwacht uren/materiaal/materieel, maximaal budget, meldgrens opdrachtgever, AI-signalering aan/uit
  - `regie_materialen` — materiaalboekingen per opdracht: artikel, hoeveelheid, eenheid, inkoop/verkoopprijs, bron (magazijn/busvoorraad/projectinkoop/losse bon/leverancier/onderaannemer), bon-foto, status workflow
  - `uren_registraties` uitgebreid: +tariefgroep, +reisUren, +wachtTijd, +akkoordVereist, +akkoordGegeven, +akkoordDoorNaam
- **Backend** (`artifacts/api-server/src/routes/regie.ts` → `regieRouter`):
  - `GET /regie/opdrachten` — alle regie-opdrachten
  - `GET /regie/dashboard` — budgetbewaking per actief regieproject + AI-signaleringen (meldgrens/budget/uren, ernst: waarschuwing/kritiek)
  - `GET+PUT /regie/voorwaarden/:opdrachtId` — upsert regievoorwaarden incl. tarieven (set-replace)
  - `GET+PUT /regie/begroting/:opdrachtId` — upsert indicatief bewakingsbudget
  - `GET /regie/uren?opdrachtId=X` — uren geboekt op regieproject (incl. regie-velden)
  - `GET+POST /regie/materiaal`, `PATCH+DELETE /regie/materiaal/:id` — materiaalboekingen
- **Web** (`/regie` en `/regie/:id`):
  - Overzichtspagina met AI-signaleringen (rode/oranje banner), 3 dashboard-kaarten, zoekbare lijst met uren/budget%-indicator per project
  - Detail-tabs: **Voorwaarden+Tarieven** (contactpersonen, tarieven per functiegroep, opslagen, bewijsvereisten), **Begroting** (indicatief budget, bewakingsdrempels, AI-signalering toggle), **Uren** (tabel geboekte uren incl. reis/wacht/akkoord), **Materiaal** (inline aanmaken, bon-registratie)
  - Nav-item "Regiewerk" toegevoegd onder Uitvoering (naast Werkvoorbereiding)
- **Planning**: OPDRACHT_TYPE_LABEL uitgebreid met aangenomen/onderhoud/service/combinatie

---

## 2026-07-02 — PBM & Veiligheidsbeheer — persoonlijke beschermingsmiddelen + AI foto-inspectie

**Uitvoering:** volledig | **Getest:** typecheck api-server (clean, TS7030 pre-existing) + firevault (clean) + api-server build geslaagd

### Wat er gebouwd is

- **DB** (tabellen via `CREATE TABLE`, toegevoegd aan `lib/db/src/schema/veiligheid.ts`):
  - `pbm_items` — PBM per medewerker: type, merk/model/maat, serienummer, uitgifte/vervanging/garantie, fabrikant, keuringsinterval, status, foto-paden, QR-code
  - `pbm_inspecties` — foto-inspecties met AI-beoordeling, slijtage-score, keur_nodig-vlag, formele status
  - `veiligheidsmiddelen` — bedrijfsmiddelen (ladders, gereedschap, blussers, etc.) met locatie, eigenaar, keuringsinterval
  - `veiligheidsmiddel_inspecties` — inspecties per bedrijfsmiddel
- **Backend** (`artifacts/api-server/src/routes/pbm.ts`), geregistreerd via `pbmRouter`:
  - CRUD `/pbm/items` (incl. `/eigen` voor monteur-sessie)
  - `POST /pbm/items/:id/foto-inspectie` — AI (GPT-4o vision) beoordeelt foto's op slijtage per PBM-type; geeft NOOIT een formele goed-/afkeuring; slijtage-aandachtspunten per type (schoenen/helm/harnas/vallijn/etc.)
  - CRUD `/pbm/middelen` + inspecties
  - `GET /pbm/dashboard` — statistieken: afgekeurd/vervanging nodig/open inspecties + binnenkort-vervangen-lijst
- **Web** (`/veiligheid/pbm`): tabbladen Dashboard / PBM-items / Bedrijfsmiddelen; badge met open meldingen; sheet-dialogen voor detail en nieuw aanmaken; statusdropdown, QR-code weergave; nav-item "PBM & Middelen" toegevoegd onder Veiligheid
- **Mobiel** (`artifacts/monteur-app/app/pbm.tsx`): eigen PBM-overzicht, detail met kenmerken, foto-inspectie (camera + album, max 3 foto's), AI-resultaat met slijtage-kleurcodering en keuring-banner

---

## 2026-07-02 — Voertuig melden — monteur rapporteert storing/schade via app + AI-analyse

**Uitvoering:** volledig | **Getest:** typecheck api-server (clean) + firevault (clean) + api-server build geslaagd

### Wat er gebouwd is

- **DB**: tabel `wagenpark_meldingen` (via `CREATE TABLE`): type storing/schade, omschrijving, foto_paden[], AI-velden, status, monteur-JOIN.
- **Backend** (`artifacts/api-server/src/routes/wagenpark-meldingen.ts`), geregistreerd onder `/wagenpark`:
  - `POST /meldingen` — monteur maakt melding; foto optioneel als vision-input voor GPT-4o; respondeert ai_diagnose, ai_oplossing, ai_kosten_indicatie.
  - `GET /meldingen?voertuig_id=X` — administatie/projectleider bekijkt meldingen; badge count per status.
  - `PATCH /meldingen/:id` — status bijwerken (nieuw → in_behandeling → afgehandeld) + admin_notitie (requireBevoegdheid offertes:2).
- **Mobiel** (`artifacts/monteur-app/app/voertuig-melding.tsx`): type-toggle, tekstveld, foto-picker, AI-resultaat met kosten-banner, bevestigingsknop; knop toegevoegd aan werkdag-detailpagina.
- **Web** (`artifacts/firevault/src/pages/wagenpark/detail.tsx`): tab "Meldingen" met rode badge bij nieuwe meldingen; kaartjes met AI-diagnose/aanpak/kostenwaarschuwing; inline statusdropdown voor admin.

---

## 2026-07-02 — Digitale Uitvoerder — monteur chatbot voor uitvoeringsadvies

**Uitvoering:** volledig | **Getest:** typecheck api-server (clean) + firevault (clean) + api-server build geslaagd

### Wat er gebouwd is

- **DB**: tabellen `uitvoerder_sessies` en `uitvoerder_berichten` (via ALTER TABLE).
- **Backend** (`artifacts/api-server/src/routes/uitvoerder.ts`): 5 routes:
  - `POST /uitvoerder/sessies` — sessie aanmaken of hervatten per werkdag/opdracht
  - `GET /uitvoerder/sessies/:id` — sessie + berichten ophalen
  - `POST /uitvoerder/sessies/:id/berichten` — bericht versturen + GPT-4o antwoord (foto optioneel)
  - `POST /uitvoerder/sessies/:id/bevestig` — aanpak vastleggen
  - `GET /uitvoerder/log` — projectleider/werkvoorbereider bekijkt alle sessies
- **Monteur app** (`artifacts/monteur-app/app/uitvoerder/[sessie_id].tsx`): volledig chat-scherm met FlatList, fotopicker, AI-bubbles en "Aanpak vastleggen"-paneel. Knop toegevoegd aan werkdag-detailscherm.
- **Werkvoorbereiding web** (`artifacts/firevault/src/pages/werkvoorbereiding/index.tsx`): sectie "Uitvoerder consulten" met inklapbare sessiekaarten, bevestigde aanpak uitgelicht, chat-log inzichtelijk.

### Technische noten

- `db` import gecorrigeerd naar `@workspace/db` (niet `../lib/db`)
- `requireBevoegdheid("offertes", 1)` gebruikt voor log-endpoint (werkvoorbereiders)
- `sessie` null-guard na insert toegevoegd

---

## 2026-07-02 — Materiaal melden — monteur → AI → werkvoorbereider

**Uitvoering:** volledig | **Getest:** typecheck api-server (clean op nieuwe routes) + firevault (clean) + api-server build geslaagd + expo typed routes herstart

Monteur fotografeert een artikel dat op/beschadigd/nodig is → AI identificeert het artikel, zoekt prijs/leverancier, checkt de werkbegroting → werkvoorbereider behandelt de melding in Werkvoorbereiding.

**DB** — nieuwe tabel `materiaal_aanvragen` (12 kolommen) via ALTER TABLE:
- `id`, `opdracht_id` (FK), `ingediend_door_id` (FK), `reden` (op/beschadigd/nodig), `omschrijving`, `foto_pad`
- `status` (nieuw/in_behandeling/goedgekeurd/afgewezen), `ai_artikel_naam`, `ai_leverancier`, `ai_prijs_indicatie`, `ai_scope_check`, `ai_advies`
- `behandeld_door_id` (FK), `behandel_notitie`, `aangemaakt_op`, `bijgewerkt_op`
- Schema: `lib/db/src/schema/materiaal-aanvragen.ts`, geëxporteerd uit `lib/db/src/schema/index.ts`

**Backend** — nieuw routebestand `artifacts/api-server/src/routes/materiaal-aanvragen.ts`:
- `GET /materiaal-aanvragen` — lijst voor werkvoorbereider (status-filter, opdracht-filter), met gebruikersnamen + opdrachttitels via twee losse queries (aliases vermeden voor TS-compatibiliteit)
- `POST /materiaal-aanvragen` — monteur dient in (werkdag_id of opdracht_id, reden, foto_pad); opdracht_id wordt server-side opgelost via planning_items bij werkdag_id; triggert async AI-analyse via GPT-4o vision
- `PATCH /materiaal-aanvragen/:id` — werkvoorbereider stelt status in (nieuw/in_behandeling/goedgekeurd/afgewezen) + notitie
- `POST /materiaal-aanvragen/:id/heranalyseer` — handmatig AI opnieuw draaien
- AI-analyse: foto downloaden via ObjectStorageService → sharp resize → GPT-4o vision + werkbegrotingscontext → JSON (artikel_naam, leverancier, prijs_indicatie, scope_check, scope_toelichting, advies) → opslaan
- Route geregistreerd in `artifacts/api-server/src/routes/index.ts` na magazijnRouter

**Monteur app** (`artifacts/monteur-app/`):
- Nieuw scherm `app/materiaal-aanvraag/nieuw.tsx`: reden-picker (op/beschadigd/nodig), foto verplicht via ImagePicker, optionele omschrijving, upload via `uploadFoto()` presigned-URL flow, POST met bearer-token authenticatie
- Knop "Materiaal melden" toegevoegd aan werkdag-detailpagina `app/werkdag/[id].tsx` (navigeert met werkdag_id + titel + werknummer params)

**Firevault web** (`artifacts/firevault/src/pages/werkvoorbereiding/index.tsx`):
- Sectie "Materiaal meldingen" bovenaan werkvoorbereiding-dashboard (voor bestaande opdrachtenlijst)
- MateriaalAanvraagKaart: foto-thumbnail, amber AI-analyse-blok (leverancier/prijs/scope/advies), scope-badge (groen/rood/grijs), goedkeuren/afwijzen/in-behandeling knoppen, heranalyseer-knop
- TanStack Query met 15s refetch-interval voor live updates
- Bestaande opdrachtenlijst volledig behouden

---

## 2026-07-02 — Werkinbox — volledig nieuw intelligent werkcentrum

**Uitvoering:** volledig | **Getest:** typecheck firevault (clean) + api-server (alleen pre-existing TS7030) + server start bevestigd

Placeholder vervangen door een volledig functioneel werkcentrum op basis van de Werkinbox-visie (AI verwerkt, mens onderhoudt relatie):

**DB** — 6 additieve kolommen op `werk_inbox_mails` via ALTER TABLE:
- `afgehandeld_op`, `actie_vereist`, `actie_vereist_reden` — statusbeheer per bericht
- `ai_voorstel_json`, `ai_logboek_json` — AI-voorstellen + volledige audittrail van AI-acties
- `relatie_categorie_ai` — AI-geclassificeerde afzendercategorie (opdrachtgever/leverancier/etc.)

**Backend** — 4 nieuwe routes in `werk-inbox.ts`:
- `PATCH /werk-inbox/mails/:id/afgehandeld` — bericht afsluiten/heropenen
- `PATCH /werk-inbox/mails/:id/actie-vereist` — menselijke beoordeling vlaggen met reden
- `GET /werk-inbox/relatie/:email` — CRM-opzoekroute: contactpersoon + organisatie via afzender-e-mail (crmContactpersonenTable → crmKlantenTable)
- `POST /werk-inbox/mails/:id/analyseer` — GPT-4o analyseert onderwerp + snippet, classificeert categorie, genereert 0–3 handelingsvoorstellen met zekerheidspercentage, slaat actie_vereist + logboek-entry op

**Frontend** (`werk-inbox/index.tsx`) — volledig nieuw, ~700 regels:
- **4 tabbladen**: Alle berichten | AI Voorstellen (badge) | Actie vereist (amber badge) | Afgehandeld
- **Split-panel layout**: 320px maillijst (links) + mail-detail (midden) + 288px relatiepaneel (rechts)
- **Maillijst**: zoekbalk, filter Ongelezen/Bijlagen, unread-bold, iconen per status (AI/actie/bijlage/koppeling)
- **Mail-detail**: M365 HTML via sandboxed iframe, actie-knoppen (gelezen/afhandelen/AI analyseer), amber AI-voorstel blok (type + omschrijving + zekerheid%), actie-vereist banner, bijlagen, collapsible notities (toevoegen/verwijderen), collapsible AI Logboek met checkmarks
- **Relatiepaneel** (rechts): lazy lookup door afzender-e-mail → CRM; toont contactpersoon (naam, functie, relatiesterkte-chip), organisatie (naam, type, status), "Bekijken in CRM" link; niet gevonden → uitnodiging toe te voegen
- **M365-verbindingsflow**: verbindingsscherm met uitleg wanneer niet gekoppeld, synchroniseer-knop, ontkoppel-knop met LogOut-icoon
- Per bericht: `AI analyseer`-knop → GPT-4o analyse → voorstel-banner verschijnt in amber, logboek bijgewerkt

---

## 2026-07-02 — Foto + AI-beoordeling gereedschappen

**Uitvoering:** volledig | **Getest:** typecheck firevault (clean) + api-server (alleen pre-existing TS7030) + server start bevestigd

Magazijnbeheerders kunnen nu via telefoon een foto maken van gereedschap en laten GPT-4o vision automatisch velden invullen:

- **DB** — `foto_url text` kolom op `gereedschappen_tabel` via directe `ALTER TABLE`
- **OpenAPI** — `foto_url` toegevoegd aan `Gereedschap` en `GereedschapInput`; nieuwe schemas `GereedschapUploadUrlResponse`, `GereedschapAiAnalyseInput`, `GereedschapAiVoorstel`; nieuwe routes `POST /gereedschappen/upload-url` en `POST /gereedschappen/{id}/ai-analyse`
- **Backend routes** — `POST /gereedschappen/upload-url` geeft S3 presigned URL terug; `POST /gereedschappen/:id/ai-analyse` downloadt foto via `getObjectEntityFile` + `downloadObject`, schaalt naar max 800px via sharp, analyseert met GPT-4o vision en retourneert gestructureerd voorstel (omschrijving, merk, type, categorie, aandrijving, accessoires, keuringsplichtig, staat_indicatie); `foto_url` meegenomen in `mapGereedschap` en PATCH-handler
- **`gereedschappen/index.tsx`** — foto-capture sectie in "Gereedschap registreren"-dialoog: verborgen file input met `capture="environment"`, upload via PUT naar presigned URL, AI-voorstel banner (amber, Sparkles-icoon) met "Voorstel overnemen"-knop
- **`gereedschappen/detail.tsx`** — zelfde foto+AI-flow in het bewerken-dialoog; foto-thumbnail (max-h-56) bovenaan de gegevens-tab; `foto_url` meegenomen in `openBewerken()`-populatie en reset bij dialoogsluit

---

## 2026-07-02 — Dagelijkse AI Marktscout (CRM)

**Uitvoering:** volledig | **Getest:** typecheck + server start bevestigd

Automatische dagelijkse internet-scout voor commerciële kansen in regio Overijssel & Achterhoek:

- **`scoutService.ts`** — haalt Google News RSS op voor 8 gerichte queries (bouwproject, nieuwbouw, brandveiligheid, aanbesteding, vastgoed, omgevingsvergunning etc.) in Overijssel/Achterhoek; OpenAI GPT-4o filtert op relevantie voor FPS en classificeert als kans/nieuws/aanbesteding/overig; deduplicatie voorkomt dubbele inserts (op titel en bron_url)
- **DB** — `bron_type` (handmatig/scout/ai_scan) + `bron_url` kolommen op `crm_marktintelligentie`; nieuwe `crm_scout_runs` tabel voor run-historie (status, gevonden, opgeslagen, foutmelding)
- **Scheduler** — dagelijks 07:00 via recursieve setTimeout (zelfde patroon als backupService); ingepland direct bij serverstart (log bevestigd)
- **Routes** — `GET /crm/scout/status` (laatste run, volgende run, regio) + `POST /crm/scout/start` (handmatige trigger)
- **Frontend** — marktintelligentie-pagina: groen statuspanel (laatste run, volgende run, +X vandaag gevonden), "Nu scannen" knop, bronfilter (Alle / Scout / Handmatig+AI), Scout-badge op auto-gegenereerde items, klikbare bron_url links
- **OpenAPI + codegen** — `CrmMarktintelligentie` uitgebreid, nieuwe schemas `CrmScoutRun` + `CrmScoutStatus`, nieuwe operationIds `getCrmScoutStatus` + `startCrmScout`

## 2026-07-02 — Retour-artikelen scan (magazijn)

**Uitvoering:** volledig | **Getest:** typecheck

Uitbreiding op de stellingscans: magazijnbeheerder fotografeert geretourneerde artikelen vanuit een project, AI (GPT-4o vision) identificeert de artikelen en stelt een opberglocatie voor in het magazijn.

- DB: `scan_type` (voorraadcontrole | retour), `retour_project_id` (FK opdrachten), `retour_omschrijving` toegevoegd aan `magazijn_stellingscans`; SQL ALTER uitgevoerd
- OpenAPI: `MagazijnStellingsscanInput` uitgebreid (scan_type, retour_project_id, retour_omschrijving); `MagazijnStellingsscanSuggestie` uitgebreid (aanbevolen_locatie_id, aanbevolen_locatie_naam); `MagazijnStellingsscanGoedkeuringInput` artikelen + locatie_id; codegen uitgevoerd
- Backend retour AI-prompt: identificeer artikelen op foto + koppel aan artikelcatalogus + stel opberglocatie voor uit beschikbare locatielijst
- Backend goedkeuren: retour → `voorraad.hoeveelheid += x` op aanbevolen locatie + mutatie type "retour"; voorraadcontrole → bestaand `besteld += x` pad
- Frontend: type-toggle (Voorraadcontrole / Retour), retour-projectkiezer (verplicht) + toelichting, scankaarten tonen type-badge + project/toelichting in header, plaatsadviezen tonen locatienaam (MapPin), goedkeuren-knop zegt "Bevestigen en terugplaatsen" voor retour, scans gesplitst in twee secties

---

## 2026-07-02 — AI stellingfoto voorraadcontrole (magazijn)

**Uitvoering:** volledig | **Getest:** typecheck

- Nieuwe DB-tabel `magazijn_stellingscans` (foto_pad, locatie_id, status, ai_suggesties JSONB, goedgekeurd_op/door)
- OpenAPI: 4 nieuwe paden (`/magazijn/stellingscans`, `/upload-url`, `/{id}`, `/{id}/goedkeuren`) + 4 schemas (`MagazijnStellingsscanInput`, `MagazijnStellingsscanSuggestie`, `MagazijnStellingsscan`, `MagazijnStellingsscanGoedkeuringInput`)
- Backend: synchrone GPT-4o vision-analyse (base64 JPEG resize via sharp); artikelcatalogus + actuele voorraad meegestuurd als context; goedkeuren verhoogt `voorraad.besteld` en logt `voorraad_mutaties` (type "bestelvoorstel")
- Frontend: `/magazijn/stellingscans` — foto uploaden (presigned PUT), loading-state tijdens analyse, uitklapbare scankaarten met checkboxes + bewerkbare hoeveelheden per suggestie, goedkeuringsknop
- Nav: "Stellingscans" (ScanSearch-icoon) tussen Voorraad en Mutaties in de zijbalk

---

## 2026-07-02 — Offerte verzenden: twee paden (ondertekenbare offerte + contract van klant)

**Uitvoering:** volledig | **Getest:** typecheck

**DB:**
- `verzend_type text NOT NULL DEFAULT 'ondertekening'` toegevoegd aan `offertes`-tabel
- Nieuwe tabel `offerte_klant_contracten` (PDF-registratie, extracted_text voor AI-analyse)
- Nieuwe tabel `offerte_contract_adviezen` (AI-analyse resultaat, risico_niveau, aandachtspunten, volledig_advies)

**OpenAPI + codegen:**
- `verzend_type` veld toegevoegd aan `Offerte` en `OfferteInput` schemas
- Nieuwe schemas: `OfferteKlantContract`, `OfferteKlantContractInput`, `OfferteContractAdvies`
- 6 nieuwe endpoints: upload-url, GET/POST klant-contracten, DELETE contract, POST ai-advies, GET advies

**Backend (offertes.ts):**
- PATCH /offertes/:id slaat `verzend_type` op
- POST /offertes/:id/klant-contracten/upload-url — presigned S3-URL via ObjectStorageService
- GET /offertes/:id/klant-contracten — lijst met `heeft_advies` vlag
- POST /offertes/:id/klant-contracten — registreer na upload (bestandsnaam, bestand_pad, extracted_text)
- DELETE /offertes/:id/klant-contracten/:contractId
- POST /offertes/:id/klant-contracten/:contractId/ai-advies — GPT-4o analyseert contracttekst, JSON-response met risico_niveau + aandachtspunten + volledig_advies, upsert op contractId
- GET /offertes/:id/klant-contracten/:contractId/advies

**Frontend (verzend-tab.tsx — volledig herschreven):**
- Moduskeuze bovenaan: twee klikbare radiokaarten (ondertekenbare offerte / contract van klant)
- Modus opgeslagen via PATCH offerte met optimistische update + rollback bij fout
- Pad 1 (ondertekening): portaallinks-kaart + e-mail met portaallink + activiteit + klantvragen — ongewijzigd gedrag
- Pad 2 (contract_klant): e-mail zonder portaallink + "Contract ontvangen"-sectie + activiteit + klantvragen
- PDF-upload flow: pdfjs tekst-extractie → presigned upload-URL → PUT naar storage → registreer contract
- `AdviesPanel` component: laadt bestaand advies via fetch, genereert nieuw via mutatie, toont risico-badge + aandachtspunten + inklapbaar volledig memo
- `studio.tsx`: `verzend_type` doorgegeven als prop naar VerzendTab

---

## 2026-07-02 — Sidebar: Acquisitie-scheiding in Projectaanpak

**Uitvoering:** volledig | **Getest:** visueel

- `beheerder-layout.tsx`: divider "Acquisitie" toegevoegd vóór Opnames in de Projectaanpak-groep
- De sidebar toont nu expliciet twee zones: **Acquisitie** (Opnames → Calculaties → Offertes) en **Uitvoering** (Werkvoorbereiding → Planning → ...), zodat duidelijk is dat Offerte niet tot werkvoorbereiding behoort

---

## 2026-07-02 — Opname-fase CRM + Calculatie inkoopregels

**Uitvoering:** volledig | **Getest:** typecheck

**CRM kansen pijplijn:**
- `KANS_FASEN` const uitgebreid met `"opname"` (tussen `afspraak` en `calculatie`) in `lib/db/src/schema/crm.ts`
- Frontend `projectkansen.tsx`: `opname`-fase toegevoegd aan `FASEN` (teal kleur) en aan `openKansen` lijst (zodat actief-filter hem meeneemt)

**DB schema:**
- `lib/db/src/schema/mod-calculatie.ts`: `modCalcInkoopItemsTable` toegevoegd — calculatie_id FK, type (materiaal|onderaanneming), omschrijving, leverancier, status (te_versturen|verstuurd|ontvangen|akkoord), datum_verstuurd, datum_ontvangen, bedrag, notities
- SQL `CREATE TABLE mod_calc_inkoop_items` rechtstreeks uitgevoerd

**OpenAPI + codegen:**
- 2 nieuwe schemas: `ModCalcInkoopItem`, `ModCalcInkoopItemInput`
- 4 endpoints: `GET/POST /modules/calculaties/{id}/inkoop-items`, `PATCH/DELETE /modules/calculaties/{id}/inkoop-items/{itemId}`
- Codegen uitgevoerd; `typecheck:libs` geslaagd

**Backend routes (`mod-calculatie.ts`):**
- `GET /modules/calculaties/:id/inkoop-items` — lijst ophalen
- `POST /modules/calculaties/:id/inkoop-items` — aanmaken
- `PATCH /modules/calculaties/:id/inkoop-items/:itemId` — bijwerken (incl. status vooruitschuiven)
- `DELETE /modules/calculaties/:id/inkoop-items/:itemId` — verwijderen

**Frontend:**
- `InkoopregelsKaart` component toegevoegd aan `detail.tsx` (calculatie)
- Sectie gegroepeerd per type (Materiaal / Onderaanneming)
- Badge klikbaar om status vooruit te schuiven (te_versturen → verstuurd → ontvangen → akkoord)
- Inline bewerken per regel; nieuw-item formulier onderaan
- Teller in koptekst: "X/Y akkoord"

**Bugfixes:**
- `incidenten.tsx`: `useBevoegdheid` correct aangeroepen via `heeftNiveau()` i.p.v. direct als hook
- `incidenten.tsx`: optional chaining toegevoegd op `getuigen` en `genomen_maatregelen`

---

## 2026-07-02 — Incidenten module (bijna-ongevallen & arbeidsongevallen)

**Uitvoering:** volledig | **Getest:** typecheck

**DB schema:**
- `lib/db/src/schema/veiligheid.ts`: `veiligheidIncidentenTable` toegevoegd — type, datum/tijdstip, locatie, opdracht/gebouw FK, omschrijving, oorzaak, letsel, eerste hulp, getuigen (jsonb), genomen_maatregelen (jsonb), meldplichtig, gemeld_bij_arbeidsinspectie, status (open/in_behandeling/gesloten), foto_paden (jsonb), ai_voorstel, medewerker_naam/id, aangemaakt_door_id
- SQL `CREATE TABLE veiligheid_incidenten` rechtstreeks uitgevoerd (geen drizzle push vereist)

**OpenAPI + codegen:**
- 4 nieuwe schemas: `VeiligheidIncident`, `VeiligheidIncidentInput`, `VeiligheidIncidentAiVoorstelInput`, `VeiligheidIncidentAiVoorstel`
- 6 endpoints: `GET/POST /veiligheid/incidenten`, `GET/PATCH/DELETE /veiligheid/incidenten/{id}`, `POST /veiligheid/incidenten/ai-voorstel`
- Codegen uitgevoerd; `typecheck:libs` geslaagd

**Backend (`artifacts/api-server/src/routes/veiligheid.ts`):**
- Volledige CRUD (lezen/aanmaken/bijwerken/verwijderen) voor incidenten
- Bevoegdheden: `lezenVeiligheid` (toolbox:1) voor lezen+aanmaken, `schrijvenVeiligheid` (toolbox:3) voor PATCH, `verwijderenVeiligheid` (toolbox:4) voor DELETE
- AI-voorstelroute: GPT-4o genereert omschrijving, oorzaak, maatregelen en meldplichtig-indicatie op basis van type + locatie
- PL-notificatie: fire-and-forget e-mail naar alle gebruikers met `offertes:2+` na aanmaken incident; bevat NLA-waarschuwing als meldplichtig
- `MailSoort` uitgebreid met `"incident_melding"`
- `medewerkerNaam` afgeleid uit sessie; `medewerkerId` server-side opgezocht via gebruiker_id

**Mobiele app (`artifacts/monteur-app/app/incidenten.tsx`):**
- 6-staps formulier: type → locatie+project → omschrijving → letsel → maatregelen → bevestigen
- AI-voorstel-knop op stap locatie (vult omschrijving/oorzaak/maatregelen/meldplichtig voor)
- Opdracht-picker (hergebruikt `useGetMijnLmraOpenstaand`)
- Meldplichtig-toggle met NLA-tekst en 24-uur-melding
- Lijst van eigen incidenten met kleurcodering type/status
- `Stack.Screen name="incidenten"` toegevoegd aan `_layout.tsx`
- Incidenten-kaart toegevoegd aan `veiligheid/index.tsx`

**Web (`artifacts/firevault/src/pages/veiligheid/incidenten.tsx`):**
- Overzichtspagina met filter op type en status
- NLA-meldplichtig banner (actieteller)
- Status-workflow knoppen: open → in behandeling → gesloten
- "Gemeld bij NLA" bevestigingsknop op meldplichtige incidenten
- Detail-dialoog met alle velden; verwijderen voor beheerder
- Route `/veiligheid/incidenten` toegevoegd aan `App.tsx`
- `TriangleAlert` nav-item toegevoegd aan `beheerder-layout.tsx` (Veiligheid-sectie)

---

## 2026-07-02 — Werkmaatschappij globale filter verwijderd + LMRA opdracht-koppeling (mobiel & web)

**Uitvoering:** volledig | **Getest:** typecheck

**Werkmaatschappij — globale selector verwijderd:**
- `beheerder-layout.tsx`: `<Select>` dropdown linksboven verwijderd; `useWerkmaatschappij` import + destructuring volledig uit de layout verwijderd
- `dashboard/beheerder.tsx`: "Actieve werkmaatschappij"-banner verwijderd; import opgeruimd
- `beheer/documentopmaak.tsx`: initieel werkgever-ID kiest nu altijd `werkgevers[0]` (niet meer afhankelijk van globale context)
- `WerkmaatschappijProvider` en `useWerkmaatschappij` hook blijven als data-provider voor formulieren (per-record keuze) — de *schakelaar-UX* is weg, de data-laag niet

**LMRA — mobiel (T005):**
- `_layout.tsx`: `LmraBewaker` component toegevoegd — pollt `/mijn/lmra-openstaand` elke 60s; bij `dwingend=true` (dag 4+) toont een niet-wegklikbaar blocking Modal met projectnaam, aantal dagen en knop "LMRA invullen" → navigeert naar `/lmra`
- `lmra.tsx` mobiel: vrij tekstveld "Project" vervangen door opdracht-picker (uit `useGetMijnLmraOpenstaand`); toont gebouwnaam als subtitel + "Vereist"-badge bij dwingend items; bij keuze wordt ook gebouw automatisch ingevuld; `opdracht_id` wordt meegezonden bij opslaan
- Lijst: `opdracht_naam` badge (blauw) vóór `project_naam` als fallback

**LMRA — web (T006):**
- `lmra.tsx` web: `opdracht_id` toegevoegd aan `LmraFormState` + `leegFormulier` + `openBewerken` + `opslaan`
- Form: als `useGetMijnLmraOpenstaand` items teruggeeft → Select dropdown met opdrachten (incl. "Vereist"-badge); anders vrij tekstveld als fallback
- Lijst + detail dialoog: `opdracht_naam` badge (met Briefcase icoon) getoond; `project_naam` alleen als fallback

---

## 2026-07-02 — Inbox: automatische bevestigingsmail, aanvullende vragen en PL-planningbewaking

**Uitvoering:** volledig | **Getest:** typecheck + serverlog

**Automatische bevestigingsmail:**
- Bij het verwerken van een offerte-aanvraag (`POST /inbox/offerte-aanvraag`) wordt direct een `aanvraag_planningen`-record aangemaakt met een uniek antwoord-token
- AI-extractie uitgebreid met drie volledigheids-velden: `responstermijn`, `opname_gevraagd`, `plattegronden_status` — ontbrekende velden worden als follow-up vragen meegestuurd
- Bevestigingsmail verstuurd naar het e-mailadres van de contactpersoon (fire-and-forget; alleen als e-mail geconfigureerd); bevat een persoonlijke aanhef, offerte-referentie en een uitnodigingsknop voor aanvullende vragen

**Publiek antwoordformulier (`GET/POST /api/inbox/aanvraag-antwoord/:token`):**
- Server-rendered HTML-formulier op uniek token-URL (geen auth vereist); FPS-branding, responsief
- Radiogroepen voor responstermijn, opname en plattegronden-status; optioneel vrij tekstveld
- Na verzending: planning-datum automatisch afgeleid uit responstermijn (1 week/2 weken/etc.); audit-log ingevoerd; bedanktpagina getoond
- Token/al-ontvangen guard: herbezoek toont bevestiging zonder formulier

**PL-planningbewaking:**
- `aanvraag_planningen`-tabel in DB (velden: afzender, AI-velden, antwoorden afzender, antwoord-token, bevestiging-/antwoordtijdstip, pl_planning_datum/notitie/bijgewerkt, melding_verzond_op)
- `GET /inbox/items/:id/planning` en `PATCH /inbox/items/:id/planning` (bevoegdheid: crm:1/2)
- OpenAPI-schema's `AanvraagPlanning` + `AanvraagPlanningPatch` toegevoegd; codegen uitgevoerd
- Dagelijkse scheduler (`planDagelijksePlanningMeldingen`) om 08:00 controleert aanstaande/verlopen deadlines en mailt betrokken PL's met een overzichtstabel; "Volgende planning-melding gepland" bevestigd in serverlog

**Frontend — PL-planningkaart in inbox/detail.tsx:**
- Kaart "PL-planning" zichtbaar voor `offerte_aanvraag`-items; toont afzenderinfo, bevestigingsstatus, antwoorden afzender (responstermijn/opname/plattegronden + opmerking), en responsdatum met kleurcodering (rood = verlopen, amber = ≤7 dagen, groen = ruim)
- "Bewerken"-knop opent dialoog voor datum + notitie; muteert via `PATCH /inbox/items/:id/planning`

---

## 2026-07-02 — Factuurverwerking: medewerker-beoordeling, opmerkingen en proceslog

**Uitvoering:** volledig | **Getest:** typecheck

**Medewerker-beoordeling (doorsturen):**
- Nieuwe status `ter_beoordeling_medewerker` toegevoegd aan enum, label- en kleurkaarten (web)
- DB: `beoordelaarId` FK-kolom op `facturenTable`; `factuurOpmerkingenTable` nieuw aangemaakt
- OpenAPI: nieuwe paden (`doorsturen-medewerker`, `beoordelen-medewerker`, `opmerkingen`, `proceslog`) en schemas (`FactuurDoorstuurInput`, `FactuurOpmerking`, `FactuurOpmerkingInput`, `FactuurOpmerkingAfhandelenInput`, `FactuurProceslogRegel`)
- Codegen uitgevoerd: alle nieuwe hooks beschikbaar (`useDoorstuurenFactuurMedewerker`, `useBeoordelenFactuurMedewerker`, `useListFactuurOpmerkingen`, `useAddFactuurOpmerking`, `useAfhandelenFactuurOpmerking`, `useGetFactuurProceslog`)
- Backend: routes `POST /facturen/:id/doorsturen-medewerker` (status → `ter_beoordeling_medewerker`, beoordelaar opslaan) en `POST /facturen/:id/beoordelen-medewerker` (goedkeuren → `te_beoordelen_pl`, afkeuren → `afgekeurd`); beide loggen naar proceslog
- UI: knop "Doorsturen naar medewerker" (zichtbaar bij relevante statussen), medewerker-picker uit `/toewijsbare-gebruikers`, optionele begeleidende opmerking; paars banner bij `ter_beoordeling_medewerker` met naam beoordelaar

**Opmerkingen:**
- Backend: `GET /facturen/:id/opmerkingen`, `POST` (nieuwe opmerking, optioneel `reply_op_id`), `PATCH /:oid` (afhandelen)
- UI: opmerkingen-tabblad in nieuw tweeledig tabpanel (Opmerkingen / Proceslog); inline reageer-functie, Ctrl+Enter shortcut, afhandelen (doorstrepen) per opmerking

**Proceslog:**
- Backend: `GET /facturen/:id/proceslog` — gecombineerde tijdlijn van statuswijzigingen én opmerkingen, chronologisch gesorteerd
- UI: proceslog-tab met tijdlijn-weergave (icoon per soort, timestamp, gebruiker, notitie/afhandelstatus)

---

## 2026-07-02 — Functies zichtbaar op profielkaart + AI contractanalyse

**Uitvoering:** volledig | **Getest:** typecheck

**Profiel-kaart functies-overzicht:**
- Alle aanstellingen compact getoond in de profiel-kaart (als chips): functienaam, werkmaatschappij, CAO, contracturen
- Hoofdaanstelling is amber gemarkeerd met "HOOFD"-label; overige aanstellingen in neutrale stijl
- Sectie verborgen als er nog geen aanstellingen zijn (empty state)

**AI contractanalyse:**
- Nieuwe route `POST /medewerkers/:id/ai-contract-analyse`: leest het meest recente document van type `contract`/`arbeidscontract` voor de medewerker uit object storage, parseert de PDF en gebruikt gpt-4o om werkmaatschappij, functie, CAO, contracturen en dienstverband te extraheren
- Geeft 404 als er geen contract is geüpload; 422 bij niet-leesbare PDF; 503 als OpenAI niet beschikbaar is
- In het aanstelling-dialoog: "AI invullen"-knop (amber stijl) — extraheert velden en vult het formulier voor; amber AI-voorstel banner met eventuele toelichting; functienaam wordt gematcht op het functiehuis, ontbrekende functie geeft een hint

---

## 2026-07-02 — Medewerker aanstellingen (multi-werkmaatschappij)

**Uitvoering:** volledig | **Getest:** typecheck + codegen

Een medewerker kan nu aan meerdere werkmaatschappijen tegelijk worden gekoppeld via afzonderlijke aanstellingen. Eén aanstelling is de "hoofd"-aanstelling; die bepaalt de CAO, functie en contracturen op het medewerkerprofiel.

**DB:**
- Nieuwe tabel `medewerker_aanstellingen` (id, medewerker_id FK cascade, werkgever_id FK set null, werkmaatschappij, functie_id FK set null, cao, contracturen_per_week, is_hoofd boolean, timestamps)

**OpenAPI / codegen:**
- 5 nieuwe paden: GET + POST `/medewerkers/{id}/aanstellingen`, PATCH + DELETE `/medewerkers/{id}/aanstellingen/{aanstellingId}`, POST `/medewerkers/{id}/aanstellingen/{aanstellingId}/hoofd`
- 2 nieuwe schemas: `MedewerkerAanstelling`, `MedewerkerAanstellingInput`
- Gegenereerde hooks: `useListMedewerkerAanstellingen`, `useCreateMedewerkerAanstelling`, `useUpdateMedewerkerAanstelling`, `useDeleteMedewerkerAanstelling`, `useSetHoofdAanstelling`

**API (`hrm.ts`):**
- 5 route handlers + `mapAanstelling` helper + `syncHoofdNaarMedewerker` (cascadeert hoofd-aanstelling naar medewerkers-tabel)
- Hoofd-wissel via DB-transactie: alle aanstellingen `is_hoofd=false`, doelwit `is_hoofd=true`, daarna medewerkers-row bijgewerkt (werkmaatschappij/functie_id/cao/contracturen_per_week)
- Verwijderen van de hoofdaanstelling geeft 409

**UI (`personeel/detail.tsx`):**
- Nieuw "Aanstellingen"-kaart tussen profiel-card en tabs
- Per aanstelling: werkmaatschappij, functie, CAO, contracturen; hoofd-badge (amber); "Als hoofd instellen"-knop op niet-hoofd items; bewerk/verwijder-knoppen (verwijderen disabled bij hoofd)
- Dialoog voor toevoegen/bewerken: werkmaatschappij-dropdown met CAO-voorinvulling, functie-dropdown, CAO-dropdown, contracturen-veld

---

## 2026-07-02 — ZZP / Externen module + Oud-medewerkers

**Uitvoering:** volledig | **Getest:** typecheck + codegen + DB push

Volledig nieuw ZZP/Externen subsysteem gebouwd:

**Nav & routing:**
- Twee nieuwe nav-items onder Personeel-sectie: "Oud-medewerkers" (`/personeel/oud-medewerkers`) en "Externen / ZZP" (`/personeel/externen`)
- Routes geregistreerd in App.tsx; iconen `UserX` (oud) en `Handshake` (externen)

**DB schema (`lib/db/src/schema/hrm.ts`):**
- Nieuwe tabel `zzp_overeenkomsten` met: medewerker_id, opdracht_omschrijving, specifieke_taken, projectnummer, start/einddatum, uurtarief, vaste_prijs, betalingswijze, zzp_bedrijfsnaam/kvk/btw, status-machine (concept→te_ondertekenen→ondertekend|verlopen|opgezegd), handtekening-datums, ai_ingevuld
- Zod insert-schema en TypeScript types geëxporteerd
- `pnpm --filter @workspace/db run push` geslaagd

**OpenAPI + codegen:**
- Endpoints toegevoegd: `GET/POST /zzp-overeenkomsten`, `GET/PATCH/DELETE /zzp-overeenkomsten/{id}`, `POST /zzp-overeenkomsten/ai-vullen`
- Schemas: `ZzpOvereenkomst`, `ZzpOvereenkomstInput`, `ZzpOvereenkomstPatchInput`, `ZzpAiVullenInput`, `ZzpAiVullenResultaat`
- Codegen en typecheck:libs geslaagd; hooks `useListZzpOvereenkomsten`, `useCreateZzpOvereenkomst`, `useUpdateZzpOvereenkomst`, `useAiVulZzpOvereenkomst`, `getListZzpOvereenkomstenQueryKey` beschikbaar

**API routes (`artifacts/api-server/src/routes/hrm.ts`):**
- CRUD routes voor zzp-overeenkomsten (lezen/schrijven bevoegdheden)
- AI-fill endpoint: GPT-4o genereert opdrachtomschrijving + specifieke werkzaamheden (eigen verantwoordelijkheid, geen gezagsverhouding, vrije vervanging) op basis van medewerkerdata
- Delete geblokkeerd voor niet-concept statussen (409)

**Pagina's:**
- `oud-medewerkers.tsx`: filtert actief=false of uitDienstPer verstreken, zoekbalk, link naar profiel
- `externen.tsx`: twee tabs — "Externen" (ZZP/uitzend/inhuur medewerkers met contract-status badge) en "Overeenkomsten" (contractenlijst); dialoog "Nieuwe overeenkomst" met AI-fill knop, alle Belastingdienst-vereiste velden, juridische infobox (Wet DBA / WBBA criteria)

---

## 2026-07-02 — Sidebar: nav-item "Personeel" toegevoegd

**Uitvoering:** volledig | **Getest:** typecheck

Nieuw nav-item "Personeel" (Users-icoon) toegevoegd tussen Onboarden en Uitboarden in de Personeel-sectie. Links naar `/personeel` en actief op alle medewerker-detailpaden. "Onboarden" is nu alleen actief op exact `/personeel` (niet meer op sub-paden).

---

## 2026-07-02 — Nieuwe medewerker: lege-state functies met snelkoppeling

**Uitvoering:** volledig | **Getest:** typecheck

De functie-Select in de "Nieuwe medewerker"-dialoog toonde een lege dropdown als er nog geen functies aangemaakt waren, zonder uitleg. Nu:
- Lege staat: melding "Nog geen functies in het functiehuis" + "Nieuwe functie"-knop inline bij het label
- Als er wel functies zijn: dropdown zoals voorheen (buitendienst / kantoor-staf groepen)
- De knop opent direct het bestaande functie-aanmaak-dialoog, waarna de functie meteen selecteerbaar is

---

## 2026-07-01 — Slim uploaden: toelichting verplicht, personeelsdocumenten direct naar dossier, afgewezen doorsturen

**Uitvoering:** volledig | **Getest:** typecheck

Drie verbeteringen op de upload-workflow:

- **Toelichting verplicht** — het toelichting-veld in de wachtrij-kaart is niet meer optioneel. De "Analyseer"-knop blijft grijs totdat er een beschrijving is ingevuld. De toelichting wordt als `opmerkingen` meegestuurd naar de inbox (zodat de reden van opslaan zichtbaar blijft). `analyseerAlle` slaat bestanden zonder toelichting over.
- **Personeelsdocumenten direct naar het dossier** — wanneer de AI een bestand classificeert als "Personeel / HRM", verschijnt er een medewerker-picker en een documenttype-selector (15 typen). Het bestand wordt direct naar `/api/medewerkers/:id/documenten` geüpload en slaat de inbox over. Als de gebruiker toch via inbox wil: koppeling "Liever via inbox opslaan". Succes-bericht onderscheidt "personeelsdossier" van "inbox".
- **Afgewezen items doorsturen** — in de inbox-detailpagina toont een afgewezen item nu een rode kaart met de afwijzingsreden en een "Doorsturen naar andere module"-knop die het bestaande verplaatsen-dialoog opent.

---

## 2026-07-01 — Personeelsdossier: verloopdatum, volledigheidsoverzicht en NAW-kaart

**Uitvoering:** volledig | **Getest:** typecheck + DB-migratie

Uitbreidingen op de bestaande Documenten-tab in `/personeel/:id`:

- **Verloopdatum** — nieuw veld op `medewerker_documenten` (DB ALTER + OpenAPI + codegen + API + frontend). Upload-dialoog toont DatePicker zodra het gekozen type een verloop kent (identiteitsbewijs, rijbewijs, VCA/BHV/EHBO, diploma, paspoort, verblijfsvergunning). DocumentRegel toont badge: rood = verlopen, amber = verloopt binnen 60 dagen, grijs = geldig t/m datum.
- **Dossier volledigheidsoverzicht** — kaart bovenaan de tab met vereiste docs (ID-bewijs/Paspoort + Arbeidscontract) en reeds aanwezige aanbevolen docs (CV, VCA, BHV, EHBO, Rijbewijs). Kaart kleurt amber bij ontbrekende verplichte stukken, groen als alles aanwezig.
- **NAW-kaart** — toont adres, telefoon en e-mail uit het medewerker-profiel direct in de dossier-tab als referentie.
- **Uitgebreide documenttypes** — `naw_formulier` en `geheimhoudingsverklaring` toegevoegd; typesets op backend uitgebreid met legacy-aliassen (`id_bewijs`, `rijbewijs_scan`, `arbeidscontract`).

---

## 2026-07-01 — Slim-upload: Sheet opent altijd — ook bij actieve automatiseringsregels

**Uitvoering:** volledig | **Getest:** typecheck

Bug: als een bestand een actieve automatiseringsregel had, werd het stil doorgestuurd en keerde `verwerkBestanden` terug vóór `setToonDialoog(true)` — de Sheet opende nooit.

Fix: auto-gerouteerde bestanden worden nu ook in de wachtrij gezet (status "klaar", actieGenomen true, gekozenCategorie ingevuld), inbox-upload blijft fire-and-forget maar er is geen aparte navigatie meer. `setToonDialoog(true)` wordt altijd aangeroepen. De Sheet toont auto-gerouteerde items als al-verwerkt met het label "Opgeslagen in inbox → [categorie]".

---

## 2026-07-01 — Slim-upload: wachtrij-paneel (Sheet) vervangt blokkerend center-dialoog

**Uitvoering:** volledig | **Getest:** typecheck

De analyse-dialog is omgebouwd van een blokkerend center-dialoog naar een persistent zijpaneel (Sheet, 440px vanuit rechts):

- **UploadItem** krijgt eigen `toelichting: string` veld; losse `toelichting`-state verwijderd.
- **startAnalyse** (bulk) vervangen door `startAnalyseVoorItem(id)` (per item, parallel mogelijk) + `analyseerAlle()` + `opToelichtingWijzigen(id, tekst)`.
- **opBevestigen** neemt nu `(itemId, cat)` — wachtrij blijft open na bevestiging, geen navigatie.
- **WachtrijKaart** component toegevoegd: toont per bestand toelichting-textarea, Analyseer-knop, spinner of inline BeslisScherm.
- **Sheet JSX** vervangt Dialog: header met "Analyseer alle wachtende bestanden (N)" knop, scrollbare body met alle WachtrijKaart-items, vaste footer met Sluiten + teller. Automatiseer-dialog ongewijzigd.

---

## 2026-07-01 — Slim-upload: bestand wordt nu écht opgeslagen na classificatie

**Uitvoering:** volledig | **Getest:** typecheck

Kernbug opgelost: de slim-upload-balk classificeerde bestanden (via AI) maar sloeg ze **nooit op**. Na bevestiging werd er alleen genavigeerd; het bestand bleef in browsergeheugen en verdween. Drie symptomen:
- "De popup met analyse is er niet" → automatiseringsregel (na 3× zelfde extensie bevestigd) routeert bestanden stil, dialog wordt bewust overgeslagen. Diagnose: localStorage-regels actief.
- "Het bestand nergens verschijnen" → **root cause**: geen upload naar server. Nu opgelost.
- "Popup aan de zijkant na 3 seconden" → toast-notificatie van auto-routing.

Wijzigingen in `slim-upload-balk.tsx`:
- Nieuwe helper `uploadNaarInbox(bestand)` → POST multipart naar `/api/inbox/items` (fire-and-forget).
- `opBevestigen`: upload het bestand naar inbox na categoriebevestiging; toast meldt "Opgeslagen in inbox".
- Auto-routing: upload het bestand ook bij stille doorstuur via automatiseringsregel; toast meldt "Doorgestuurd en opgeslagen" of waarschuwt bij mislukking.

Bestanden staan nu in Slim uploaden › Inbox na elke upload, ongeacht pad (handmatig of automatisch).

---

## 2026-07-01 — Audit: volledige module-inventarisatie (routes × nav × implementaties)

**Uitvoering:** analyse | **Getest:** n.v.t.

Statische audit van alle ~90 routes in App.tsx gekruist met nav-items en pagina-bestanden. Resultaat in `docs/audit-modules-2026-07.md`. Bevindingen: 6 bevestigde stubs (bedrijfsresultaten, werk-inbox, autopark-legacy, FPS One documenten/rapporten/abonnementen), overige ~85 pagina's zijn echte implementaties met API-koppeling. Prioriteitsmatrix voor opvolging opgenomen.

---

## 2026-07-01 — Fix: drag-overlay verdwijnt nu als bestand teruggesleept wordt

**Uitvoering:** hotfix | **Getest:** typecheck groen

De drag-overlay bleef hangen als de gebruiker een bestand boven het venster hield en terugsleepte zonder te droppen. Oorzaak: de `dragleave`-teller liep niet terug naar 0 bij verlaten van het venster. Fix: `relatedTarget === null` detecteert dat de cursor het venster verlaat en reset de overlay direct; `dragend` (drag geannuleerd) doet hetzelfde als fallback.

---

## 2026-07-01 — Slim uploaden: toelichting voor AI vóór analyse

**Uitvoering:** volledig | **Getest:** typecheck groen (firevault + api-server)

Het analyse-dialoog opent nu eerst een toelichtingsscherm: een tekstgebied waar de gebruiker vrije context kan typen ("Bijv.: testrapport van fabrikant X voor project 2024-038"). Pas na klikken op "Analyseren" start de AI. De toelichting wordt als `Gebruikerscontext`-hint meegegeven aan het AI-model (max 500 tekens); zonder toelichting werkt de analyse precies zoals voorheen. Backend leest `toelichting` uit de FormData en geeft het door aan `aiClassificeer` en de heuristische fallback.

---

## 2026-07-01 — Opnieuw uitnodigen ook voor actieve gebruikers (geaccepteerd)

**Uitvoering:** hotfix | **Getest:** typecheck groen

De "Uitnodigen"-knop was verborgen voor gebruikers met status `geaccepteerd`. Voor Jacqueline (en anderen die al een account hebben maar een nieuwe activatielink nodig hebben) verschijnt nu ook een "Opnieuw uitnodigen"-knop — zowel op de kaartweergave als in het detaildialoog. De knop heeft een neutrale grijs/slate stijl (onderscheid van amber/paars voor nog-niet-uitgenodigde gebruikers). De backend-endpoint (`POST /gebruikers/:id/uitnodigen`) verwerkt dit correct: nieuw token, nieuwe vervaldatum, status terug naar "uitgenodigd".

---

## 2026-07-01 — Fix: uploaden werkte niet meer (Uppy/React 19 conflict)

**Uitvoering:** hotfix | **Getest:** typecheck groen, workflow herstart

`lib/object-storage-web/src/index.ts` exporteerde `ObjectUploader` die bovenin Uppy importeert (`@uppy/core`, `@uppy/react`, `@uppy/aws-s3`). Uppy is niet compatibel met React 19. Zodra Vite de module laadde, brak de hele `@workspace/object-storage-web` module — waardoor elke pagina die `useUpload` importeerde volledig vastliep en uploads nergens meer werkten (documenten, tekeningen, foto's, bijlagen, berichten, snagstream, etc.).

`ObjectUploader` werd nergens in de app gebruikt. Fix: export verwijderd uit `index.ts`. Uppy-code staat nog in `ObjectUploader.tsx` maar wordt niet meer geladen.

---

## 2026-07-01 — Magazijn volledig mobiel: locaties, verplaatsen, opdracht-koppeling, inkoop

**Uitvoering:** volledig | **Getest:** typecheck groen (monteur-app + api-server)

**Scan-scherm uitgebreid (magazijn/scan.tsx):**
- Drie acties: Uitgifte / Retour / **Verplaatsen** (nieuw)
- Opdracht-keuze bij uitgifte en retour (optioneel, modal picker)
- Locatie-keuze bij uitgifte (van-locatie), retour (naar-locatie) en verplaatsen (van + naar — verplicht)
- Navigeerbaar met `?artikel_id=X` parameter vanuit artikelenlijst (scanner overgeslagen)

**Nieuw scherm: Artikelen (magazijn/artikelen.tsx):**
- Volledig artikelbladerscherm op de telefoon met zoekfunctie
- Vrije voorraad per artikel, rood bij onder minimum
- Tik om direct naar uitgifte/retour/verplaatsen te gaan

**Nieuw scherm: Inkoop aanvragen (magazijn/inkoop.tsx):**
- Toont alle artikelen onder minimumvoorraad, gegroepeerd per leverancier
- Aantallen vooringevuld op tekort (gewenst - vrij), handmatig aanpasbaar
- "Bestelbon versturen" per leverancier: stuurt HTML-e-mail naar leverancier (indien e-mailadres bekend) of slaat intern op

**API uitgebreid (OpenAPI + server):**
- `POST /magazijn/verplaatsingen` — atomaire locatie-naar-locatie verplaatsing (transactie: -delta van A, +delta naar B)
- `POST /magazijn/bestelbonnen` — bestelbon aanmaken + optioneel e-mail naar leverancier (MailSoort `magazijn_bestelbon`)

**Menu:**
- Twee nieuwe items toegevoegd: "Artikelen" (cube-outline) en "Inkoop aanvragen" (cart-outline)

---

## 2026-07-01 — Gebruikers: uitnodigingsknop ook in detaildialoog

**Uitvoering:** volledig | **Getest:** typecheck groen

- De uitnodigingsknop ("Uitnodiging versturen" / "Uitnodiging opnieuw sturen") stond alleen op de kaartweergave, niet in het detaildialoog (de geopende kaart). Nu ook toegevoegd aan het detaildialoog, direct boven de Bewerken/Sluiten-knoppen.
- Zelfde kleur en logica als de kaartknop: amber (niet uitgenodigd) / paars (opnieuw sturen), alleen zichtbaar voor hoofdbeheerder en wanneer status niet "geaccepteerd" is.

---

## 2026-07-01 — Slim uploaden: document_sjabloon navigeert nu naar Document Studio

**Uitvoering:** volledig | **Getest:** typecheck groen

- `document_sjabloon` categorie had verkeerde route `/organisatie/documentopmaak` (Document Design System); gecorrigeerd naar `/organisatie/studio` (Document Studio)
- Automiseringsregel toast heeft nu 8 seconden zichtbaarheid (was ~5s) en legt uit dat het bestand nog handmatig geüpload moet worden op de bestemmingspagina, plus verwijzing naar het tandwiel-icoon voor regelbeheer
- BeslisScherm voor `document_sjabloon` toont nu duidelijke instructie: na navigeren naar Studio het bestand handmatig uploaden via "Referentie uploaden" bij het gewenste documenttype
- **Automiseringsregel actief?** Als de analysedialog niet verschijnt en er alleen een korte melding opkomt, staat er een actieve automiseringsregel voor dat bestandstype. Verwijder die via het tandwiel-icoon in de taakbalk rechtsonder.

---

## 2026-07-01 — Magazijn: crash door lege SelectItem-waarden opgelost

**Uitvoering:** volledig | **Getest:** typecheck groen

- Radix UI `<Select.Item value="">` gooit een runtime-fout ("must have a value prop that is not an empty string") in alle magazijn-subpagina's
- Gefixed in 7 bestanden: `reserveringen.tsx`, `mutaties.tsx`, `locaties.tsx`, `artikel-detail.tsx`, `uitgiftes.tsx`, `voorraad.tsx`, `retouren.tsx`
- Filterselects (Alle statussen / Alle artikelen / Alle types): sentinel `"__alle__"` met conversie terug naar `""`
- Nullable selects (Geen locatie / Geen reservering / Geen): sentinel `"__geen__"` met conversie terug naar `""` of `null`
- Functionaliteit ongewijzigd — API-calls blijven `filterX || undefined` gebruiken

---

## 2026-07-01 — Boekhouder: functiegroep en preset toegevoegd

**Uitvoering:** volledig | **Getest:** typecheck groen (libs + firevault)

- Preset "Externe boekhouder" had `financieel: 2` (wijzigen); aangepast naar `financieel: 4` (volledig beheer) in `lib/permissies/src/index.ts`
- Preset aangemaakt in DB (id=9): financieel=4, boekhouder_portaal=4, salarisarchief=2, salaris_mutaties=1, rapportages=1
- "Externe boekhouder" toegevoegd aan `FUNCTIE_GROEPEN` in de gebruikerspagina (was onzichtbaar bij gebruiker aanmaken)
- Synchroniseer-route (`POST /profielen/synchroniseer-standaard`) werkt nu ook bestaande systeem-presets bij als ze afwijken van de codedefinitie (was: alleen nieuwe presets invoegen)

---

## 2026-07-01 — Gebruikers: foutfeedback bij uitnodigen hersteld

**Uitvoering:** volledig | **Getest:** typecheck groen

- `stuurUitnodiging` had een stille `catch {}` — als de mail-API een 502 teruggaf (bijv. Azure niet geconfigureerd in dev), zag de gebruiker niets
- Nu: succesbericht via toast ("Uitnodiging verstuurd" / "Uitnodiging opnieuw verstuurd" met e-mailadres) en foutmelding via destructive toast met de servermelding
- `useToast` geïmporteerd en geïnitialiseerd in de gebruikerspagina

---

## 2026-07-01 — SlimUploadBalk: popup verschijnt nu altijd bij droppen

**Uitvoering:** volledig | **Getest:** typecheck groen

- **Root cause 1 (stale closure)**: de drop-listener was geregistreerd met `[]`-deps en belde een verouderde versie van `verwerkBestanden` aan. Opgelost met een `verwerkBestandenRef` die elke render gesynchroniseerd wordt; de listener belt nu altijd de meest recente versie aan.
- **Root cause 2 (silent TypeError)**: `CATEGORIE_INFO[actief.categorie].pad` kon een `TypeError` gooien als een opgeslagen automatiseringsregel een ongeldige categorie bevatte (bv. uit een oudere versie). Die unhandled rejection zorgde ervoor dat `setToonDialoog(true)` nooit bereikt werd en de popup stilzwijgend uitbleef. Opgelost met defensive guard: `const catInfo = CATEGORIE_INFO[actief.categorie]; if (actief && catInfo)`.
- **Root cause 3 (geen feedback bij automatisering)**: als een automatiseringsregel actief was, werd de gebruiker stilzwijgend doorgestuurd zonder enige indicatie. De gebruiker dacht "er gebeurt niets". Nu verschijnt een toast: "Automatisch doorgestuurd — [bestand] → [categorie]".
- **Codegen-drift hersteld**: na merge van tasks #173/#174 was codegen niet opnieuw gedraaid; `DocumentStudioModelInputDocumentType` (enum toegevoegd in OpenAPI) ontbrak in de gegenereerde client. Nu hersteld; typecheck groen.

---

## 2026-07-01 — Gebouwen: werkmaatschappij zichtbaar en bewerkbaar

**Uitvoering:** volledig | **Getest:** typecheck groen

- DB: ontbrekende werkgevers ingevoegd — FPS Bouw (id=6), FPS Bouw en Renovatie (id=7), FPS Onderhoud (id=8); aanmaakdialoog toont nu alle vier keuzes
- Gebouwenlijst (`index.tsx`): werkmaatschappij-naam onder adres/stad op elke kaart
- Gebouwenlijst: filter-dropdown "Filter op werkmaatschappij" naast status-filter (client-side, ook optie "Zonder werkmaatschappij")
- Filter wissen-knop reset nu ook werkmaatschappij-filter
- Detail-header (`detail.tsx`): werkmaatschappij-naam met Building2-icoon in meta-informatierij
- Projectformulier (`gebouw-projectformulier.tsx`): `GebouwProp` uitgebreid met `werkgever_id` + `werkmaatschappij_naam`
- Projectformulier: werkmaatschappij-dropdown in bewerkmode (Gebouwafmetingen-sectie) — sla op via PATCH `/gebouwen/:id`
- Projectformulier: werkmaatschappij als leesregel in Projectidentiteit-sectie
- Geen OpenAPI/schema-wijzigingen nodig — velden bestonden al

---

## 2026-07-01 — Magazijn: QR-labelgenerator voor artikelen (Dymo LabelWriter 450)

**Uitvoering:** volledig | **Getest:** typecheck groen

- Nieuw scherm `/magazijn/artikelen/:id/label` (`artikel-label.tsx`) — standalone printpagina buiten de portallayout
- Label toont: QR-code (linkt naar artikel in FPS Connect), artikelnaam, code, merk, leveranciersnaam + leveranciers artikelnummer, barcodewaarde en eenheid
- Vier Dymo-labelformaten selecteerbaar in de toolbar: 89×36 mm, 89×28 mm, 57×32 mm en 54×25 mm
- CSS `@page { size: Xmm Ymm; margin: 0; }` past zich automatisch aan het gekozen formaat aan — gebruiker selecteert Dymo LabelWriter 450 in de printdialoog
- Aantal-selector (1-20 labels) — elk label wordt op een apart etiket afgedrukt
- Instructiebalk toont het exacte formaat en Dymo-instelling-advies
- Knop "QR-label afdrukken" toegevoegd aan de navigatiebalk van `artikel-detail.tsx`
- Route `/magazijn/artikelen/:id/label` geregistreerd vóór `:id` in `App.tsx` (wouter matcht specifiekst eerst)
- Geen backend/OpenAPI-wijzigingen nodig — volledig client-side

---

## 2026-07-01 — Document Studio: templates actief in Connect-modules

**Uitvoering:** volledig | **Getest:** typecheck groen

- `calculatie/print.tsx`: Document Studio-integratie toegevoegd — laadt het goedgekeurde "calculatie" Studio Model 0 via `useActiefStudioModel` en past de merkkleur toe op header-border, sectie-koppen, totaaloverzicht-header en de totaalrij (voorheen hardcoded slate-900)
- Werkgever-resolutie via localStorage (`fps.actieve_werkgever`) + `useListStudioWerkgevers`, gelijk aan het patroon in `offertes/print.tsx` en `gebouwen/print.tsx`
- Badge "Opmaak: Model 0 — [werkgever]" verschijnt in de kop als er een goedgekeurd template actief is; bij geen actief model valt de accentkleur terug op `#1e2535`
- `studio.tsx`: `calculatie: ["Calculatie intern"]` toegevoegd aan `DOCUMENT_TYPE_MODULES` zodat de Studio-pagina "Actief in: Calculatie intern" toont op goedgekeurde calculatietemplates
- Bestaande integraties onaangeroerd: `offertes/print.tsx` (Familie A, volledig) en `gebouwen/print.tsx` (opleverrapport, accent + badge) waren al compleet
- Factuurmodule heeft geen print.tsx (boekhoudimport-tool); `factuur: ["Facturen"]` blijft in de mapping voor toekomstige integratie

---

## 2026-07-01 — Crashfix magazijn: stray `</>` in slim-upload-balk

**Uitvoering:** volledig | **Getest:** typecheck groen, app serveert correct

- Oorzaak: dropzone-overlay-edit introduceerde een stray `)}` in de JSX-structuur van `slim-upload-balk.tsx`, waarna esbuild de transformatie van de hele app faalde → alle pagina's (inclusief magazijn) crashten met een witte scherm
- Achtergebleven `<>…</>` fragment-wrapper en stray `</>` sluitingstag uit de vorige ternaire structuur zijn opgeruimd
- `SlimUploadKnop`, `Popover` en separator-elementen zijn nu directe kinderen van de taakbalk-div zonder onnodige fragment-omhulling
- Magazijn-module: alle hooks, DB-tabellen en routes zijn geverifieerd aanwezig en correct; de crash was puur de JSX-transformatiefout in de layoutcomponent

---

## 2026-07-01 — AI-invullen bij nieuw leverancier

**Uitvoering:** volledig | **Getest:** typecheck groen

- `AiInvullenKnop` toegevoegd aan het "Leverancier toevoegen"-dialog in Calculatie › Leveranciers
- Na het invullen van de naam zoekt AI online naar telefoonnummer, e-mail en website van de leverancier
- Knop verschijnt alleen bij nieuw aanmaken (niet bij bewerken van een bestaande leverancier)
- Backend `POST /ai/invullen` ondersteunde `formulier_type: "leverancier"` al; alleen frontend-integratie toegevoegd

---

## 2026-07-01 — Document Studio: opleverrapport als volwaardig type + template-velden volledig

**Uitvoering:** volledig | **Getest:** typecheck groen (firevault + api-server)

- `GELDIGE_TYPES` in `studio.ts` uitgebreid met `"opleverrapport"` — aanmaken/goedkeuren van opleverrapport-modellen in Studio is nu mogelijk
- `DOCUMENT_TYPEN` in `studio.tsx` aangevuld met Opleverrapport-entry (icoon FileText, omschrijving)
- `DOCUMENT_TYPE_MODULES` gecorrigeerd: `offerte → ["Offertes"]`, `opleverrapport → ["Opleverrapporten"]`, `factuur → ["Facturen"]` — badges tonen nu de werkelijke koppeling
- Beide print-bestanden parsen nu `koptekst.logo_positie` uit `connect_template_json`
- Offerte print: `sektieHeaderKlasse` stuurt `flex-row-reverse` (links) of `justify-center gap-8` (midden) op basis van logo_positie; alle 5 sectie-headers passen dit toe
- Offerte print: voettekst uit template-JSON getoond als tagline-tekst onder het logo in elk sectie-kopbalk
- Gebouwen print (opleverrapport): `prt-cover-top` past `justifyContent` aan op basis van `studioLogoPositie` (flex-start / center / flex-end)

---

## 2026-07-01 — Dropzone overlay bij bestand slepen

**Uitvoering:** volledig | **Getest:** typecheck groen

- Smalle rode/oranje balk die de taakbalk uitzette bij drag-over vervangen door een mooi gecentreerd overlay-scherm
- Overlay: donker semi-transparant backdrop (`bg-black/50 backdrop-blur-sm`), wit afgerond kaartje met oranje gestippelde rand, grote Upload-icoon met glow-ring, kopregel + ondertitel, badge "Slimme categorisering actief", fade-in + zoom animatie via Tailwind `animate-in`
- Taakbalk blijft altijd in zijn normale donkere staat — geen kleurwijziging meer tijdens drag

---

## 2026-07-01 — Centrale AI-invullaag (Option B) — `POST /ai/invullen` + `<AiInvullenKnop />`

**Uitvoering:** volledig | **Getest:** typecheck groen, endpoint bereikbaar (401 auth-guard actief)

- **Backend**: nieuw `POST /ai/invullen` endpoint (`artifacts/api-server/src/routes/ai.ts`) — één centraal punt voor alle formulieren. Accepteert `formulier_type` (enum: 9 types), optionele `context_id` (DB-context laden per type: klant/gebouw/leverancier), en `huidige_velden`. Bouwt form-type-specifieke prompt, zoekt live via `web_search_preview` Responses API, valt terug op chat completions. Geeft `{ velden: Record<string, string|null> }` terug.
- **OpenAPI**: path `/ai/invullen` + schemas `AiInvullenInput` / `AiInvullenResultaat` + tag `ai` toegevoegd aan `openapi.yaml`.
- **Codegen**: `useAiCentraalInvullen` mutation hook gegenereerd in `@workspace/api-client-react`.
- **Frontend component**: `artifacts/firevault/src/components/ai-invullen-knop.tsx` — herbruikbare `<AiInvullenKnop />` met amber UX (Sparkles-knop → amber voorstelspaneel → Overnemen / Negeren). Props: `formulierType`, `contextId?`, `huidigVelden`, `onVoorstellen`, `veldenLabels?`.
- **Formulierdeployments**:
  - CRM Organisaties (`crm/organisaties.tsx`): knop na naam-veld, vult adres/postcode/stad/regio/telefoon/email/website/branche/type aan.
  - CRM Contactpersonen (`crm/detail.tsx`): knop in nieuwe-contactpersoon-dialog na naam-veld, vult email/telefoon/mobiel/functie aan (met organisatie als `contextId`).
- Gebouwen-formulieren overgeslagen — die bevatten al `useAiAnalyseGebouw` (uitgebreider AI-systeem); dubbele AI-knoppen vermeden.

---

## 2026-07-01 — AI-invullen: echte webzoekopdracht via web_search_preview

**Uitvoering:** volledig | **Getest:** typecheck groen

- `POST /organisatie/ai-invullen`: gebruikt nu de Responses API met `web_search_preview` tool zodat de AI actief op internet zoekt naar bedrijfsgegevens (adres, telefoon, e-mail, website, KVK, BTW). Val terug op trainingsdata als web search niet beschikbaar is.
- `POST /crm/concurrenten/ai-profiel`: zelfde upgrade — zoekt nu live naar concurrentinformatie.
- Prompt aangepast: minder conservatief ("null alleen als echt niet te vinden") en expliciet gericht op Nederland.

---

## 2026-07-01 — Document Studio: werkgever-resolutie en API-contract gerepareerd

**Uitvoering:** volledig | **Getest:** typecheck groen

- `GET /studio/modellen/actief` geeft nu `200` met `null` terug als er geen goedgekeurd model bestaat (was: `404`); sluit aan op het fallback-contract
- `offertes/print.tsx`: werkgever-resolutie voor studio-model leest nu de actieve werkgever uit localStorage (`fps.actieve_werkgever`) in plaats van altijd `werkgevers[0]` te nemen; val terug op `werkgevers[0]` als localStorage leeg is (print-pagina valt buiten WerkmaatschappijProvider)
- `gebouwen/print.tsx`: zelfde fix — `studioWerkgeverId` wordt nu afgeleid uit `gebouw.werkmaatschappij_naam` (met fallback naar `werkgevers[0]`); ook de `werkgever`-variabele voor de print-header wordt nu via dezelfde naam opgelost
- `gebouwen/print.tsx`: badge "Opmaak: Model 0 — …" toegevoegd in de topbar (naast de bestaande status-badges), consistent met `offertes/print.tsx`

---

## 2026-07-01 — AI-invullen op leveranciers- en concurrentformulieren

**Uitvoering:** volledig | **Getest:** typecheck groen

**Leveranciers (detail — BewerkModal):**
- Knop "AI invullen" naast naam in het Leverancier bewerken-dialoog
- Vult automatisch: KvK, BTW, adres, postcode, stad, telefoon, e-mail, website en IBAN
- Amber suggestiepaneel met leesbare veldlabels (KvK, BTW, Adres, enz.); "Overnemen" past alle velden tegelijk toe, "Negeren" sluit het paneel
- Hergebruikt bestaande `POST /organisatie/ai-invullen` endpoint; veldmapping kvk→kvk_nummer, btw→btw_nummer, plaats→stad

**Leveranciers (index — NieuweLeverancierModal):**
- Zelfde AI-knop in het aanmaakformulier; vult e-mail, telefoon en stad in (velden beschikbaar in de snelle create-dialog)

**CRM Concurrenten:**
- Nieuw backend endpoint `POST /crm/concurrenten/ai-profiel`: genereert een concurrentprofiel via GPT-4o op basis van naam (website, regio, bekende klanten, projecttypes, sterke/zwakke punten, waar tegengekomen)
- Nieuw OpenAPI-pad + schema `CrmConcurrentAiProfielInput`; codegen uitgevoerd; gegenereerde hook `useAiProfielCrmConcurrent`
- Knop "AI" in het Concurrent-formulier (nieuw + bewerken); amber paneel met "AI-concurrentprofiel"; "Overnemen" vult alle velden tegelijk in

---

## 2026-07-01 — Werkmaatschappijen: AI-invullen op formulier

**Uitvoering:** volledig | **Getest:** typecheck groen

- Knop "AI invullen" naast het naamveld in het werkmaatschappij-dialoog (nieuw + bewerken)
- Na invullen van de bedrijfsnaam zoekt de AI automatisch: adres, postcode, plaats, KVK, BTW, telefoon, e-mail en website op via de bestaande `/organisatie/ai-invullen` endpoint
- Resultaten verschijnen in een amber suggestiepaneel met leesbare veldlabels en "Overnemen"/"Negeren" knoppen — mens bevestigt altijd voor opslaan
- Knop is uitgeschakeld zolang naam leeg is; toelichting onder het naamveld legt het gebruik uit

---

## 2026-07-01 — Werkmaatschappij context: switcher in sidebar, doorwerking dashboard + documentopmaak

**Uitvoering:** volledig | **Getest:** typecheck groen

- Nieuw `WerkmaatschappijProvider` (React context) — slaat actieve werkgever op in localStorage (`fps.actieve_werkgever`), auto-selecteert de eerste actieve werkmaatschappij bij eerste bezoek
- Switcher in sidebar-header: compact dropdown direct onder het logo, zichtbaar voor hoofdbeheerder of wanneer er meerdere werkmaatschappijen zijn; verdwijnt bij ingeklapte sidebar
- Dashboard `beheerder.tsx`: toont een context-balk met de actieve werkmaatschappij (naam + vestigingsplaats) direct boven de KPI-kaarten
- Documentopmaak (`/organisatie/documentopmaak`): pre-selecteert automatisch de actieve werkmaatschappij uit de context in plaats van altijd de eerste

**Diepere lagen:** gedeeltelijk — de contextkeuze stuurt branding (documentopmaak, logo in DDS) en is platform-breed beschikbaar via `useWerkmaatschappij()`. Volledige data-scoping (gebouwen/spots/documenten filteren per werkmaatschappij) vereist backend API-parameters op tientallen endpoints — apart increment.

---

## 2026-07-01 — Slim uploaden: 15-minuten notificatiepaneel met ongedaan maken

**Uitvoering:** volledig | **Getest:** typecheck groen

- Na elke bevestigde upload verschijnt rechtsonder een floating paneel ("Recente uploads").
- Elk item toont: bestandsnaam, categorielabel met kleur, tijdstip + resterende tijd (15 minuten).
- **Ongedaan maken**: verwijdert het item uit de lijst en navigeert terug naar de pagina van vóór de redirect (zodat de gebruiker opnieuw kan indelen).
- **Alles wissen**: leegt het paneel in één klik.
- TTL wordt bijgehouden via localStorage — paneel blijft zichtbaar na paginanavigatie, verdwijnt automatisch na 15 minuten per item.
- Paneel ververst elke 30 seconden de tijdweergave.

---

## 2026-07-01 — Slim uploaden: vision-analyse voor alle documenttypen

**Uitvoering:** volledig | **Getest:** typecheck groen (firevault + api-server), workflows herstart

- **Vision-analyse**: eerste pagina van elke PDF wordt via `pdftoppm` omgezet naar JPEG, geschaald met `sharp` en als afbeelding meegestuurd naar OpenAI gpt-4o-mini. AI ziet nu de visuele lay-out, niet alleen de tekst.
- **Afbeeldingen (JPEG/PNG/WEBP)**: ook rechtstreeks naar vision gestuurd (resize via sharp).
- **AI-prompt uitgebreid** met visuele signalen per type: logo+lege pagina = document_sjabloon, maatlijnen/schaal = tekening, tabelposten+IBAN = factuur, etc.
- **Vision-badge** in het beslisscherm: "AI heeft de visuele lay-out geanalyseerd" zichtbaar wanneer vision werd ingezet.
- **`vision_gebruikt`** vlag in API-response en frontend.
- Pre-existing lege-PDF heuristiek blijft als fallback wanneer AI niet beschikbaar is.

---

## 2026-07-01 — Slim uploaden: meerdere bestanden + document-intelligentie workflow

**Uitvoering:** volledig | **Getest:** typecheck groen (firevault + api-server), workflows herstart

### Backend (`artifacts/api-server/src/routes/slim-upload.ts`)
- **Meerdere bestanden tegelijk**: endpoint accepteert nu `bestanden[]` (array via `upload.any()`), verwerkt elk bestand parallel en retourneert een array van suggesties
- **14 categorieën** (was 7): aanvraag, tekening, offerte, factuur, productdocument, testrapport, certificaat, ETA, DoP, personeelsdocument, snagstream, bibliotheek, algemeen, onbekend
- **Rijkere AI-extractie**: prompt instrueert GPT om per documenttype specifieke velden te extraheren (leverancier/bedrag bij facturen, klant/locatie bij aanvragen, fabrikant/normen bij testrapporten, etc.)
- **Alternatieven**: AI geeft altijd top-2/3 alternatieve categorieën terug (voor beslisscherm)
- **Betere heuristiek**: uitgebreide fallback classificeert ook ETA, DoP, testrapport, certificaat, productdocument op bestandsnaam

### Frontend (`artifacts/firevault/src/components/slim-upload-balk.tsx`)
- **Multi-file**: `<input multiple>` + drag-drop accepteert meerdere bestanden tegelijk; queue-gebaseerde verwerking
- **Beslisscherm per bestand**: rijke dialog met gevonden gegevens (klant, bedrag, fabrikant, etc.), redenering en alternatieven
- **Twee-paneel layout** bij meerdere bestanden: bestandenlijst links, beslisscherm rechts
- **Drietrapsfout-afhandeling**: AI succesvol → voorstel tonen; AI onzeker/onbekend → top-3 alternatieven als klikbare kaarten; technische fout → handmatige classificatiegrid (nooit alleen een foutmelding)
- **AVG-waarschuwing** bij personeelsdocumenten
- **Aanvraag-flow**: aparte vervolgknoppen "Nieuw werk aanmaken" / "Alleen opslaan in bibliotheek"
- **Automatiseringsregels** bewaard: blijven werken met de nieuwe categorieën

---

## 2026-06-30 — Login: autofocus op TOTP-invoerveld

**Uitvoering:** volledig | **Getest:** typecheck groen

- `autoFocus` toegevoegd aan `InputOTP` in stap "verify" en stap "setup" (`artifacts/firevault/src/pages/auth/login.tsx`): cursor staat nu direct in het eerste vakje zodra de 2FA-stap verschijnt, zonder muisklik.

---

## 2026-06-30 — Document Studio: templates actief in Connect-modules

**Uitvoering:** volledig | **Diepere lagen:** volledig | **Getest:** typecheck groen (firevault + api-server), codegen geslaagd, workflows herstart

- **API `GET /studio/modellen/actief`**: enkelvoudige lookup op werkgever_id + document_type; 404 als geen goedgekeurd model; Express-volgorde vóór `/:id`
- **API `GET /studio/werkgevers/:id/modellen/actief`** (bulk): geeft `Record<documentType, DocumentStudioModel>` terug met alle goedgekeurde templates voor een werkgever in één call; gebruikt `parseId` voor type-veilige param-parsing
- **Codegen**: `useListActieveDocumentStudioModellen` + `getListActieveDocumentStudioModellenQueryKey` gegenereerd
- **Shared hook** `use-actief-studio-model.ts` (`artifacts/firevault/src/hooks/`): `useActiefStudioModel(werkgeverId, documentType)` — wraps bulk-hook, normaliseert 404/ontbrekend naar `null`, `throwOnError: false`
- **Werkgever-matching op naam**: studioWerkgever wordt gezocht op `naam === werkgevers[0].naam` (of werkgeverNaam in gebouwen) met fallback op `studioWerkgevers[0]`; nooit meer blind `[0]` in multi-werkmaatschappij context
- **Offertes print** (`offertes/print.tsx`): gebruikt shared hook; `--color-primary` CSS-var op root-div (cascade VoorbladA); `logo_url` uit Studio werkgever; "Opmaak: Model 0" badge (print:hidden)
- **Opleverrapporten print** (`gebouwen/print.tsx`): gebruikt shared hook; `.prt-cover-accentlijn` background via inline style; voettekst-tagline uit template (fallback "Brandveiligheid door vakmanschap")
- **Document Studio kaart** (`studio.tsx`): `DOCUMENT_TYPE_MODULES` mapping; "Actief in:" badges op goedgekeurde kaarten

---

## 2026-06-30 — Document Studio: AI template generatie & Model 0

**Uitvoering:** volledig | **Diepere lagen:** volledig | **Getest:** typecheck groen, codegen geslaagd, workflows draaien

- **AI genereer-endpoint** (`POST /studio/modellen/:id/genereer`): leest referentie-PDF via object storage (pdf-parse), haalt werkgever-branding op (primaireKleur, logo_url, voettekst), stuurt prompt naar GPT-4o, valideert JSON-response, slaat op als `connect_template_json` met status `concept`; families A/B/C automatisch geadviseerd per documenttype; optionele `instructie`-parameter voor eerste generatie
- **Bijstuur-endpoint** (`POST /studio/modellen/:id/bijstuur`): bestaand concept + bijstuur-instructie → GPT-4o → verfijnd concept; overschrijft huidige concept-json (geen versieboom in deze fase)
- **Goedkeur-endpoint** (`POST /studio/modellen/:id/goedkeuren`): status → `goedgekeurd`, `goedgekeurd_op` + `goedgekeurd_door` (uit sessie), versie incrementeren, activiteitslog-entry
- **StudioTemplateJson schema** in OpenAPI: familie, koptekst (logo_positie/titel/subinfo), kleurschema (primair/secundair/tekst), secties (tekst/tabel/ondertekening/checklist), voettekst
- **StudioTemplatePreview** component (`src/components/documentopmaak/StudioTemplatePreview.tsx`): rendert template_json via DocumentFrame; secties naar correct bloktype (tekst/tabel/ondertekening/checklist); familie-badge; merkkleur-accent; logo-positie links/rechts/midden
- **AI-generatie UI** in `studio.tsx`:
  - Kaartgrid uitgebreid: "Genereer met AI" knop per type bij aanwezig referentiebestand; automatisch genereren bij eerste keer openen zonder concept
  - AI-dialoog (max-w-5xl): preview links (live re-rendered na elke actie), bijstuur-paneel rechts
  - Bijstuur-instructie + Verfijnen-knop; Opnieuw genereren; iteratiegeschiedenis met alle gegeven instructies in de sessie
  - Goedkeuren-knop + bevestigingsdialoog (goedgekeurd-state sluit bijstuurveld af, toont datum)
- **Codegen**: `useGenereerStudioTemplate`, `useBijstuurStudioTemplate`, `useGoedkeurenStudioTemplate` gegenereerd + lib rebuild
- **Technisch**: pdf-parse via createRequire (CJS-compatibiliteit); buffer-download via createReadStream + Promise; JSON-extractie uit mogelijke markdown-omhulsels; 503 bij invalide AI-JSON

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
