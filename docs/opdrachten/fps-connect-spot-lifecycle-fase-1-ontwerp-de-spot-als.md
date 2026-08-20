# FPS Connect – Spot Lifecycle (fase 1)

Ontwerp de Spot als het centrale object binnen Connect.

**Doel:**
Alle modules werken uiteindelijk met dezelfde Spot. Onderhoud wordt nu nog niet gebouwd, maar de Spot moet daar architectonisch wel op voorbereid zijn.

## Uitgangspunten

Een Spot is de kleinste beheerbare eenheid binnen een gebouw.

Een Spot kan bijvoorbeeld zijn:

* brandwerende doorvoering
* branddeur
* kozijn
* brandscheiding
* plafond
* staalconstructie
* brandklep
* inspectiepunt
* rookwerende voorziening

Iedere Spot krijgt een uniek, permanent Spot-ID.

Dit Spot-ID verandert nooit.

---

## Basisgegevens Spot

Iedere Spot bevat minimaal:

* Spot-ID
* Gebouw
* Verdieping
* Ruimte
* Locatie op plattegrond
* Coördinaten
* QR-code (later)
* Werkmaatschappij
* Werksoort
* Voorzieningstype
* Classificatie
* Status
* Conditie (voorbereiden, nog niet gebruiken)
* Prioriteit
* AI Confidence
* Datum aangemaakt
* Aangemaakt door

---

## Spot Status

Werk de volgende statusflow uit:

Nieuw

↓

Opgenomen

↓

AI geanalyseerd

↓

In calculatie

↓

Calculatie akkoord

↓

Offerte

↓

Opdracht

↓

Werkbegroting

↓

Inkoop

↓

Gepland

↓

In uitvoering

↓

Controle

↓

Oplevering

↓

Afgerond

Statussen moeten volledig configureerbaar zijn.

---

## Spot Dossiers

De Spot wordt opgebouwd uit afzonderlijke dossiers.

Fase 1:

* Basisgegevens
* Opnamedossier
* AI-dossier
* Calculatiedossier
* Werkbegroting
* Uitvoeringsdossier
* Opleverdossier
* Documenten
* Auditlog

Maak de architectuur alvast uitbreidbaar zodat later eenvoudig extra dossiers kunnen worden toegevoegd.

Nog GEEN onderhoudsdossier bouwen.

---

## Spot Timeline

Iedere belangrijke actie wordt als gebeurtenis opgeslagen.

Bijvoorbeeld:

* Spot aangemaakt
* Foto toegevoegd
* AI analyse uitgevoerd
* Calculator aangepast
* Projectleider akkoord
* Uitvoering gestart
* Uitvoering afgerond
* Oplevering afgerond

Iedere gebeurtenis bevat:

* datum
* gebruiker
* actie
* opmerkingen
* gekoppelde documenten

Nog GEEN onderhoudsgebeurtenissen toevoegen.

---

## Spot AI

Connect AI ondersteunt gedurende de gehele levenscyclus.

Bijvoorbeeld:

* vergelijkbare Spots herkennen
* ontbrekende informatie signaleren
* bouwstenen voorstellen
* materiaal voorstellen
* arbeid voorstellen
* risico's benoemen
* classificatie controleren
* hoeveelheden controleren

AI doet uitsluitend voorstellen.

Gebruiker blijft verantwoordelijk.

---

## Spot Architectuur

Ontwerp de Spot zodanig dat later eenvoudig kan worden uitgebreid met:

* Onderhoud
* Inspecties
* Revisies
* Vervangingen
* Garanties
* Historie over meerdere jaren

Deze onderdelen nu NIET bouwen.

Alleen de architectuur voorbereiden.

---

## Belangrijk

De Spot is het centrale object binnen Connect.

Alle toekomstige modules moeten gekoppeld worden aan de Spot en niet andersom.

Onderhoud wordt bewust in een latere fase ontworpen.
