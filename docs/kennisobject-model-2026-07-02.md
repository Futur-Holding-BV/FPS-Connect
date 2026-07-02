# Kennisobject-model FPS Connect

**Status:** ontwerp, geen code gewijzigd  
**Datum:** 2026-07-02  
**Scope:** Volledig uitgewerkt kennisobject-model. Een document is grondstof; kennis is het eindproduct.

---

## Het centrale principe

Een document bestaat om kennis te leveren, niet om bewaard te worden.

Een productsheet vertelt niet alleen dat er een PDF bestaat. Hij vertelt wie het product maakt, wat het kan, voor welke situaties het is gecertificeerd, en in welke gebouwen het al is verwerkt. Pas als die kennis is geëxtraheerd, benoemd en gekoppeld, begint de waarde.

Het kennisobject-model beschrijft welke kenniseenheden FPS Connect herkent, hoe ze worden gevuld, wat ze met elkaar verbinden, en hoe AI over die verbanden redeneert.

---

## Architectuur in vier lagen

```
┌─────────────────────────────────────────────────────────────────┐
│  Laag 0 — Bronmateriaal                                         │
│  Documenten: PDF's + metadata in de centrale bibliotheek         │
└──────────────────────────┬──────────────────────────────────────┘
                           │ AI-extractie + menselijke validatie
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  Laag 1 — Kern-kennisobjecten                                   │
│  Fabrikant · Product · Norm · Prestatie · Certificaat           │
│  Toepassing (product + norm + installatieconditie samengebracht) │
└──────────────────────────┬──────────────────────────────────────┘
                           │ koppeling bij uitvoering
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  Laag 2 — Contextuele kennisobjecten                            │
│  Installatie · Gebouw/Project · Inspectie/Beoordeling           │
└──────────────────────────┬──────────────────────────────────────┘
                           │ AI-redenering over de kennisgraaf
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  Laag 3 — Afgeleide kennis                                      │
│  Toepassingsadvies · Risicomelding · Kennisgraaf (AI-redeneert) │
└─────────────────────────────────────────────────────────────────┘
```

---

## Laag 0 — Bronmateriaal

Documenten zijn grondstof. Ze worden niet geconsumeerd; ze leveren. Elk document in de centrale bibliotheek is de aanleiding voor het aanmaken, bevestigen of aanvullen van één of meer kennisobjecten.

**Documenttypen en wat ze primair leveren:**

| Documenttype | Primaire kennisobjecten |
|---|---|
| ETA (European Technical Assessment) | Product, Prestaties, Norm |
| Testrapport | Prestaties, Norm, Toepassing |
| Classificatierapport | Prestaties, Norm |
| Productcertificaat | Certificaat, Product |
| DoP (Declaration of Performance) | Product, Prestaties, Norm |
| Verwerkingsvoorschrift | Toepassing (installatiecondities) |
| Productblad | Product, Fabrikant |
| Opleverrapport | Installatie (bevestiging uitgevoerde situatie) |

Een document is niet eigendom van één kennisobject. Een ETA levert tegelijk Productkennis, Prestatiegegevens, Normverwijzingen en onderbouwt indirect toepassingsbesluiten.

**Koppeling van document naar kennisobject:**

Elke documentrij kan via een `kennisobject_koppelingen`-tabel worden gekoppeld aan één of meer kennisobjecten, met de rol van die koppeling:

```
document_id  →  kennisobject_type  ·  kennisobject_id  ·  rol
1234             product              56                   onderbouwt
1234             norm                 3                    test_volgens
1234             certificaat          8                    is_bewijs_voor
```

---

## Laag 1 — Kern-kennisobjecten

### Kennisobject 1 — Fabrikant

**Definitie:** Een erkende fabrikant of leverancier van brandpreventieve producten. Elke toepassing en elk product is herleidbaar naar één fabrikant.

**Velden:**

