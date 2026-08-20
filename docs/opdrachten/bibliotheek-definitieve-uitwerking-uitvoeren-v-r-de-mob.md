BIBLIOTHEEK – DEFINITIEVE UITWERKING (UITVOEREN VÓÓR DE MOBIELE MONTEUR-APP)

Werk eerst de bibliotheek volledig uit voordat de mobiele monteur-app wordt gebouwd.

Doel:
De bibliotheek wordt de centrale kennisbank voor applicaties, toepassingen, productsoorten, fabrikanten en documentatie. De monteur mag in de mobiele app straks uitsluitend kiezen uit gecontroleerde gegevens uit deze bibliotheek.

## 1. Applicaties

Behoud de bestaande applicatiestructuur met codes zoals:

* 1.1
* 1.2
* 1.3
* 2.5
* enzovoort

Per applicatie vastleggen:

* applicatiecode;
* omschrijving;
* categorie;
* brand- of rookwerendheid indien van toepassing;
* opmerkingen.

Een applicatie is niet gebouwgebonden.

Applicatie = de situatie die voorkomt op locatie.

Voorbeeld:

2.5 Kunststof leiding door brandwerende wand

---

## 2. Toepassingen

Onder een applicatie kunnen meerdere toepassingen bestaan.

Per toepassing vastleggen:

* naam;
* fabrikant;
* productsoort;
* brand- of rookwerendheid;
* eventuele opmerkingen;
* gekoppelde documenten.

Voorbeeld:

Applicatie:
2.5 Kunststof leiding door brandwerende wand

Toepassingen:

* Mulcol Multicollar Slim
* Hilti CFS-C P
* Rockwool oplossing
* Nullifire oplossing

Toepassing = de gekozen oplossing.

---

## 3. Documenten

Maak een centrale documentbibliotheek.

Documenttypes:

* ETA
* Classificatierapport
* Testrapport
* Productcertificaat
* DoP
* Verwerkingsvoorschrift

Documenten zijn niet gekoppeld aan een specifiek gebouw.

Documenten worden centraal beheerd.

---

## 4. AI-documentanalyse

Na upload van een PDF:

AI analyseert automatisch:

* fabrikant;
* productnaam;
* documenttype;
* ETA-nummer;
* EN-norm;
* revisie;
* documentdatum.

AI stelt een duidelijke documentnaam voor.

Voorbeeld:

Mulcol Multicollar Slim - ETA - EN1366-3 - Kunststof leiding door wand

De beheerder kan het voorstel accepteren of aanpassen.

---

## 5. Koppelingen (veel-op-veel)

Gebruik geen vaste 1-op-1-relaties.

Ondersteun:

Applicatie ↔ Toepassing

Document ↔ Applicatie

Document ↔ Toepassing

Eén document moet aan meerdere applicaties gekoppeld kunnen worden.

Eén document moet aan meerdere toepassingen gekoppeld kunnen worden.

Eén toepassing kan aan meerdere applicaties gekoppeld zijn.

---

## 6. Eenvoudig koppelen met vinklijsten

Het koppelen moet zeer eenvoudig zijn.

Bij een applicatie:

Toon alle beschikbare toepassingen met checkboxen.

Voorbeeld:

☑ Mulcol Multicollar Slim

☑ Hilti CFS-C P

☐ Rockwool oplossing

☐ Nullifire oplossing

Bij een toepassing:

Toon alle gekoppelde applicaties.

Bij een document:

Toon alle gekoppelde applicaties.

Toon alle gekoppelde toepassingen.

Ondersteunen:

* zoekfunctie;
* filters;
* checkboxen;
* bulk selecteren;
* bulk deselecteren;
* alles selecteren binnen filter;
* opslaan-knop;
* duidelijke koppelingsoverzichten.

De beheerder moet binnen enkele seconden grote aantallen koppelingen kunnen beheren.

---

## 7. Versiebeheer

Documenten mogen nooit worden overschreven.

Nieuwe upload:

= nieuwe documentversie.

Oude versies blijven bewaard.

Per documentversie tonen:

* documentnaam;
* fabrikant/leverancier;
* documenttype;
* documentdatum;
* revisie;
* EN-norm;
* bronlink;
* datum laatste controle;
* status;
* gekoppelde applicaties;
* gekoppelde toepassingen.

---

## 8. Documentstatussen

Ondersteun:

* Actueel
* Controle nodig
* Mogelijk verouderd
* Vervangen
* Ingetrokken

Status moet duidelijk zichtbaar zijn.

---

## 9. Historische bevriezing

Definitieve opleverrapportages mogen nooit wijzigen.

Wanneer een rapport definitief is gemaakt:

* gebruikte documentversies vastleggen;
* koppeling bevriezen;
* latere documentupdates mogen geen invloed hebben op bestaande definitieve rapportages.

Nieuwe documentversies mogen alleen invloed hebben op:

* nieuwe rapportages;
* conceptrapportages;
* niet-definitieve rapportages.

---

## 10. Periodieke documentcontrole (latere fase)

Voorbereiden voor een toekomstige controlefunctie.

Later moet AI kunnen controleren of leveranciers nieuwe documentversies hebben gepubliceerd.

Bij gevonden wijzigingen:

* voorstel tonen;
* beheerder beslist;
* nooit automatisch vervangen.

---

## 11. Gebruik door de monteur

De monteur beheert geen bibliotheek.

De monteur ziet alleen:

Applicatie
↓
Toepassing
↓
Brand- of rookwerendheid

Fabrikant, documenten, ETA's en certificaten worden automatisch vanuit de bibliotheek afgeleid.

Documentgoedkeuring, versiebeheer en koppelingen zijn uitsluitend beschikbaar voor beheerders.

---

## 12. Relatie met de mobiele app

De mobiele monteur-app mag pas gebouwd worden nadat deze bibliotheekstructuur stabiel werkt en getest is.

De bibliotheek vormt de centrale bron voor:

* applicaties;
* toepassingen;
* fabrikanten;
* productsoorten;
* certificaten;
* ETA's;
* classificatierapporten;
* rapportages.
