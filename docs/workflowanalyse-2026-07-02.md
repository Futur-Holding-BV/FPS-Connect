# Workflowanalyse — FPS Connect bedrijfsprocessen

**Status:** analyse, geen code gewijzigd  
**Datum:** 2026-07-02  
**Methode:** codebase-inspectie (DB-schema, OpenAPI-spec, frontend pagina-componenten)

---

## Leeswijzer

Per processtap:

| Symbool | Betekenis |
|---|---|
| **VOLLEDIG** | Data-koppeling en UI-overdracht zijn beide aanwezig; de gebruiker wordt actief begeleid |
| **GEDEELTELIJK** | FK-koppeling bestaat in het datamodel, maar de UI-overdracht is handmatig of indirect |
| **ONTBREEKT** | Geen FK-koppeling en geen UI-actie; beide modules zijn eilanden |

Handmatige overdracht = de gebruiker moet zelf navigeren naar een andere module, zonder dat het systeem hem/haar daarnaar toe leidt.

---

## Overzichtstabel

| # | Stap | Status | Handmatige overdracht |
|---|---|---|---|
| 1 | CRM → Project | **GEDEELTELIJK** | Ja |
| 2 | Project → Opname | **GEDEELTELIJK** | Ja |
| 3 | Opname → Calculatie | **GEDEELTELIJK** | Ja (indirect via spots) |
| 4 | Calculatie → Offerte | **GEDEELTELIJK** | Ja |
| 5 | Offerte → Opdracht | **VOLLEDIG** | Nee |
| 6 | Opdracht → Werkvoorbereiding | **GEDEELTELIJK** | Gedeeltelijk |
| 7 | Werkvoorbereiding → Inkoop | **GEDEELTELIJK** | Ja |
| 8 | Inkoop → Magazijn | **GEDEELTELIJK** | Ja |
| 9 | Magazijn → Uitvoering | **ONTBREEKT** | n.v.t. (module in aanbouw) |
| 10 | Uitvoering → Oplevering | **ONTBREEKT** | n.v.t. (module in aanbouw) |
| 11 | Oplevering → Onderhoud | **ONTBREEKT** | Ja (volledig handmatig) |
| 12 | Onderhoud → Financieel | **GEDEELTELIJK** | Ja |

**Samenvatting:** 1 stap volledig automatisch begeleid, 7 stappen gedeeltelijk, 4 stappen ontbreken of zijn in aanbouw.

---

## Stap 1 — CRM → Project

### Databinding

```
crm_commercieel
  ├── klant_id     → crm_klanten (verplicht)
  ├── gebouw_id    → gebouwen (optioneel, nullable)
  └── fase         → KANS_FASEN statusmachine
```

**CRM-fasemachine:** `signaal` → `eerste_contact` → `afspraak` → `opname` → `calculatie` → `offerte` → `onderhandeling` → `gewonnen` | `verloren`

De fase "gewonnen" is een eindstatus in de CRM-tabel; er is geen automatische projectcreatie.

### UI-acties

In `crm/detail.tsx` bestaat een `Select`-component waarmee een projectkans handmatig wordt gekoppeld aan een bestaand gebouw (`gebouw_id`). Er is geen "Maak project aan"-knop. Als een kans wordt gewonnen, wordt het gebouw niet automatisch aangemaakt of naar een projectstatus gebracht.

### Status: GEDEELTELIJK

**Wat werkt:** een gewonnen kans kan worden gekoppeld aan een bestaand gebouw; de FK bestaat.  
**Wat ontbreekt:** bij een gewonnen kans waaraan nog geen gebouw hangt, is er geen "Maak project aan"-actie. De gebruiker navigeert handmatig naar Projecten en maakt een nieuw gebouw aan, waarna de CRM-koppeling teruggelegd kan worden.

**Handmatige overdracht:** de gebruiker registreert "Gewonnen" in CRM, verlaat de CRM-module, navigeert naar Projecten (`/gebouwen`), maakt een nieuw gebouw aan en herinnert zichzelf dat de CRM-kans nog gekoppeld moet worden.

---