| Veld | Type | Betekenis |
|---|---|---|
| id | integer PK | Stabiele identifier |
| naam | text | Handelsnaam (bron van waarheid bij rename) |
| land | text | ISO 3166-1 landcode (NL, DE, GB…) |
| website | text | URL |
| keuringsinstantie | text | Bijv. "BBA", "DIBt", "Kiwa" — instantie die hun producten keurt |
| actief | boolean | Wordt de fabrikant nog geleverd? |
| opmerkingen | text | Interne notities (geen eigendom van de fabrikant) |

**Reeds aanwezig:** `fabrikantenTable` bevat `id`, `naam`. Uitbreiding: `land`, `website`, `keuringsinstantie`, `actief`.

**Relaties:**

```
Fabrikant
  ├── heeft →  Producten (1:n)
  ├── heeft →  Certificaten (via producten, indirect)
  └── is_bron_van →  Documenten (productblad, ETA, DoP)
```

**AI-rol:** Fabrikant-herkenning bij document-upload. "Mulcol International BV" en "Mulcol" zijn dezelfde fabrikant — de AI lost dit op via naam-normalisatie vóór koppeling aan de fabrikantentabel.

**Signaleringen:**
- Fabrikant heeft geen actieve producten meer
- Alle certificaten van een fabrikant verlopen binnen 90 dagen
- Nieuwe ETA/DoP beschikbaar van deze fabrikant

---

### Kennisobject 2 — Product

**Definitie:** Een concreet, benoemd brandpreventief product dat door een fabrikant op de markt wordt gebracht. Een product kan in meerdere uitvoeringsvormen bestaan (maten, varianten).

**Velden:**

| Veld | Type | Betekenis |
|---|---|---|
| id | integer PK | Stabiele identifier |
| fabrikant_id | FK Fabrikant | Bron van waarheid voor de fabrikantskoppeling |
| naam | text | Productnaam (bijv. "Multicollar Slim", "CFS-C P") |
| productlijn | text | Overkoepelende lijn (bijv. "Mulcol Multicollar") |
| artikelnummer | text | Fabrikants-SKU of artikelcode |
| categorie | text | Bijv. "manchet", "doorvoermortel", "brandwerende coating" |
| omschrijving | text | Korte functionele omschrijving |
| product_foto_url | text | Erkende productfoto (door beheerder bevestigd) |
| status | enum | actief / afgeschaft / vervangen_door |
| vervangen_door_id | FK Product | Als afgeschaft: welk nieuwer product? |
| ai_voorstel_status | enum | geen / voorstel / bevestigd | 
| aangemaaktOp / bijgewerktOp | timestamp | Standaard |

**Reeds aanwezig:** `labelsTable` (Toepassingen) bevat naam, fabrikant, fabrikantId, productFotoUrl. De label is nu tegelijk product én toepassing. Het kennisobject-model trekt die twee uit elkaar: Product = het ding, Toepassing = het gecertificeerde gebruik van het ding.

**Relaties:**

```
Product
  ├── gemaakt_door →  Fabrikant (n:1)
  ├── heeft →  Prestaties (1:n) — per testrapport, per installatieconditie
  ├── heeft →  Certificaten (1:n)
  ├── onderbouwd_door →  Documenten (n:m) — via kennisobject_koppelingen
  ├── toegepast_in →  Toepassingen (1:n)
  └── verwerkt_als →  Installaties (via toepassingen, indirect)
```

**AI-rol:** Bij upload van een productblad of ETA levert de AI een Product-voorstel: naam, fabrikant, categorie, artikelnummer, omschrijving. Een beheerder bevestigt of corrigeert. Na bevestiging is het product een stabiel kennisobject.

**Productfoto:** De bestaande `productFotoUrl`/`productFotoBron`/`productFotoGeverifieerd`-logica op labels wordt overgenomen op het Product-kennisobject. AI stelt voor (`bron = 'ai'`), beheerder bevestigt (`geverifieerd = true`).

---

### Kennisobject 3 — Norm

**Definitie:** Een genormeerde specificatie, Europese technische beoordeling (ETAG) of testmethode waaraan een product of systeem wordt getoetst.

**Velden:**

