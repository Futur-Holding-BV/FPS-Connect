# Opdracht Replit – Module Crediteuren & Niet-projectgerelateerde facturen

## Doel

Bouw binnen FPS Connect een complete crediteurenmodule voor alle niet-projectgerelateerde facturen.

Deze module is geen eenvoudig archief, maar een intelligente financiële kennisbank waarin AI alle bedrijfskosten begrijpt, koppelt en analyseert.

Projectfacturen blijven onderdeel van de projectworkflow.

Alle overige facturen worden automatisch verwerkt binnen deze nieuwe module.

---

# Nieuwe hoofdmodule

**Financiën**

Binnen Financiën:

* Crediteuren
* Debiteuren (later)
* Bank (later)
* BTW (later)
* Rapportages (later)

Voor nu bouwen we uitsluitend **Crediteuren**.

---

# Workflow

## Stap 1

Factuur komt binnen via Outlook.

AI beoordeelt automatisch:

* Is dit een factuur?
* Welke leverancier?
* Projectfactuur of algemene bedrijfsfactuur?
* Factuurbedrag
* BTW
* Factuurnummer
* Factuurdatum
* Vervaldatum

---

## Stap 2

Indien projectfactuur:

→ bestaande projectworkflow. zie hierboven

---

## Stap 3

Indien GEEN projectfactuur:

AI plaatst de factuur automatisch in:

**Financiën → Crediteuren → Te beoordelen projectleider**

---

# AI-classificatie

AI bepaalt automatisch de categorie.

Voorbeelden:

## Huisvesting

* huur
* energie
* water
* schoonmaak
* beveiliging
* internet

## Wagenpark

* brandstof
* onderhoud
* lease
* APK
* verzekering
* banden
* schade

## Personeel

* opleidingen
* arbodienst
* PBM
* werkkleding
* werving
* salarisdiensten

## ICT

* Microsoft
* Adobe
* Resend
* Replit
* OpenAI
* Anthropic
* hosting
* domeinen
* hardware

## Machines & Gereedschap

* aanschaf
* onderhoud
* keuring
* kalibratie

## Verzekeringen

* aansprakelijkheid
* bedrijfsauto
* inventaris

## Belastingen

* gemeentelijke lasten
* loonheffing
* overige belastingen

## Overig

AI kiest alleen wanneer geen betere categorie bestaat.

---

# AI koppelt automatisch aan bedrijfsobjecten

Facturen worden niet alleen opgeslagen.

Ze worden gekoppeld aan de juiste objecten.

Voorbeelden:

## Voertuigen

Brandstof

Onderhoud

APK

Lease

Verzekering

→ gekoppeld aan het voertuig.

---

## Medewerkers

Opleiding

Werkkleding

PBM

Mobiele telefoon

Laptop

→ gekoppeld aan medewerker.

---

## Software

Microsoft

OpenAI

Replit

Resend

Google

Adobe

→ gekoppeld aan software-abonnement.

---

## Machines

Onderhoud

Keuring

Reparatie

→ gekoppeld aan machine.

---

## Contracten

Abonnementen

Lease

Onderhoudscontracten

→ gekoppeld aan contract.

---

# AI leert

Wanneer een leverancier meerdere keren voorkomt leert AI:

* juiste categorie
* juiste grootboekrekening
* juiste workflow
* juiste goedkeurder

Hierdoor wordt de verwerking steeds beter.

---

# Goedkeuringsworkflow

Statussen:

Nieuw

↓

AI beoordeeld

↓

Te beoordelen

↓

Goedgekeurd

↓

Betaald

↓

Gearchiveerd

Elke status is zichtbaar.

---

# Archief

Na betaling verhuist de factuur automatisch naar:

Financiën

→ Crediteuren

→ Betaald

Facturen blijven volledig doorzoekbaar.

Zoeken op:

* leverancier
* factuurnummer
* bedrag
* kenteken
* medewerker
* contract
* software
* machine
* categorie
* jaar
* maand
* BTW
* betaalstatus

---

# AI Analyse

Bouw direct analyses in.

Bijvoorbeeld:

"Brandstofkosten stijgen."

"Leasekosten nemen toe."

"Er zijn dubbele abonnementen."

"Deze software wordt nauwelijks gebruikt."

"Deze leverancier verhoogt jaarlijks de prijzen."

"Onderhoudskosten voertuig lopen op."

"APK verloopt binnenkort."

"Verzekering loopt binnenkort af."

"Deze leverancier stuurt mogelijk een dubbele factuur."

"Factuurbedrag wijkt sterk af van eerdere jaren."

---

# Dashboard

Toon onder andere:

Openstaande facturen

Te beoordelen

Te betalen deze week

Te laat betaald

Totale bedrijfskosten per maand

Kosten per categorie

Kosten per leverancier

Kostenontwikkeling afgelopen jaren

Terugkerende abonnementen

Voertuigkosten

ICT-kosten

Personeelskosten

---

# Relaties

Iedere factuur moet relaties kunnen hebben met:

* leverancier
* voertuig
* medewerker
* machine
* software
* contract
* abonnement
* kostenplaats
* werkmaatschappij
* bankbetaling (later)

---

# AI-chat

Vanuit iedere factuur moet de gebruiker vragen kunnen stellen.

Bijvoorbeeld:

"Waarom is deze duurder?"

"Laat alle facturen van deze leverancier zien."

"Hoeveel hebben wij dit jaar aan Microsoft uitgegeven?"

"Welke voertuigen kosten het meeste onderhoud?"

"Welke abonnementen kunnen waarschijnlijk worden opgezegd?"

AI gebruikt hiervoor alle historische facturen.

---

# Belangrijk

Deze module is nadrukkelijk géén passief archief.

Iedere factuur blijft onderdeel van het bedrijfsgeheugen van Connect.

Alle relaties blijven behouden zodat AI steeds betere analyses, signaleringen en adviezen kan geven.

Bouw de module volledig schaalbaar zodat later eenvoudig bankkoppelingen, boekhoudsoftware, automatische boekingen, budgetbewaking en financiële prognoses kunnen worden toegevoegd zonder de bestaande structuur te wijzigen.
\