## Stap 2 — Project → Opname

### Databinding

```
opnames
  ├── gebouw_id    → gebouwen (verplicht)
  └── status       → tekst (geen statusmachine zichtbaar)
```

`opnames` is volledig gebouw-centric: elke opname behoort bij één gebouw.

### UI-acties

De Opname-module (`/opname`) toont een lijst van opnames gefilterd op status. Vanuit een gebouwdetail (`/gebouwen/:id`) is geen bevestigde "Nieuwe opname"-knop gevonden. De gebruiker navigeert zelf naar `/opname` en maakt een nieuwe opname aan met een gebouw-keuze.

### Status: GEDEELTELIJK

**Wat werkt:** FK-koppeling opname.gebouw_id bestaat.  
**Wat ontbreekt:** vanuit het project (gebouwdetail) is er geen directe actieknop "Start opname". De opname wordt in de Opname-module aangemaakt en het gebouw wordt daar geselecteerd.

**Handmatige overdracht:** gebruiker verlaat het gebouwdetail, navigeert naar `/opname`, kiest het juiste gebouw in de opname-aanmaakstroom.

---

## Stap 3 — Opname → Calculatie

### Databinding

```
opnames
  └── gebouw_id  → gebouwen

mod_calc_headers
  └── gebouw_id  → gebouwen

-- Geen directe FK opnames.id → mod_calc_headers.id
-- Koppeling loopt indirect via het gemeenschappelijke gebouw_id
```

`mod_calc_headers` heeft géén `opname_id`. De calculatie weet niet van welke opname hij afstamt.

### UI-acties

1. In `opname/detail.tsx` staat een knop **"Spots aanmaken"** die alle opname-items omzet naar concept-spots in het gekoppelde gebouw.
2. Vanuit `gebouwen/detail.tsx` is een knop **"Nieuwe calculatie"** beschikbaar.
3. De calculatie haalt zijn regels op uit de artikelencatalogus, niet direct uit de opname.

De overdrachtsstroom is dus: opname-items → spots (via knop) → calculatieregels handmatig invullen vanuit artikelencatalogus.

### Status: GEDEELTELIJK

**Wat werkt:** "Spots aanmaken" brengt opname-bevindingen naar het gebouw als spots. Er is een calculatie-module die aan hetzelfde gebouw hangt.  
**Wat ontbreekt:** directe import van opname-items als calculatieregels. Er is geen "Maak calculatie van deze opname"-knop. De calculator moet de spots raadplegen en de calculatieregels handmatig aanmaken op basis van de opname-bevindingen.  
**Bijkomend probleem:** de calculatie-module staat standaard uit achter de feature flag `VITE_FEATURE_CALCULATIE=false`. In de pilotomgeving is calculatie uitgeschakeld.

**Handmatige overdracht:** na "Spots aanmaken" verlaat de gebruiker de opname, navigeert naar het gebouw, en start daarvandaan de calculatie.

---

## Stap 4 — Calculatie → Offerte

### Databinding

```
offertes
  ├── gebouw_id       → gebouwen
  ├── klant_id        → crm_klanten
  └── calculatie_id   → mod_calc_headers (koppeling)
```

`calculatie_id` op de offerte bestaat in het datamodel. De offerte kent zijn calculatie.

### UI-acties

In de Offerte-module (`/offertes`) bestaat een knop **"Uit spots"** die offerteregels genereert op basis van de spots van een gebouw. Er is geen bevestigde **"Maak offerte van calculatie"**-knop in het calculatiedetail. De gebruiker maakt een nieuwe offerte aan via de Offerte-module, kiest het gebouw, en synchroniseert regels via "Uit spots".

De `calculatie_id`-koppeling wordt gezet, maar vermoedelijk handmatig bij het aanmaken van de offerte of via een keuze in de offerte-wizard.

### Status: GEDEELTELIJK