| Veld | Type | Betekenis |
|---|---|---|
| id | integer PK | Stabiele identifier |
| code | text | Bijv. "EN 1366-3", "EN 13501-2", "ETAG 026" |
| versie | text | Jaargetal of versie-aanduiding (bijv. "2009+A1:2015") |
| naam | text | Leesbare naam (bijv. "Brandweerstand van leidingdoorvoersystemen") |
| type | enum | EN-norm / ETAG / NEN / ISO / nationaal |
| beherende_instantie | text | CEN, NEN, DIBt, etc. |
| publicatiedatum | date | Datum van publicatie of herziening |
| actief | boolean | Nog geldig of ingetrokken? |
| opvolger_id | FK Norm | Als herzien: welke norm volgt op? |

**Reeds aanwezig:** Normen bestaan nu als vrije tekstvelden (`en_norm` op documenten, `testnorm` op labels). Het kennisobject-model maakt er een beheerde entiteit van zodat één norm-entiteit verbinding legt tussen alle documenten en producten die eraan refereren.

**Relaties:**

```
Norm
  ├── is_testmethode_voor →  Prestaties (1:n)
  ├── is_grondslag_voor →  Certificaten (1:n)
  ├── geciteerd_in →  Documenten (n:m via kennisobject_koppelingen)
  └── opgevolgd_door →  Norm (0:1)
```

**AI-rol:** Norm-herkenning bij document-upload. "EN 1366-3:2009" en "EN 1366-3" worden herkend als dezelfde norm. AI signaleert als een geciteerde norm is herzien na de documentdatum.

---

### Kennisobject 4 — Prestatie

**Definitie:** Een gecertificeerd prestatiegegeven van een Product onder specifieke installatiecondities, getest volgens een Norm. Een Prestatie is de meest gedetailleerde kennisnuance: hetzelfde product kan EI 60 bieden in een wand en slechts EI 30 in een plafond, bij vaste kabel maar niet bij pijpleidingen.

**Velden:**

| Veld | Type | Betekenis |
|---|---|---|
| id | integer PK | Stabiele identifier |
| product_id | FK Product | Welk product is getest? |
| norm_id | FK Norm | Getest volgens welke norm? |
| document_id | FK Document | Testrapport of ETA dat dit onderbouwt |
| brandwerendheidsklasse | text | Bijv. "EI 60", "EW 120", "EI 30" |
| getest_voor | enum | wand / plafond / beide |
| scheidingstype | enum | flexibel / rigide / beide / n.v.t. |
| max_opening_mm | integer | Maximale doorvoer-opening in mm (diameter of breedte×hoogte) |
| max_scheidingsdikte_mm | integer | Maximale scheidingsdikte in mm |
| min_scheidingsdikte_mm | integer | Minimale scheidingsdikte in mm |
| kabeltype | text | Vrije tekst: "isolatiemantel XLPE", "stalen buis", etc. |
| aanvullende_condities | text | Overige beperkingen uit het testrapport |
| ai_voorstel | boolean | Door AI voorgesteld, nog te bevestigen? |

**Reeds aanwezig:** Niet als entiteit. Brandwerendheid wordt nu afgeleid uit de testnorm op de label (vrije tekst). Installatiecondities zijn verspreid over spot-velden (`wandOfPlafond`, `classificatie`). De Prestatie brengt dit samen als gestructureerde kennis.

**Relaties:**

```
Prestatie
  ├── van →  Product (n:1)
  ├── getest_volgens →  Norm (n:1)
  ├── onderbouwd_door →  Document (testrapport/ETA) (n:1)
  └── toegestaan_in →  Toepassingen (via match op conditieset)
```

**AI-rol:** Prestatiegegevens worden geëxtraheerd uit het testrapport-PDF. De AI leest tabelwaarden en kondities. Een monteur die een spot registreert met wand=flexibel en diameter=63mm ziet automatisch welke Prestaties van toepassing zijn — gefilterd op die specificaties.

**Voorbeeld:**

| Product | Norm | Wand/Plafond | Type | Max. ø | Brandwerendheid |
|---|---|---|---|---|---|
| Multicollar Slim | EN 1366-3 | wand | flexibel | 160 mm | EI 120 |
| Multicollar Slim | EN 1366-3 | plafond | flexibel | 110 mm | EI 60 |
| CFS-C P | EN 1366-1 | wand | rigide | 250 mm | EI 60 |

