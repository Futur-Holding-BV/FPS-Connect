# Acceptatierapport — Vijf Basisopdrachten

**Datum:** 3 juli 2026  
**Methode:** directe codebase-audit (grep + leesopdrachten), geen aannames  
**Beoordelingsschaal:** Ontworpen → Geïmplementeerd → Geïntegreerd → Productiegereed

---

## Opdracht 1 — Workflow Engine

**Eindbeoordeling: Geïntegreerd**

### 1. Wat exact is gebouwd

- `WorkflowService`-class + `workflowService`-singleton in `artifacts/api-server/src/services/workflow-engine.ts`
- `maakTransitieContext(req)` helper die gebruiker, rol en gebouw-id uit de sessie laadt
- 10 workflow-configuraties in `workflow-configs.ts`: Offerte, Opdracht, Inkoopbon, Inkoopplan, Uitvoeringsplan, Verlofaanvraag, Onderhoudstaak, Calculatie, Planningitem uitvoering, Arbeidsovereenkomst
- `GET /workflow`-route waarmee de frontend toegestane overgangen kan opvragen
- Ingebouwde integratie met `logAudit()`: elke transitie via de engine wordt automatisch gelogd
- `workflowRechtenTable` aangemaakt in DB-schema voor toekomstige rechtencontrole per workflowstap

### 2. Modules die het actief gebruiken

| Route | Workflow-naam |
|-------|--------------|
| `offertes.ts` | offerte |
| `opdrachten.ts` | opdracht |
| `calculaties.ts` | calculatie |
| `werkvoorbereiding.ts` | inkoopbon, inkoopplan, uitvoeringsplan, arbeidsovereenkomst |
| `hrm.ts` | verlofaanvraag |
| `onderhoud.ts` | onderhoud |

6 van de 10 geconfigureerde workflows worden actief gebruikt.

### 3. Modules die nog niet zijn gemigreerd

Alle onderstaande modules beheren een statusveld maar schrijven direct naar de DB zonder de WorkflowEngine aan te roepen:

- `dossiers.ts` — concept / definitief / gearchiveerd
- `documenten.ts` — concept / actueel / vervangen
- `projecten.ts` — status vrij instelbaar via PATCH-body
- `opname.ts` — concept / definitief
- `rapporten.ts` — concept / definitief
- `planning-module.ts` — concept / actief (meerdere sub-entiteiten)
- `wagenpark.ts` — actief / gearchiveerd / enz.
- `salaris-mutaties.ts` — concept / geaccordeerd / afgekeurd
- `portaal.ts` — geaccepteerd / ondertekend
- `voorzieningen.ts` — eigen PATCH `/status`-endpoint buiten engine
- `inbox.ts` — nieuw / geanalyseerd / ter_beoordeling / goedgekeurd / verplaatst / afgewezen
- `werkbonnen.ts` — statusbeheer buiten engine

Dit zijn meer dan 12 modules met een eigen, niet-bewaakte statusmachine.

### 4. Tijdelijke oplossingen en duplicaten

- `workflowRechtenTable` bestaat in het schema maar wordt nergens gelezen of gebruikt — de tabel is een placeholder zonder effect
- Elk van de niet-gemigreerde modules heeft zijn eigen statusvalidatie (deels in de route, deels alleen door de DB-kolom)
- De 4 geconfigureerde workflows waarvoor géén `transiteer()`-aanroep bestaat (Inkoopbon, Inkoopplan, Uitvoeringsplan, Arbeidsovereenkomst) worden wél geconfigureerd in `workflow-configs.ts` maar zijn niet zichtbaar gekoppeld aan een expliciete transitie-aanroep buiten `werkvoorbereiding.ts`

### 5. Bekende beperkingen