**Wat werkt:** FK `calculatie_id` op offerte bestaat. Offerte-module kan regels importeren vanuit spots ("Uit spots").  
**Wat ontbreekt:** vanuit de calculatie-module is er geen directe "Maak offerte"-knop die de berekende waarden overneemt. De gebruiker navigeert zelf naar de Offerte-module.  
**Bijkomend:** omdat calculatie standaard uitgeschakeld is (feature flag), is in de praktijk de stroom Opname → Offerte (zonder tussenliggende calculatiemodule) de gebruikelijke route.

**Handmatige overdracht:** gebruiker verlaat de calculatie, navigeert naar `/offertes`, maakt een nieuwe offerte en koppelt deze handmatig aan de calculatie via een selectie.

---

## Stap 5 — Offerte → Opdracht

### Databinding

```
opdrachten
  ├── offerte_id      → offertes (koppeling)
  ├── calculatie_id   → mod_calc_headers
  └── gebouw_id       → gebouwen

-- Bij aanmaken opdracht wordt automatisch een project_begrotingen aangemaakt
-- (werkbegroting zonder opslagen, voor inkoop en planning)
```

Bij het aanmaken van een opdracht wordt automatisch een werkbegroting afgeleid.

### UI-acties

In `offertes/studio.tsx` staat een prominente knop **"Maak opdracht"** (icoon: Hammer). Deze knop:
1. Triggert de `useCreateOpdracht`-mutatie.
2. Legt `offerte_id` vast op de nieuwe opdracht.
3. Maakt automatisch een `project_begrotingen`-record aan.
4. Stuurt de gebruiker door naar het opdracht-detailscherm (`/opdrachten/:id`).

Offerte-statusmachine: `concept` → `verzonden` → `akkoord` | `afgewezen` | `vervallen`. De knop "Maak opdracht" is waarschijnlijk alleen zichtbaar/klikbaar bij status `akkoord`.

### Status: VOLLEDIG

**Wat werkt:** volledige geautomatiseerde overdracht. De knop "Maak opdracht" maakt de opdracht aan, legt alle FKs vast, maakt een werkbegroting, en navigeert de gebruiker direct naar de opdracht. De statusmachine van de offerte wordt meegenomen.  
**Geen handmatige overdracht:** gebruiker klikt één knop in de offerte-studio.

---

## Stap 6 — Opdracht → Werkvoorbereiding

### Databinding

```
inkoopplannen
  └── opdracht_id  → opdrachten

planning_items
  └── opdracht_id  → opdrachten
  └── gebouw_id    → gebouwen
  └── medewerker_id → gebruikers
```

De Werkvoorbereiding-module (`/werkvoorbereiding`) is feitelijk een dashboard dat actieve opdrachten weergeeft met hun voorbereiding- en planningstatus.

### UI-acties

1. Na aanmaken van een opdracht verschijnt deze automatisch in het Werkvoorbereiding-dashboard.
2. Het opdracht-detailscherm heeft een **"Inkoopplanning"**-tab met de `InkoopplanningTab`-component.
3. Vanuit de Inkoopplanning-tab kan de gebruiker inkoopbonnen aanmaken, AI laat leveranciers per regel groeperen.

### Status: GEDEELTELIJK

**Wat werkt:** de opdracht verschijnt automatisch in het Werkvoorbereiding-dashboard (geen handeling vereist). De Inkoopplanning is geïntegreerd in het opdracht-detail.  
**Wat ontbreekt:** er is geen expliciete statusovergang "Werkvoorbereiding gestart" of "Werkvoorbereiding afgerond" op de opdracht. De gebruiker ziet alle actieve opdrachten op het dashboard, maar er is geen formele toestandsovergang of vrijgavehandeling die het begin van de werkvoorbereiding markeert.

**Gedeeltelijk handmatig:** opdracht verschijnt automatisch op het dashboard; de daadwerkelijke voorbereiding (inkoopplannen aanmaken, goedkeuren) is handmatig.

---

## Stap 7 — Werkvoorbereiding → Inkoop

### Databinding

```
inkoopplannen
  └── opdracht_id  → opdrachten

inkoopplan_regels
  ├── werkbegroting_regel_id → project_begrotingen_regels
  └── besteldatum, geleverd (statustekst)

inkoopbonnen
  ├── leverancier_id → leveranciers
  └── status: concept → goedgekeurd → besteld → geleverd
```