---

### Kennisobject 5 — Certificaat

**Definitie:** Een formeel, tijdgebonden bewijs afgegeven door een onafhankelijke instantie dat een Product voldoet aan een Norm.

**Velden:**

| Veld | Type | Betekenis |
|---|---|---|
| id | integer PK | Stabiele identifier |
| product_id | FK Product | Gecertificeerd product |
| norm_id | FK Norm | Norm waaraan is getoetst |
| document_id | FK Document | Brondocument (productcertificaat of ETA) |
| certificaatnummer | text | Bijv. "ETA-11/0429", "KOMO BRL 1234" |
| certificerende_instantie | text | Kiwa, BDA, SKH, DIBt, CSTB, etc. |
| geldig_van | date | Afgiftedatum |
| geldig_tot | date | Vervaldatum (null = geen einddatum) |
| status | enum | geldig / verlopen / ingetrokken |

**Reeds aanwezig:** `documenten.geldig_tot` en `documenten.rapportnummer` zijn losse velden op documenten. Signaleringen lopen al op `geldig_tot`. Het kennisobject-model tilt dit naar een formele entiteit die aan Product en Norm is gekoppeld, zodat de vraag "Is er een geldig certificaat voor dit product?" direct beantwoordbaar is zonder tekstanalyse.

**Relaties:**

```
Certificaat
  ├── voor →  Product (n:1)
  ├── gebaseerd_op →  Norm (n:1)
  └── bewezen_door →  Document (productcertificaat/ETA) (n:1)
```

**Signaleringen (automatisch, AI-laag):**
- Certificaat verloopt binnen 90 dagen: amber melding
- Certificaat verlopen en product actief in gebouwen: rode melding
- Certificaat ingetrokken en product actief: kritieke melding (blokkering nieuwe spots)

---

### Kennisobject 6 — Toepassing

**Definitie:** De gecertificeerde combinatie van een Product, een installatieconditie en een Prestatie. Een Toepassing is de goedkeuringseenheid: het antwoord op de vraag "Mag ik dit product hier gebruiken?"

De Toepassing is het bestaande `labels`-concept, maar nu volledig uitgewerkt als kennisobject met expliciete relaties naar Product, Norm en Prestatie.

**Velden:**

| Veld | Type | Betekenis |
|---|---|---|
| id | integer PK | Stabiele identifier (opvolger van label.id) |
| product_id | FK Product | Welk product wordt toegepast? |
| applicatie_codes | text[] | Snagstream-codes: voor welke spot-types is dit geldig? |
| prestatie_id | FK Prestatie | Welke gecertificeerde prestatie geldt hier? |
| naam | text | Leesbare naam (bijv. "Mulcol Multicollar Slim ø63 EI120 wand") |
| installatiehandleiding_url | text | Verwerkingsvoorschrift als PDF |
| goedgekeurd | boolean | Intern goedgekeurd voor gebruik |
| gearchiveerd | boolean | Niet meer in te zetten bij nieuwe spots |

**Reeds aanwezig:** `labelsTable`. De huidige label heeft naam, fabrikant, testnorm, testrapportId, applicatie_codes, productFoto. De Toepassing als kennisobject voegt de expliciete Product-FK en Prestatie-FK toe, zodat de keten van spot → toepassing → prestatie → norm → document volledig traceerbaar is.

**Relaties:**

```
Toepassing
  ├── van_product →  Product (n:1)
  ├── bereikt_prestatie →  Prestatie (n:1)
  ├── geldig_voor →  Applicaties (spot-types) (n:m)
  ├── onderbouwd_door →  Documenten (n:m via kennisobject_koppelingen)
  └── toegepast_als →  Installaties (1:n)
```

**AI-rol:** Toepassingsadvies bij spot-aanmaak. Monteur vult in: type = "doorvoering", wand = flexibel, diameter = 63 mm → AI geeft top-3 geschikte Toepassingen op basis van Prestatie-match + beschikbaarheid certificaat + gebouwhistorie.

