# Aanvulling – Onderhanden werk in financiële overzichten

Bouw binnen FPS Connect financiële ondersteuning voor **onderhanden werk**.

Doel:

Connect moet op ieder moment kunnen laten zien welke projecten financieel nog onderhanden zijn en welke waarde daarin zit. Dit is nodig voor managementrapportages, maandafsluiting en jaarrekening.

Onderhanden werk moet zichtbaar zijn binnen:

* Financiën
* Rapportages
* Jaaroverzicht
* Projectoverzicht
* Werkmaatschappij-overzicht

## Definitie

Een project valt onder onderhanden werk wanneer:

* het project opdracht is geworden;
* het project nog niet volledig is afgerond;
* het project nog niet volledig is gefactureerd;
* er al kosten, uren, materiaal of onderaanneming op geboekt zijn;
* of er al productie is geleverd waarvoor nog geen factuur is verstuurd.

## Per project tonen

Toon per onderhanden project minimaal:

* projectnummer
* klant
* gebouw / locatie
* werkmaatschappij
* projectstatus
* opdrachtsom
* goedgekeurde meerwerken
* begrote kosten
* werkelijk geboekte kosten
* geboekte uren
* geboekt materiaal
* geboekte onderaanneming
* reeds gefactureerd bedrag
* nog te factureren bedrag
* verwachte marge
* actuele marge
* percentage gereed
* waarde onderhanden werk
* risico-inschatting AI
* opmerkingen projectleider

## Berekening onderhanden werk

Connect moet meerdere waarderingsmethodes ondersteunen.

Basisberekening:

Waarde onderhanden werk =
waarde geleverde prestatie
minus reeds gefactureerd bedrag

Waarbij waarde geleverde prestatie kan worden bepaald op basis van:

* percentage gereed × opdrachtsom
* werkelijk gemaakte kosten + verwachte marge
* goedgekeurde termijnstaat
* handmatige beoordeling projectleider
* AI-voorstel op basis van voortgang, planning, uren en materiaal

De gebruiker moet de methode per project kunnen kiezen of corrigeren.

## Statussen

Gebruik duidelijke statussen:

* Niet gestart
* In uitvoering
* Gedeeltelijk uitgevoerd
* Wacht op oplevering
* Oplevering gereed
* Gefactureerd
* Afgesloten
* Onderhanden werk controleren
* Risico / afwijking

## Jaarrekeningcontrole

Maak een apart overzicht:

**Financiën → Jaarrekening → Onderhanden werk**

Dit overzicht toont per peildatum, bijvoorbeeld 31 december:

* alle lopende projecten
* waarde onderhanden werk
* reeds gefactureerd
* nog te factureren
* geboekte kosten
* verwachte marge
* projecten met ontbrekende voortgang
* projecten zonder actuele projectstatus
* projecten met kosten maar zonder facturatie
* projecten met facturatie maar zonder voldoende geboekte kosten
* projecten met negatieve marge
* projecten die mogelijk afgesloten hadden moeten zijn

## Peildatum

De gebruiker moet een peildatum kunnen kiezen.

Voorbeeld:

31-12-2026

Connect toont dan de stand van onderhanden werk op die datum, niet alleen de actuele stand van vandaag.

Dit is belangrijk voor jaarrekening, accountant en fiscale aansluiting.

## AI-controle

AI moet signaleren:

* project lijkt financieel niet bijgewerkt
* er ontbreken uren
* materiaal is geleverd maar niet gefactureerd
* project lijkt afgerond maar staat nog open
* project heeft kosten na opleverdatum
* project heeft geen actuele voortgang
* project heeft hoge kosten maar lage facturatie
* project heeft een afwijkende marge
* project moet mogelijk nog als onderhanden werk worden opgenomen
* project moet mogelijk worden afgesloten

AI mag alleen voorstellen doen.

De projectleider of beheerder blijft verantwoordelijk voor akkoord.

## Export

Maak export mogelijk naar:

* Excel
* PDF
* accountant-overzicht
* jaarrekeningbijlage

Export moet filterbaar zijn op:

* boekjaar
* peildatum
* werkmaatschappij
* klant
* projectleider
* status
* projectcategorie

## Belangrijk

Onderhanden werk mag niet losstaan van de projectadministratie.

Het moet automatisch worden opgebouwd vanuit:

* opdracht
* calculatie
* werkbegroting
* planning
* urenregistratie
* materiaalverbruik
* inkoopfacturen
* meerwerk
* termijnfacturen
* opleverstatus

De financiële module toont dus niet alleen losse facturen, maar ook de financiële positie van lopende projecten.