De Inkoop-module (`/leveranciers`, `/artikelen`) is een **catalogus** — leveranciersgegevens en artikeldefinities. De Inkoopbonnen (operationele inkooporders) leven in de Werkvoorbereiding-context (bij de opdracht), niet in de Inkoop-module.

### UI-acties

In de `InkoopplanningTab` van het opdracht-detail:
- **"Nieuwe inkoopbon"** maakt een inkooporder aan voor een geselecteerde leverancier.
- AI groepeert inkoopplanregels per leverancier en stelt inkoopbonnen voor.
- Status van inkoopbonnen: `concept` → `goedgekeurd` → `besteld` → `geleverd`.

De Inkoop-catalogusmodule (`/leveranciers`) heeft geen eigen "Bestelling aanmaken"-scherm; alle operationele inkoop verloopt via de opdracht.

### Status: GEDEELTELIJK

**Wat werkt:** inkoopbonnen worden aangemaakt vanuit de inkoopplanning met een directe `leverancier_id`-koppeling. AI-ondersteuning bij groepering.  
**Wat ontbreekt:** de Inkoop-catalogusmodule (`/leveranciers`, `/artikelen`) en de operationele inkoopstroom zijn gescheiden. Een inkoopmedewerker die alleen `/leveranciers` bekijkt, ziet geen openstaande inkooporders. De purchase-to-pay-cyclus is niet gecentraliseerd in één Inkoop-module — ze zit verspreid over Opdracht/Werkvoorbereiding.

**Handmatige overdracht:** inkoopcoördinator navigeert zelf naar de juiste opdracht om de inkoopbon aan te maken.

---

## Stap 8 — Inkoop → Magazijn

### Databinding

```
inkoopbonnen
  └── status: besteld → geleverd

voorraad_mutaties
  ├── referentie_type ('inkoopbon' | 'uitgifte' | 'retour')
  ├── referentie_id   → inkoopbonnen.id (bij type = inkoopbon)
  └── artikel_id      → artikelen
```

Wanneer een inkoopbon de status `geleverd` krijgt, zijn er `voorraad_mutaties`-records nodig om de magazijnvoorraad bij te werken.

### UI-acties

Er is een statusovergang `besteld` → `geleverd` op inkoopbonnen. Of deze statusovergang **automatisch** een `voorraad_mutatie` aanmaakt (server-side trigger), of dat de magazijnmedewerker separaat een ontvangstboeking moet doen in de Magazijn-module, kon niet definitief worden vastgesteld op basis van de beschikbare UI-analyse.

Het Magazijn heeft een **Mutaties**-scherm (`/magazijn/mutaties`) en een **Stellingscans**-module (`/magazijn/stellingscans`) voor barcode-/QR-registratie van ontvangst.

### Status: GEDEELTELIJK

**Wat werkt:** `voorraad_mutaties` heeft een `referentie_id` → `inkoopbonnen`-koppeling; de datastructuur is gereed voor automatische magazijnboekingen.  
**Wat ontbreekt (vermoedelijk):** de UI voor "Ontvangen en inboeken in magazijn" bij een inkoopbon is niet bevestigd als één geïntegreerde actie. De kans bestaat dat de magazijnmedewerker apart een ontvangstboeking doet in de Magazijn-module (handmatige dubbelstap).

**Handmatige overdracht:** inkoopmedewerker markeert inkoopbon als `geleverd`; magazijnmedewerker boekt de ontvangst in de Magazijn-module.

---

## Stap 9 — Magazijn → Uitvoering

### Databinding

```
reserveringen
  ├── artikel_id   → artikelen
  └── opdracht_id  → opdrachten   (materiaal gereserveerd voor opdracht)

-- Uitvoering-module bestaat nog niet als databron
-- planning_items
--   └── opdracht_id → opdrachten  (toewijzing medewerker aan opdracht)
```