---

## Laag 2 — Contextuele kennisobjecten

### Kennisobject 7 — Installatie

**Definitie:** De feitelijke verwerking van een Toepassing op een specifieke locatie in een specifiek gebouw.

Dit is het bestaande `voorzieningenTable` (Spot). Het kennisobject-model voegt de expliciete Toepassing-koppeling toe als primaire kennisdrager, zodat elke installatie direct de route naar Product → Norm → Prestatie → Certificaat kan aflopen.

**Aanvullingen op bestaand model:**

| Veld | Type | Betekenis |
|---|---|---|
| toepassing_id | FK Toepassing | Primaire koppeling (naast de bestaande label-koppelingen) |
| prestatienorm_afwijking | text | Motivatie als de spot afwijkt van de toepassing-prestatie |
| installatie_foto_voor_id | FK Foto | Foto vóór installatie |
| installatie_foto_na_id | FK Foto | Foto ná installatie (bewijs van uitvoering) |

**Relaties:**

```
Installatie
  ├── van_toepassing →  Toepassing (n:1) ─→ Product, Prestatie, Norm
  ├── in_gebouw →  Gebouw (n:1)
  ├── in_verdieping →  Verdieping (n:1)
  ├── door_monteur →  Medewerker (n:1)
  ├── beoordeeld_door →  Inspecties (1:n)
  └── gekoppeld_aan →  Dossier (n:m via document_koppelingen)
```

**Kennisvraag die dit beantwoordt:** "In hoeveel gebouwen is Product X verwerkt, en wat is de huidige status van die installaties?"

---

### Kennisobject 8 — Gebouw / Project

**Definitie:** De fysieke locatie en het beheerproject waarbinnen Installaties vallen. Een Gebouw is tegelijk een locatie-entiteit en een projectcontainer.

**Aanvullingen op bestaand model:**

| Veld | Type | Betekenis |
|---|---|---|
| product_portfolio | computed | Alle unieke Producten die in dit gebouw zijn verwerkt |
| certificaat_status | computed | Hoeveel installaties in dit gebouw hebben een verlopen/ontbrekend certificaat |
| inspectie_status | computed | Percentage geïnspecteerde spots, datum laatste inspectie |

Deze computed-velden zijn geen DB-kolommen maar query-resultaten die in de kennisgraaf kunnen worden bevraagd.

**Kennisvraag die dit beantwoordt:** "Welke gebouwen gebruiken Product X, waarvan het certificaat dit jaar verloopt?"

---

### Kennisobject 9 — Inspectie / Beoordeling

**Definitie:** Een tijdgebonden, formele beoordeling van een Installatie of een Gebouw als geheel.

**Aanvullingen op bestaand model:**

| Veld | Type | Betekenis |
|---|---|---|
| bevindingen_gestructureerd | jsonb | Gestructureerde bevindingen per categorie (veiliger dan losse tekst) |
| toepassings_afwijking | boolean | Bevinding: installatie wijkt af van de gekoppelde toepassing |
| norm_conflict | boolean | Bevinding: norm waarop toepassing is gebaseerd is herzien |

**Relaties:**

```
Inspectie
  ├── van_installatie →  Installatie (n:1)
  └── of_gebouw →  Gebouw (n:1)
```

---

## Laag 3 — Afgeleide kennis

De derde laag is geen database-laag maar een redeneervermogen dat over de kennisgraf werkt. AI in Connect levert drie soorten afgeleide kennis.

### Toepassingsadvies

**Wat:** Gegeven een nieuwe spot-situatie (type, afmetingen, installatieconditie, gebouw), welke Toepassingen zijn geschikt?

**Hoe:** AI voert een Prestatie-match uit: filter Toepassingen op type, conditie, afmeting → rangschik op certificaatstatus, gebouwhistorie (eerder gebruikt in dit gebouw = hogere score), betrouwbaarheid testrapport.

**Output:**

