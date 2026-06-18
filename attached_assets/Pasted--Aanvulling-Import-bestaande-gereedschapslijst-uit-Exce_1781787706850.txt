# Aanvulling – Import bestaande gereedschapslijst uit Excel

De huidige gereedschapsregistratie moet geïmporteerd kunnen worden vanuit een Excelbestand.

## Doel

Bestaande machines en gereedschappen moeten in één keer kunnen worden ingelezen in FPS Connect, zodat de huidige registratie niet opnieuw handmatig hoeft te worden ingevoerd.

## Importfunctie

Maak een importfunctie voor Excelbestanden.

Ondersteunde bestanden:

* .xlsx
* .xls
* .csv

De import moet kolommen kunnen herkennen zoals:

* volgnummer
* gegraveerd nummer
* omschrijving
* merk
* type
* serienummer
* categorie
* huidige gebruiker
* locatie
* status
* keuringsplichtig
* laatste keuring
* volgende keuring
* aankoopdatum
* opmerkingen

## Kolommen koppelen

Omdat de huidige Excel mogelijk andere kolomnamen gebruikt, moet de beheerder tijdens import kolommen kunnen koppelen.

Voorbeeld:

Excelkolom “Nr.” → FPS Connect veld “Volgnummer”
Excelkolom “Naam medewerker” → FPS Connect veld “Huidige gebruiker”
Excelkolom “Machine” → FPS Connect veld “Omschrijving”

## Controle vóór definitieve import

Voor definitief importeren moet FPS Connect een controle tonen:

* aantal gevonden regels
* aantal nieuwe gereedschappen
* aantal mogelijke dubbelen
* ontbrekende verplichte velden
* fouten in datums
* onbekende medewerkers
* onbekende statussen

De import mag pas definitief worden uitgevoerd na bevestiging door beheerder.

## Dubbelen voorkomen

Controleer bij import op:

* volgnummer
* gegraveerd nummer
* serienummer

Als een machine al bestaat, moet FPS Connect vragen:

* overslaan
* bestaande regel bijwerken
* als nieuw item toevoegen

## Importlog

Sla per import vast:

* datum/tijd
* gebruiker
* bestandsnaam
* aantal geïmporteerde regels
* aantal overgeslagen regels
* aantal fouten
* importverslag

## Acceptatiecriteria

De functie is gereed wanneer:

1. Een bestaande Excel-gereedschapslijst kan worden geüpload.
2. Kolommen handmatig gekoppeld kunnen worden.
3. FPS Connect dubbele machines herkent.
4. Ontbrekende of foutieve velden vóór import worden gemeld.
5. De beheerder de import eerst kan controleren.
6. Na import staan machines direct in het gereedschapregister.
7. Indien een gebruiker bekend is, wordt het gereedschap direct aan die medewerker gekoppeld.
8. De import wordt volledig gelogd.
