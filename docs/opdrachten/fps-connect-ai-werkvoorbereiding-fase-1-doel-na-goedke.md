# FPS Connect – AI Werkvoorbereiding (Fase 1)

## Doel

Na goedkeuring van een offerte verandert de calculatie automatisch in een uitvoerbaar project. AI ondersteunt de volledige werkvoorbereiding door voorstellen te maken. De werkvoorbereider en projectleider blijven verantwoordelijk voor de definitieve goedkeuring.

De workflow is:

Calculatie → Offerte → Opdracht → AI Werkbegroting → Goedkeuring Projectleider → AI Inkoopplanning → AI Uitvoeringsplanning → Uitvoering.

---

# 1. AI Werkbegroting

## Start

Trigger:

Projectstatus = "Opdracht ontvangen"

AI maakt automatisch een concept-werkbegroting.

De originele calculatie blijft altijd ongewijzigd.

De werkbegroting wordt een aparte versie.

---

## AI voert automatisch uit

### 1. Verwijderen commerciële opslag

Verwijder:

* winst
* risico-opslag
* commerciële afrondingen
* verkoopmarges

Resultaat:

Netto uitvoeringsbegroting.

---

### 2. Analyse materiaal

AI controleert per materiaalregel:

* actuele leveranciersprijzen
* projectoffertes leveranciers
* contractprijzen
* alternatieve leveranciers
* staffelkorting
* bestaande voorraad
* minimale bestelhoeveelheden

AI toont per regel:

* huidige prijs
* verwachte inkoopprijs
* besparing
* motivatie

Bijvoorbeeld:

"Rockwool 60 mm"

Calculatie:
€18,20

Projectofferte:
€16,85

Besparing:
€1,35 per plaat

Totale besparing:
€487

---

### 3. Analyse arbeid

AI beoordeelt:

* logistiek
* volgorde werkzaamheden
* combineren werkzaamheden
* prefab mogelijkheden
* materiaalkeuze
* inzet monteurs

Per voorstel:

* urenbesparing
* risico
* motivatie

Bijvoorbeeld:

"Doorvoeringen verdieping 2 en 3 combineren."

Besparing:

11,5 uur.

---

### 4. Werkbegroting

De werkbegroting bevat:

* arbeid
* materiaal
* materieel
* onderaannemers
* inkoopprijzen
* interne voorraad
* verwachte projectmarge

Alles volledig bewerkbaar.

---

# Workflow

Status:

Concept Werkbegroting

↓

Werkvoorbereider controleert

↓

Projectleider akkoord

↓

Status:

Werkbegroting vastgesteld

Pas daarna start de volgende fase.

---

# 2. AI Inkoopplanning

Trigger:

Werkbegroting goedgekeurd.

AI maakt automatisch een volledige inkoopplanning.

---

## AI bepaalt per artikel

* voorraadartikel
* projectartikel
* maatwerk
* lange levertijd
* standaard levertijd
* minimale besteltermijn
* gewenste leverdatum
* besteldatum

---

## Voorraad

Artikelen uit eigen magazijn worden automatisch gemarkeerd.

Status:

"Uit voorraad reserveren"

Deze verschijnen niet op de bestellijst.

---

## Projectgebonden artikelen

Bijvoorbeeld:

* deuren
* glas
* maatwerk staal
* speciale kozijnen

Status:

Projectinkoop.

---

## Leveranciersoffertes

Tijdens calculatie of werkbegroting kunnen offertes worden gekoppeld.

AI gebruikt uitsluitend goedgekeurde leveranciersoffertes.

Bij meerdere offertes vergelijkt AI:

* prijs
* levertijd
* kwaliteit
* eerdere leverbetrouwbaarheid

Daarna volgt een advies.

---

## Leverplanning

Doel:

Alle materialen zijn aanwezig bij start uitvoering.

Niet eerder.

AI optimaliseert:

* minimale opslag
* minimale voorfinanciering
* geen uitvoeringsvertraging

Bijvoorbeeld:

Glas

Levertijd:
6 weken

Montage:
12 oktober

Bestellen:
27 augustus

Leveren:
7 oktober

---

# Inkoopbon

AI maakt digitale inkoopbonnen.

Iedere bon bevat:

* project
* gebouw
* leverancier
* artikelregels
* aantallen
* prijs
* leverdatum
* kostenplaats
* projectnummer

Daarnaast bepaalt AI automatisch de juiste gebouw- en locatienummering zodat later de factuur automatisch kan worden gekoppeld.

Factuurcontrole:

Factuurbedrag

↓

Vergelijk met:

* inkoopbon
* leverbon
* project

Bij afwijkingen ontstaat automatisch een workflow.

---

# Workflow

Concept Inkoopplanning

↓

Werkvoorbereider controle

↓

Projectleider akkoord

↓

Inkoop gereed

---

# 3. AI Uitvoeringsplanning

Na goedkeuring van de werkbegroting maakt AI een concept-uitvoeringsplanning.

AI gebruikt:

* calculatie
* werkbegroting
* levertijden
* projectdeadline
* capaciteit medewerkers
* ervaring monteurs
* afhankelijkheden werkzaamheden

AI plant:

* fasen
* werkzaamheden
* duur
* benodigde disciplines
* materiaalmomenten

Resultaat:

Concept projectplanning.

---

Werkvoorbereider past aan.

↓

Projectleider keurt goed.

↓

Planning krijgt status:

Gereed voor centrale planning.

---

Belangrijk:

Deze planning is géén personeelsplanning.

De centrale planner gebruikt deze planning als basis.

Gemiddeld zal circa 60% rechtstreeks worden overgenomen.

De overige werkzaamheden worden handmatig afgestemd met andere projecten, ziekte, spoedwerk en beschikbare capaciteit.

---

# Fase 2

Na bewezen betrouwbaarheid ondersteunt AI ook de uitvoering van de inkoop.

Workflow:

AI maakt bestelvoorstel

↓

Werkvoorbereider of Projectleider keurt digitaal goed

↓

AI verzendt bestelling automatisch

↓

Orderbevestiging wordt gekoppeld

↓

Levering wordt bewaakt

↓

Factuur wordt automatisch gecontroleerd met:

* bestelling
* leverbon
* project
* afgesproken prijs

Afwijkingen starten automatisch een controleworkflow.

Doel is dat de werkvoorbereider verschuift van administratief verwerken naar controleren, optimaliseren en sturen op projectresultaat.