```
Vraag: "Doorvoering, wand, flexibel, ø63 mm"
→ Toepassing A: Multicollar Slim ø63 (EI 120, wand/plafond, cert. geldig t/m 2027-03)  ★★★
→ Toepassing B: Rockwool Flexirock (EI 60, wand, cert. geldig t/m 2026-11)              ★★
→ Toepassing C: Hilti CFS-C (EI 90, wand, cert. ingetrokken → signalering)              ★ (!)
```

### Risicomelding

**Wat:** Proactieve signalering van risico's die voortkomen uit de kennisgraaf, niet uit één document.

**Soorten risico's:**

| Trigger | Melding |
|---|---|
| Certificaat verloopt ≤ 90 dagen | "X installaties in Y gebouwen hebben een product met een bijna-verlopen certificaat" |
| Norm herzien ná testdatum rapport | "Testrapport van Product A is ouder dan de herziening van EN 1366-3:2021 — controleer geldigheid" |
| Product afgeschaft, nog actief in gebouwen | "Product X is afgeschaft door fabrikant. Actief in N installaties over M gebouwen" |
| Installatie zonder gekoppelde toepassing | "Y spots missen een toepassing-koppeling — prestatiegarantie niet aantoonbaar" |
| Toepassing-afwijking op inspectie | "Inspectie van 2026-06-15 signaleerde afwijking van toepassing; spot is niet opnieuw beoordeeld" |

### Kennisgraaf-redenering

**Wat:** Verbanden leggen over de volledige graaf. Antwoorden geven op vragen die geen enkele afzonderlijke tabel kan beantwoorden.

**Voorbeeldvragen en hoe de graaf ze beantwoordt:**

| Vraag | Graftraversering |
|---|---|
| "Welke gebouwen zijn kwetsbaar als Mulcol de productlijn stopt?" | Fabrikant → Producten → Toepassingen → Installaties → Gebouwen |
| "Wat is het meest gebruikte product bij EI 60-eisen in projecten van klant X?" | Klant → Gebouwen → Installaties → Toepassingen → Prestaties (filter EI 60) → Product: count |
| "Zijn er toepassingen zonder geldige onderbouwing?" | Toepassingen → Certificaten: filter status=verlopen → Installaties: count actief |
| "Welke norm heeft de meeste open bevindingen op inspecties?" | Inspecties (toepassings_afwijking=true) → Toepassing → Prestatie → Norm: count |
| "Hoeveel installaties van type manchet hebben nooit een inspectie gehad?" | Installaties (type=manchet) LEFT JOIN Inspecties: WHERE inspectie IS NULL |

---

## De kennisobject-cyclus

Een document doorloopt een vaste cyclus voordat zijn kennis operationeel beschikbaar is.

```
1. UPLOAD
   ↓
   Gebruiker uploadt PDF in de Bibliotheek

2. AI-EXTRACTIE (asynchroon)
   ↓
   document-ai.ts extraheert: naam, fabrikant, product, norm, rapportnummer,
   revisie, datum, getest_voor, betrouwbaarheid
   ↓
   Chunk-indexer slaat vector-embeddings op (voor AI-zoeken)
   ↓
   Kennisobject-voorstellen worden aangemaakt:
   - Fabrikant-voorstel (match op naam in fabrikantenTable of nieuw)
   - Product-voorstel (match of nieuw)
   - Norm-voorstel (match op code+versie of nieuw)
   - Prestatie-voorstel (uit testrapport-waarden)
   - Certificaat-voorstel (uit documenttype + geldig_tot)

3. VALIDATIE (menselijk)
   ↓
   Beheerder ziet in de Bibliotheek:
   "3 kennisobject-voorstellen wachten op bevestiging"
   ↓
   Per voorstel: bevestig / corrigeer / wijs af
   ↓
   Na bevestiging: kennisobject-status → 'actief'
   ↓
   Koppelingen naar document vastgelegd in kennisobject_koppelingen

4. BESCHIKBAAR
   ↓
   Kennisobjecten zijn beschikbaar voor:
   - Toepassingsadvies bij spot-aanmaak
   - Risicosignalering (certificaatstatus, normherziening)
   - AI-zoeken over de kennisgraaf
   - Rapportage ("welke gebouwen gebruiken dit product?")

5. VERVAL / REVISIE
   ↓
   Certificaat verloopt → Risicomelding
   Norm herzien → Normconflict-signalering
   Nieuw document geüpload → Prestatie-update (menselijk bevestigd)
   Product afgeschaft → Cascade: alle toepassingen → gearchiveerd-voorstel
```