- Geen systeem-transitie: `TransitieContext` vereist altijd een geldig `req`-object met gebruikerssessie. Achtergrondprocessen (APO, inbox-wachtrij, deadline-scheduler) kunnen de engine niet aanroepen zonder een nep-sessie te construeren.
- `workflowService.getConfig()` is niet gepubliceerd als publieke methode — configs kunnen niet van buiten worden geïnspecteerd
- Geen visuele workflow-editor; configuraties zijn hardcoded TypeScript

### 6. Regressierisico's

- Routes die de engine omzeilen kunnen inconsistente statussen aanmaken die de engine daarna weigert te verwerken (bijv. een status die niet in de config staat)
- Bij uitbreiding van een workflow-config kan bestaande data in een niet-gedocumenteerde status blijven staan
- Verwijdering of hernoemen van een workflow-naam in configs breekt alle bestaande routes die de naam als string doorgeven

### 7. Productiegereed voor kantooromgeving?

**Nee — Geïntegreerd, niet Productiegereed.**

De engine werkt correct voor de 6 routes die het gebruiken. Maar: meer dan 12 modules met een statusmachine zijn volledig buiten de engine gebouwd. De belofte van de WorkflowEngine — één centrale plek voor statusvalidatie, auditlogging en toegangscontrole — geldt voor minder dan een kwart van de modules die er baat bij hebben. De systeem-transitie-beperking blokkeert ook de APO en de inbox-wachtrij. Zolang de engine niet de enige weg is waarlangs statussen veranderen, bestaat er geen garantie op statusintegriteit.

---

## Opdracht 2 — Audit Trail

**Eindbeoordeling: Geïmplementeerd**

### 1. Wat exact is gebouwd

- `logAudit()` fire-and-forget functie in `artifacts/api-server/src/lib/audit.ts` — schrijft asynchroon naar `audit_log`, blokkeert de response niet
- `maakAuditMiddleware()` — HTTP-middleware die voor elke request methode, pad, gebruiker-id, tijdstip en statuscode vastlegt
- `auditLogTable` in DB-schema met kolommen: module, actie, entiteit, entiteit_id, entiteit_naam, gebruiker_id, gebouw_id, tijdstip, nieuwe_waarde (JSONB)
- `GET /audit`-route voor raadplegen van de auditlog (gefilterd op module, periode, gebruiker)
- Frontend beheerscherm onder Beheer › Audit trail

### 2. Modules die het actief gebruiken

De HTTP-middleware (`maakAuditMiddleware()`) is **globaal gemount** op alle routes in `routes/index.ts` regel 97. Dit betekent dat elke HTTP-request automatisch als HTTP-event wordt vastgelegd — dat is 100% van de routes.

Expliciete business-event logging via `logAudit()`:

| Module | Wat wordt gelogd |
|--------|-----------------|
| `auth.ts` | Inlogpogingen (geslaagd en mislukt) |
| `workflow-engine.ts` | Elke workflowtransitie (automatisch voor alle WorkflowEngine-gebruikers) |

### 3. Modules die niet zijn gemigreerd

Business-event logging (met entiteit, oud-waarde, nieuw-waarde) is **niet geïmplementeerd** in:

- `gebouwen.ts` — aanmaken, wijzigen, archiveren van gebouwen
- `voorzieningen.ts` — aanmaken, wijzigen, statuswijziging van spots
- `documenten.ts` — uploaden, vervangen, versiebeheer
- `dossiers.ts` — definitief verklaren, archiveren
- `inspecties.ts` — aanmaken en wijzigen inspecties
- `hrm.ts` — medewerkersmutaties (buiten verlofaanvraag via WorkflowEngine)
- `gebruikers.ts` — aanmaken, rolwijziging, wachtwoordreset
- `inbox.ts` — eigen `inbox_audit_log`-tabel (parallel, niet de centrale)
- `salarisarchief.ts` — eigen lokale `logAudit()`-functie met een andere signature (niet de centrale `logAudit()`)
- Alle overige ~75 routes: alleen HTTP-middleware, geen business-events

### 4. Tijdelijke oplossingen en duplicaten