De **Uitvoering**-module (`/uitvoering`) is in de navigatie aanwezig maar **uitgeschakeld** (InUitvoering badge, disabled knop). Er is geen tabel of route die dag-tot-dag uitvoeringsregistratie vastlegt (voortgang per spot, verbruikt materiaal per opdracht, tijdregistratie per dag op locatie).

### UI-acties

Materiaaluitgifte: de Magazijn-module heeft `/magazijn/uitgiftes` (materiaal uitgeven aan een opdracht). Na uitgifte heeft de opdracht de benodigde materialen, maar er is geen koppeling naar een uitvoeringsmodule die bijhoudt wat er mee is gedaan.

### Status: ONTBREEKT

**Wat werkt:** materiaal kan worden gereserveerd en uitgegeven aan een opdracht. Planning-items koppelen medewerkers aan opdrachten.  
**Wat ontbreekt:** een Uitvoering-module die bijhoudt hoe ver het werk is, welk materiaal verbruikt is, welke spots zijn afgewerkt, en wanneer de opdracht gereed is. De koppeling Magazijn-uitgifte → Uitvoeringsregistratie bestaat niet.  
**Impact:** zonder uitvoeringsregistratie kan het systeem niet automatisch signaleren wanneer een opdracht "gereed" is voor oplevering.

---

## Stap 10 — Uitvoering → Oplevering

### Databinding

```
opleverrapporten
  └── gebouw_id  → gebouwen   (opgeleverd gebouw)

-- Geen FK uitvoering_id of planning_item_id op opleverrapporten
-- De formele V1.4-opleverrapportage is in aanbouw
```

De huidige opleverrapportage (`/rapporten`, `print.tsx`) is een **live weergave** van de actuele spotstatus per gebouw — geen formeel gesloten document.

### UI-acties

Vanuit het Werkvoorbereiding-dashboard of het gebouwdetail kan een gebruiker navigeren naar de rapportageweergave. Er is geen "Markeer opdracht als voltooid" → "Start oplevering"-knop-combinatie. De Opleverrapportage is beschikbaar op elk moment tijdens het project, niet pas na voltooiing.

V1.4 (in aanbouw): voegt toe: voorblad, spotselectie, e-mailselectie, bijlagenpakket, definitief maken. Maar de trigger vanuit de Uitvoering-module bestaat nog niet.

### Status: ONTBREEKT

**Wat werkt:** de live-rapportageweergave (`print.tsx`) bestaat en toont de actuele staat van spots.  
**Wat ontbreekt:** (a) de Uitvoering-module zelf — stap 9 blokkeer deze stap; (b) een formele statusovergang "Uitvoering gereed" → "Start oplevering"; (c) V1.4 opleverrapportage met definitief-makenstap is in aanbouw.

---

## Stap 11 — Oplevering → Onderhoud

### Databinding

```
onderhoudscontracten
  └── gebouw_id  → gebouwen   (onderhoud voor gebouw)

werkbonnen
  └── contract_id → onderhoudscontracten

-- Geen FK opleverrapport_id op onderhoudscontracten
-- Geen automatische overgang "opgeleverd → start onderhoud"
```

### UI-acties

In `rapporten/index.tsx` is geen knop gevonden voor "Maak onderhoudscontract" of "Start onderhoud". Het gebouwdetail toont `gebouw.stats?.in_onderhoud` (teller), maar dat is een leesweergave, geen actie-trigger. Het aanmaken van een onderhoudscontract verloopt volledig via de Onderhoud-module (`/onderhoud`), waar het gebouw opnieuw geselecteerd wordt.

### Status: ONTBREEKT

**Wat werkt:** Onderhoud heeft een volwaardige contractstructuur (`onderhoudscontracten` → `werkbonnen`) gekoppeld aan het gebouw.  
**Wat ontbreekt:** na oplevering is er geen automatische of geassisteerde overgang naar onderhoud. De gebruiker moet:
1. De oplevering als voltooid beschouwen (in het systeem niet formeel vastgelegd).
2. Zelf naar de Onderhoud-module navigeren.
3. Handmatig een nieuw onderhoudscontract aanmaken voor hetzelfde gebouw.
4. Handmatig de startdatum, contractvorm en SLA invullen.