---

## Mapping op de bestaande infrastructuur

### Wat er nu al bestaat

| Kennisobject | Bestaande tabel | Dekking |
|---|---|---|
| Fabrikant | `fabrikantenTable` | Naam, id. Mist: land, website, keuringsinstantie |
| Product | `labelsTable` (gedeeltelijk) | Naam, fabrikant_id, foto. Mist: status, artikelnummer, productlijn, vervangen_door |
| Norm | `documenten.en_norm` (tekstveld) | Naam als vrije tekst. Geen entiteit, geen versie, geen opvolger |
| Prestatie | Verspreid over spots + labels | Niet als entiteit. `classificatie`, `testnorm`, `wandOfPlafond` zijn losse velden |
| Certificaat | `documenten.geldig_tot` + `documenttype` | Geen entiteit. Alleen datum op document, niet aan product+norm gekoppeld |
| Toepassing | `labelsTable` | Naam, fabrikant, testnorm, testrapportId, applicatie_codes. Mist: product_id (FK), prestatie_id (FK) |
| Installatie | `voorzieningenTable` | Volledig aanwezig. Mist: expliciete toepassing-relatie als primaire FK |
| Gebouw | `gebouwenTable` | Volledig aanwezig |
| Inspectie | `inspectiesTable` | Aanwezig. Mist: gestructureerde bevindingen, norm_conflict-vlag |

### Wat het kennisobject-model toevoegt (geen code, alleen ontwerp)

**Nieuwe entiteiten:**

1. `normenTable` — Norm als beheerde entiteit (code, versie, type, opvolger)
2. `prestatiesTable` — Gecertificeerde prestatiegegevens per product + conditieset
3. `certificatenTable` — Formeel certificaat-record (instantie, geldig_van/tot, product_id + norm_id)
4. `kennisobject_koppelingenTable` — Document → kennisobject (polymorf, met rol)
5. `kennisobject_voorstellenTable` — AI-voorstel in de validatie-pipeline

**Uitbreidingen op bestaande entiteiten:**

1. `fabrikantenTable` + land, website, keuringsinstantie, actief
2. `labelsTable` → splitsen of aanvullen: toevoegen product_id (FK), prestatie_id (FK)
3. `voorzieningenTable` + toepassing_id (primaire FK), prestatienorm_afwijking, installatie_foto_voor_id
4. `inspectiesTable` + bevindingen_gestructureerd (JSONB), toepassings_afwijking, norm_conflict

---

## Samenvatting — Van document naar AI-kennis

```
Productsheet (PDF)
     │
     ▼  AI-extractie
     │
     ├── Fabrikant ────────────────── "Mulcol International BV"
     │
     ├── Product ──────────────────── "Multicollar Slim"
     │       └── Productlijn ──────── "Mulcol Multicollar"
     │
     ├── Norm ─────────────────────── "EN 1366-3:2009+A1:2015"
     │
     ├── Prestaties ───────────────── EI 120 · wand · flexibel · max ø160 mm
     │                                EI 60  · plafond · flexibel · max ø110 mm
     │
     ├── Certificaat ──────────────── ETA-11/0429 · EOTA · geldig t/m 2028-06
     │
     └── Toepassing ───────────────── "Multicollar Slim ø63 EI120 wand/plafond"
                  │
                  └── Installaties ─── 47 spots in 12 gebouwen
                           │
                           ├── Status: 44 goedgekeurd, 3 controle nodig
                           ├── Inspecties: laatste 2026-03-14
                           └── AI-signalering: ETA verloopt 2028-06
                                              → 47 installaties krijgen risicomelding
```

Dit is de volledige kennisketen. Een productsheet is niet een bewaard bestand; het is het begin van een redenering die tot in elke verdieping van elk gebouw loopt.