- `salarisarchief.ts` definieert op regel 27 een **eigen lokale** `logAudit()`-functie met een afwijkende signature. Die schrijft naar een salarisarchief-specifieke auditlog, niet naar de centrale `auditLogTable`. Dit is een volledig los duplicaat van de centrale audittrail.
- `inbox_audit_log` is een tweede, module-specifieke auditlog-tabel die niet gekoppeld is aan de centrale `auditLogTable`
- De HTTP-middleware legt de request vast maar heeft geen toegang tot de oude waarde van een entiteit — pre-update state is niet terugvindbaar via de auditlog

### 5. Bekende beperkingen

- De audit trail toont wat er gevraagd is (HTTP methode + pad), niet altijd wat er veranderd is (geen oud/nieuw vergelijking)
- Geen gestandaardiseerde module-naamgeving: modules geven aan `logAudit()` een vrije string mee voor `module`. Er is geen gedefinieerde lijst van geldige module-namen; verkeerde of wisselende namen verslechteren de filterbaarheid
- `logAudit()` is fire-and-forget: bij een DB-storing verdwijnt de log-entry zonder melding
- Geen retentiebeleid of archivering gedefinieerd; de tabel groeit onbeperkt

### 6. Regressierisico's

- Een route die `logAudit()` aanroept met een niet-bestaand veldpad laat het audit-event stilzwijgend vallen (geen foutmelding naar client)
- De parallelstructuur (centrale log + `inbox_audit_log` + salaris-audit) vergroot de kans dat compliance-vragen niet eenduidig te beantwoorden zijn
- Het verwijderen van `maakAuditMiddleware()` uit de routes-index verwijdert in één actie alle HTTP-logging

### 7. Productiegereed voor kantooromgeving?

**Nee — Geïmplementeerd, niet Geïntegreerd.**

De HTTP-middleware functioneert en legt alle requests globaal vast. Maar voor een kantooromgeving waarbij wijzigingen op gebouwen, spots, inspecties, medewerkers en documenten herleidbaar moeten zijn tot een persoon met voor-en-na waarden, schiet de huidige implementatie tekort. De business-event logging is beperkt tot login en workflowovergangen. De duplicaten (salaris, inbox) en de afwijkende signature in salarisarchief.ts zijn technische schuld met compliance-risico.

---

## Opdracht 3 — Centrale Rechtenstructuur (RBAC)

**Eindbeoordeling: Geïmplementeerd**

### 1. Wat exact is gebouwd

- `objectRechtenTable` en `workflowRechtenTable` in DB-schema (`lib/db/src/schema/rechten.ts`)
- `PermissieEngine` in `lib/permissies/src/engine.ts`
- `PermissieService` in `artifacts/api-server/src/lib/permissie-service.ts`
- `laadPermissies()` middleware in `middlewares/auth.ts` — laadt object-rechten uit DB in `req.permissies`
- `requireObjectRecht(objectType, paramNaam)` middleware in `middlewares/auth.ts` — controleert object-niveau toegang
- `magBijGebouw()` en `toegewezenGebouwIds()` gecentraliseerd in `utils/rol.ts`
- CRUD-routes voor object-rechten: `GET/POST/PATCH/DELETE /object-rechten` (212 regels)
- Frontend beheerpagina `/beheer/object-rechten` (513 regels) met overzicht per gebruiker en per gebouw

### 2. Modules die het actief gebruiken