Dit is de meest complete handmatige overdrachtsstap in de volledige keten.

**Handmatige overdracht:** volledig. Vier afzonderlijke handmatige stappen zonder enige systeembegeleiding vanuit de oplevering.

---

## Stap 12 — Onderhoud → Financieel

### Databinding

```
werkbonnen
  └── contract_id → onderhoudscontracten → gebouw_id

facturen
  ├── gebouw_id    → gebouwen
  ├── project_id   → projecten (optioneel)
  └── leverancier_id → leveranciers  (inkoop/crediteuren)

-- Geen bevestigde directe FK werkbon_id → factuur_id
-- Koppeling is via gemeenschappelijk gebouw_id
```

### UI-acties

De Facturen-module heeft een **"Klaar voor export"**-weergave (`/facturen/klaar-voor-export`) die facturen klaarzet voor verzending naar AccountView. Facturen worden aangemaakt via:
1. **Crediteuren inbox** (`/financieel/crediteuren`) — inkomende facturen van leveranciers, verwerkt via AI-mailparsing.
2. **Handmatig** aanmaken vanuit de Facturen-module.

Een "Factureer werkbon"-knop in het onderhoud-detailscherm is **niet** aangetroffen. Het onderhoud-detailscherm beheert werkbonnen, maar koppelt niet direct terug naar de facturatiemodule.

### Status: GEDEELTELIJK

**Wat werkt:** Facturen en Onderhoud zijn beiden gebouw-gebonden (dezelfde `gebouw_id`). De crediteuren-inbox verwerkt inkomende leveranciersfacturen met AI. AccountView-exportflow is gebouwd (klaar-voor-export + exportlog + SEPA).  
**Wat ontbreekt:** directe debiteuren-facturering vanuit een afgesloten werkbon. De keten "werkbon gereed → factuurregel aanmaken → factuur verzenden aan klant" is niet geautomatiseerd. Een financieel medewerker maakt de factuur handmatig aan op basis van werkbongegevens.  
**Bijkomend:** de koppeling werkt beter voor inkomende facturen (crediteuren, van leveranciers) dan voor uitgaande facturen (debiteuren, aan klanten voor onderhoud).

**Handmatige overdracht:** financieel medewerker raadpleegt de werkbonnen in de Onderhoud-module, stelt op basis daarvan handmatig een debiteuren-factuur op in de Facturen-module.

---

## Handmatige overdrachten — samenvatting

De volgende procesgrenzen vereisen een handmatige handeling van de gebruiker, zonder systeemgeleiding:

| # | Overdrachtspunt | Vereiste handmatige stappen |
|---|---|---|
| 1 | CRM Gewonnen → Project aanmaken | Navigeer naar `/gebouwen`, maak nieuw gebouw aan, koppel terug aan CRM-kans |
| 2 | Project → Opname starten | Navigeer naar `/opname`, maak nieuwe opname aan, selecteer gebouw |
| 3 | Opname → Calculatie starten | Klik "Spots aanmaken" in opname, navigeer naar gebouw, start calculatie |
| 4 | Calculatie → Offerte aanmaken | Navigeer naar `/offertes`, maak nieuwe offerte aan, koppel calculatie handmatig |
| 5 | **Offerte → Opdracht** | **Geen handmatige stap** — knop "Maak opdracht" begeleidt volledig |
| 6 | Opdracht verschijnt in Werkvoorbereiding | Automatisch; inkoopplanning aanmaken is handmatig in opdracht-tab |
| 7 | Inkoopbon besteld → Magazijn ontvangst | Statusovergang `geleverd` op bon; ontvangstboeking in Magazijn vermoedelijk separaat |
| 8 | Magazijn uitgifte → Uitvoeringsstart | Niet van toepassing — Uitvoering-module bestaat nog niet |
| 9 | Uitvoering gereed → Oplevering starten | Niet van toepassing — Uitvoering-module bestaat nog niet |
| 10 | Oplevering → Onderhoudscontract | Navigeer naar `/onderhoud`, maak nieuw contract aan, vul alle gegevens handmatig in |
| 11 | Werkbon afgerond → Factuur aanmaken | Navigeer naar `/facturen`, maak debiteuren-factuur handmatig aan o.b.v. werkbongegevens |

