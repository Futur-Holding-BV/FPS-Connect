# Opdracht – AI Bedrijfskompas en Dynamische Margebewaking

## Doel

Ontwikkel een AI-gedreven bedrijfssturingslaag voor FPS Connect die de volledige onderneming continu financieel analyseert en deze kennis gebruikt tijdens het calculeren, beoordelen van werkbegrotingen, projectbewaking en directiebeslissingen.

Het systeem mag géén losstaande module worden die gebruikers apart moeten openen.

Het Bedrijfskompas moet op de achtergrond continu actuele berekeningen uitvoeren en alleen contextafhankelijke informatie tonen op de plaatsen waar financiële beslissingen worden genomen.

---

# Uitgangspunten

De bron van waarheid is niet de calculatie.

De bron van waarheid is de onderneming.

Iedere calculatie, offerte, werkbegroting en project moet worden beoordeeld in relatie tot:

* de volledige orderportefeuille;
* de capaciteit;
* de algemene kosten;
* de begroting;
* de prognose;
* de financiële doelstellingen.

AI moet deze gegevens automatisch verzamelen, analyseren en actualiseren.

Handmatige invoer wordt tot een minimum beperkt.

---

# Jaarbegroting

Aan het begin van ieder boekjaar maakt AI automatisch een conceptbegroting.

AI gebruikt hiervoor bestaande gegevens uit Connect.

## Capaciteit

Automatisch bepalen vanuit HRM:

* medewerkers
* contracturen
* CAO
* ADV
* vakantiedagen
* feestdagen
* opleidingen
* bekende uitdiensttredingen
* nieuwe medewerkers
* productiviteit per functie
* historische ziektepercentages
* leegloop
* overwerkhistorie

Hieruit berekent Connect automatisch:

* beschikbare werkdagen
* productieve uren
* indirecte uren
* beschikbare capaciteit per werkmaatschappij
* totale capaciteit onderneming

---

## Algemene kosten

AI verzamelt automatisch uit de financiële administratie:

* salarissen
* sociale lasten
* directie
* kantoor
* huur
* verzekeringen
* lease
* software
* ICT
* telefonie
* accountantskosten
* rente
* afschrijvingen
* marketing
* opleidingen
* overige indirecte kosten

AI classificeert deze automatisch.

De gebruiker hoeft deze niet jaarlijks opnieuw in te voeren.

---

## Historische analyse

AI analyseert automatisch:

* laatste jaren omzet
* brutomarges
* nettoresultaten
* nacalculaties
* seizoensinvloeden
* productiviteit
* leegloop
* ziekte
* gemiddelde verkoopprijzen
* materiaalontwikkelingen
* prijsindexaties

---

## AI-conceptbegroting

Op basis hiervan stelt AI automatisch voor:

* omzet per werkmaatschappij
* totale omzet
* benodigde productie
* benodigde brutowinst
* benodigde gemiddelde marge
* break-evenomzet
* AK per productief uur
* doelmarge onderneming

De directie beoordeelt uitsluitend de voorstellen.

---

# Verdeling algemene kosten

De vier FPS-werkmaatschappijen dragen gezamenlijk alle algemene kosten.

Maak hiervoor een configureerbare verdeelsleutel.

Ondersteun onder andere:

* omzet
* directe uren
* brutowinst
* FTE
* vaste percentages
* gecombineerde verdeelsleutel

AI adviseert welke verdeelsleutel het beste aansluit bij de actuele onderneming.

---

# Continue prognose

Gedurende het jaar werkt AI voortdurend de prognose bij.

Gebruik hiervoor onder andere:

* aangenomen opdrachten
* openstaande offertes
* winkans per offerte
* planning
* bezetting
* ziekte
* meerwerk
* nacalculatie
* gerealiseerde omzet
* gerealiseerde brutowinst
* actuele algemene kosten

Hierdoor ontstaat een realtime bedrijfsprognose.

---

# Calculatiemodule

Tijdens iedere calculatie verschijnt automatisch een compact informatieblok.

Geen extra scherm.

Geen popup.

Geen aparte module.

Realtime tonen:

* projectomzet
* kostprijs
* brutowinst
* brutomarge
* huidige bedrijfsdoelmarge
* bijdrage aan algemene kosten
* bijdrage aan bedrijfsresultaat
* AI-advies

Voorbeelden:

"Project voldoet volledig aan de bedrijfsdoelstelling."

"Door de huidige orderportefeuille adviseert AI de opslag met circa 2% te verhogen."

"De onderneming ligt boven begroting. Een lagere marge is verantwoord."

Alle waarden moeten live wijzigen tijdens het aanpassen van de calculatie.