- `gebouwen.ts` — gebruikt `magBijGebouw()` en `toegewezenGebouwIds()` uit `utils/rol.ts` voor gebouwscoping (dit was al vóór Task #180 aanwezig; Task #180 heeft het gecentraliseerd in `utils/rol.ts`)
- `dashboard.ts` — eigen lokale implementatie van `toegewezenGebouwIds()` (nog niet gemigreerd naar de centrale helper)

**`requireObjectRecht()` wordt in geen enkele productie-route aangeroepen.**  
**`laadPermissies()` wordt in geen enkele productie-route als middleware gebruikt.**

### 3. Modules die niet zijn gemigreerd

Alle routes buiten `gebouwen.ts`. De object-niveau rechtencontrole via `requireObjectRecht()` en `laadPermissies()` is niet geïntegreerd in:

- `voorzieningen.ts`, `inspecties.ts`, `documenten.ts`, `dossiers.ts`
- `hrm.ts`, `wagenpark.ts`, `offertes.ts`, `opdrachten.ts`
- Alle overige ~78 routes

### 4. Tijdelijke oplossingen en duplicaten

- `workflowRechtenTable` is aangemaakt in het schema maar wordt nergens gelezen. Er is geen code die regels uit deze tabel ophaalt of toepast.
- `PermissieEngine` is gebouwd als bibliotheek maar heeft geen enkel productieverbruik buiten de eigen tests (als die er zijn)
- `dashboard.ts` heeft een eigen `toegewezenGebouwIds()`-implementatie op regel 18 die de centrale helper dupliceert
- De beheerpagina laat toe dat rechten worden aangemaakt en opgeslagen in de DB, maar die rechten hebben geen enkel effect op de toegangscontrole van welke route dan ook

### 5. Bekende beperkingen

- De RBAC-laag bestaat als zelfstandig beheersysteem maar beïnvloedt geen enkel beveiligingsbesluit in de productieroutes
- `requireObjectRecht()` is gedefinieerd maar niet in gebruik — rechten in de DB zijn decoratief
- De bevoegdheden-matrix (`requireBevoegdheid`) die wél actief is, is een los systeem naast de nieuwe RBAC-laag, zonder integratie
- Er is geen mechanisme om conflicten tussen module-bevoegdheden en object-rechten op te lossen

### 6. Regressierisico's

- Iemand die vertrouwt op de beheerpagina om toegang te verlenen of te beperken, heeft een vals gevoel van controle: de rechten worden opgeslagen maar niet gehandhaafd
- Als `requireObjectRecht()` later wordt geactiveerd op bestaande routes, kan dat bestaande toegang blokkeren voor gebruikers die er nu ongehinderd bij kunnen (brekende wijziging)

### 7. Productiegereed voor kantooromgeving?

**Nee — Geïmplementeerd, niet Geïntegreerd.**

De infrastructuur is aanwezig en de beheerpagina werkt. Maar de kernbelofte — object-niveau toegangscontrole die wordt afgedwongen in de routes — is niet gerealiseerd. `requireObjectRecht()` is niet in gebruik. `workflowRechtenTable` heeft geen effect. De RBAC-laag functioneert als een administratieve UI zonder beveiligingseffect. Inzetten in een kantooromgeving zonder verdere integratie creëert een gevaarlijk vals gevoel van veiligheid.

---

## Opdracht 4 — Integriteitscontrole

**Eindbeoordeling: Ontworpen**

### 1. Wat exact is gebouwd

- Analyserapport `docs/integriteitscontrole.md` met bevindingen op:
  - Duplicaties (parallelle tabellen, dubbele logica)
  - Ontbrekende database-indexes
  - Transacties (multi-step writes zonder atomiciteit)
  - N+1-queryfenomenen
  - Informatielekkages (data die per ongeluk zichtbaar is)
  - Prioriteitenmatrix (hoog/gemiddeld/laag per bevinding)

### 2. Modules die nu daadwerkelijk gebruik maken van de bevindingen

Geen. Het rapport is een analyse; er zijn geen herstelacties uitgevoerd.

### 3. Modules die nog niet zijn gemigreerd

Alle bevindingen in het rapport staan nog open. Er is geen tracking of de geïdentificeerde issues zijn aangepakt.

### 4. Tijdelijke oplossingen en duplicaten

Het rapport zelf is de enige deliverable. Er zijn geen tussenoplossingen getroffen voor de geconstateerde kwetsbaarheden.

### 5. Bekende beperkingen

- Het rapport is een momentopname van 3 juli 2026; de codebase groeit, nieuwe code voegt mogelijk nieuwe integriteitsrisico's toe
- Er is geen mechanisme om bij te houden of een bevinding is opgelost (geen issue-tracker koppeling, geen status per punt)
- De prioriteitenmatrix is niet vertaald naar concrete herstelsprintplanning

### 6. Regressierisico's

- Alle geconstateerde risico's (ontbrekende indexes, niet-atomaire writes, N+1) bestaan nog steeds in productie
- Nieuwe modules die na de rapportdatum zijn gebouwd, vallen buiten de analyse

### 7. Productiegereed voor kantooromgeving?

**Niet van toepassing — Ontworpen.**

Dit is een analyserapport, geen implementatie. De bevindingen zijn nuttig als stuurinformatie voor technische schuld-afbouw, maar er is niets opgelost. De geconstateerde problemen (met name ontbrekende indexes en niet-atomaire multi-step writes) blijven actieve risico's in de draaiende applicatie.

---

## Opdracht 5 — Technische Schuld

**Eindbeoordeling: Ontworpen**

### 1. Wat exact is gebouwd

- Rapport `docs/technische-schuld.md` met Top 100 items, geordend in 9 categorieën en geprioriteerd op P1–P4, met een schatting van ~580 uur totale herstelarbeid.

### 2. Modules die nu daadwerkelijk gebruik maken van de bevindingen

Geen. Het rapport is een analyse; er zijn geen schulditems ingelost.

### 3. Modules die nog niet zijn gemigreerd

Alle 100 items staan nog open. Er is geen aantoonbaar verband tussen het rapport en code-aanpassingen na de rapportdatum.

### 4. Tijdelijke oplossingen en duplicaten

Geen — het rapport is de enige deliverable.

### 5. Bekende beperkingen

- De schatting van ~580 uur is een grove indicatie zonder onderbouwing per item
- P1-items zijn urgent maar niet gedefinieerd als release-blockers; er is geen harde koppeling aan een releasecriterium
- Het rapport noemt geen eigenaar per schulditem

### 6. Regressierisico's

- Alle P1- en P2-items blijven actieve risico's in de draaiende applicatie
- Elke nieuwe feature die op schuldig code wordt gebouwd, vergroot de schuld

### 7. Productiegereed voor kantooromgeving?

**Niet van toepassing — Ontworpen.**

Dit is een inventarisatierapport, geen implementatie. Waarde zit in de prioritering en de schatting — maar zolang geen enkel item aantoonbaar is opgepakt, heeft het rapport geen meetbare invloed op de technische kwaliteit van de applicatie.

---

## Samenvatting

| Opdracht | Status | Productie­gereed? | Harde release-blokkades |
|----------|--------|-------------------|------------------------|
| 1 — Workflow Engine | Geïntegreerd | Nee | Systeem-transitie ontbreekt; 12+ modules buiten engine |
| 2 — Audit Trail | Geïmplementeerd | Nee | Business-event logging ontbreekt in ~75 routes; duplicaten actief |
| 3 — RBAC | Geïmplementeerd | Nee | `requireObjectRecht()` in 0 productie-routes; rechten hebben geen effect |
| 4 — Integriteitscontrole | Ontworpen | n.v.t. | Alle bevindingen nog open |
| 5 — Technische Schuld | Ontworpen | n.v.t. | Alle P1/P2-items nog open |

**Geen van de vijf opdrachten is Productiegereed.** Opdracht 1 is het verst: de engine functioneert en is geïntegreerd in 6 routes. Opdrachten 2 en 3 zijn technisch werkend als geïsoleerde infrastructuur maar niet geïntegreerd in de beveiligings- en complianceketen. Opdrachten 4 en 5 zijn analysedocumenten zonder herstelacties.