---

## Aanvullende observaties

### A. De "Planning"-stap ontbreekt in het overzicht

Tussen Werkvoorbereiding en Uitvoering zit een essentiële stap: **Planning** (wie voert wanneer welke opdracht uit). De planning-module (`/modules/planning`) is aanwezig en heeft `planning_items` met `opdracht_id` en `medewerker_id`. Deze stap is echter niet expliciet opgenomen in de 12 te controleren stappen. Conclusie: gedeeltelijk — planning_items bestaan, maar de overgang "planning vastgesteld → start uitvoering" is niet begeleid.

### B. Snagstream als kwaliteitsgate

De Snagstream-module (`/snagstream`) is een AI-fotoarchief voor spotafwerking. Het zou logisch inpasbaar zijn als kwaliteitscheck **tussen Uitvoering en Oplevering** (alle spots gecontroleerd → oplevering kan starten). Deze positie in de workflow is nog niet geïmplementeerd.

### C. Dossier als juridisch opleverdossier

De Dossiermodule (`/dossiers`) heeft een `concept → definitief → gearchiveerd`-statusmachine. Het definitieve dossier bevriest alle gekoppelde documenten. Dit dossier zou de formele juridische afsluiting van de Oplevering moeten zijn (V1.5, in aanbouw). De koppeling oplevering → dossier-bevriezing is nog niet gebouwd.

### D. Factuurmodule is crediteuren-sterk, debiteuren-zwak

De Facturen-module heeft robuuste AI-verwerking van inkomende leveranciersfacturen (crediteuren), maar mist een gestructureerde debiteuren-workflow. Facturen aan klanten (voor opgeleverde projecten, onderhoud) worden handmatig aangemaakt. De koppeling `klant → offerte → opdracht → factuur` is datamatig beschikbaar maar UI-matig niet als end-to-end flow gebouwd.

### E. Feature flags als workflow-blokkade

Twee modules staan standaard uit:
- `VITE_FEATURE_CALCULATIE=false` — de Calculatie-module is uitgeschakeld in de pilotomgeving. Dit betekent dat stap 3 (Opname → Calculatie) en stap 4 (Calculatie → Offerte) in de pilot omzeild worden: gebruikers gaan direct van Opname naar Offerte via "Uit spots".
- `VITE_FEATURE_PLANNING=true` — Planning staat aan; dit ondersteunt de interne planningsoverdracht bij stap 6/9.

---

## Prioriteitsvolgorde voor het dichten van de gaps

| Prioriteit | Gap | Impact | Afhankelijkheid |
|---|---|---|---|
| 1 | Uitvoering-module bouwen (stap 9) | Kritisch — blokkeert stap 10 | V1.3 (spots gebouwd als basis) |
| 2 | Oplevering formaliseren — V1.4 (stap 10) | Hoog — juridisch sluitpunt van het project | Uitvoering-module |
| 3 | Oplevering → Onderhoud overdracht (stap 11) | Hoog — verlies van continuïteit na oplevering | V1.4 |
| 4 | Onderhoud → Factuur (debiteuren, stap 12) | Hoog — directe omzetimpact | Onderhoud stabiel |
| 5 | CRM Gewonnen → Project aanmaken (stap 1) | Middel — gebruiksvriendelijkheid | CRM al gebouwd |
| 6 | Inkoop → Magazijn ontvangstboeking (stap 8) | Middel — voorkomt dubbele handelingen | Magazijn stabiel |
| 7 | Calculatie → Offerte directe overdracht (stap 4) | Laag (calculatie staat uit in pilot) | Calculatie-module active |

---

*Analyse gebaseerd op: `lib/db/src/schema/index.ts`, `lib/api-spec/openapi.yaml`, `artifacts/firevault/src/pages/` (crm/detail, opname/detail, offertes/studio, opdrachten/detail, werkvoorbereiding/index, magazijn/*, rapporten/index, onderhoud/*). Geen code gewijzigd.*