---

# Offerte

Bij goedkeuren van een offerte tonen:

Indien opdracht wordt verkregen:

* omzetstijging
* brutowinst
* effect op jaarprognose
* effect op AK-dekking
* effect op bezettingsgraad
* verwachte winstbijdrage

---

# Werkbegroting

Tijdens het opstellen en goedkeuren van een werkbegroting tonen:

* contractwaarde
* begrote kosten
* begrote brutowinst
* bijdrage aan algemene kosten
* verwachte netto bedrijfsbijdrage
* prognose na uitvoering

Ook hier live laten wijzigen.

---

# Uitvoering

Tijdens uitvoering continu tonen:

* gerealiseerde uren
* resterende uren
* verwachte eindkosten
* verwachte eindwinst
* actuele bijdrage aan algemene kosten
* afwijking ten opzichte van begroting

AI moet afwijkingen signaleren.

---

# Nacalculatie

Na oplevering vergelijkt AI automatisch:

* calculatie
* werkbegroting
* uitvoering
* werkelijk resultaat

AI leert hiervan.

Bijvoorbeeld:

* normtijd te laag
* materiaal structureel onderschat
* bepaalde werkzaamheden structureel verliesgevend
* leverancier duurder dan verwacht

Deze kennis wordt automatisch gebruikt bij volgende calculaties.

---

# Directiedashboard

Maak een uitgebreid dashboard uitsluitend voor directie.

Onder andere:

* omzet
* brutowinst
* nettoresultaat
* AK
* AK-dekking
* break-even
* orderportefeuille
* bezettingsgraad
* capaciteit
* prognose
* winstverwachting
* werkmaatschappijen vergelijken
* trends
* AI-observaties
* risico's
* kansen

Gebruik grafieken, KPI-kaarten en prognoselijnen.

---

# AI-observaties

AI mag zelfstandig signaleren:

* marge loopt terug
* capaciteit raakt vol
* capaciteit loopt leeg
* structureel verliesgevende werkzaamheden
* hoge ziekte-impact
* stijgende materiaalkosten
* prijsstijging noodzakelijk
* extra personeel nodig
* omzetdoel niet haalbaar
* begroting overtreffen waarschijnlijk

Iedere observatie bevat:

* onderbouwing
* impact
* advies
* betrouwbaarheidsscore

---

# Geen vaste opslagpercentages

Het systeem mag niet werken met vaste standaardopslagen.

Alle adviezen worden dynamisch bepaald op basis van:

* actuele bedrijfsgegevens
* begroting
* orderportefeuille
* capaciteit
* financiële positie
* prognoses

---

# Architectuur

Alle berekeningen worden centraal uitgevoerd.

Calculatie, offerte, werkbegroting, uitvoering en dashboard gebruiken exact dezelfde dataset.

Er mogen geen afzonderlijke rekenmodellen ontstaan.

Eén waarheid.

---

# Rollen

Directeur:

* volledige inzichten
* begroting goedkeuren
* prognoses
* strategische analyses

Projectleider:

* projectbijdrage
* bedrijfsbijdrage
* margeadvies

Calculator:

* live margeadvies
* bedrijfsdoelmarge
* bijdrage aan onderneming

Administratie:

* uitsluitend financiële controle
* geen dubbele invoer

Monteur:

* geen toegang.

---

# Toekomstbestendig

Ontwerp de architectuur zodanig dat later eenvoudig kan worden toegevoegd:

* AI-scenarioanalyse
* meerdere begrotingsscenario's
* economische indexen
* cao-indexaties
* inflatiecorrecties
* leveranciersindexen
* cashflowprognoses
* liquiditeitsplanning
* investeringsplanning
* bankconvenanten
* KPI-vergelijking met voorgaande jaren

Deze uitbreidingen nu nog niet implementeren, maar de architectuur mag ze niet blokkeren.

---

# Acceptatiecriteria

De opdracht is geslaagd wanneer:

* AI zelfstandig een conceptjaarbegroting kan opstellen.
* Algemene kosten automatisch worden verzameld uit bestaande bedrijfsgegevens.
* Iedere calculatie live de bedrijfsimpact toont.
* Iedere werkbegroting live de bedrijfsimpact toont.
* Prognoses automatisch wijzigen bij nieuwe opdrachten of gewijzigde kosten.
* Nacalculaties automatisch terugvloeien naar toekomstige calculaties.
* Het directiedashboard realtime inzicht geeft in de financiële gezondheid van de volledige onderneming.
* Er nergens dubbele invoer van dezelfde financiële gegevens nodig is.
* Alle onderdelen gebruikmaken van één centrale financiële rekenmotor.
