Herbouw de hoofdbeleving van Sparki rond het model: Beleven → Ontdekken → Begrijpen → Verbeteren.

Belangrijk uitgangspunt:
Sparki is geen klassiek dashboard en geen app die alleen coachteksten toont. Sport moet leuk blijven. Gebruikers verwachten nog steeds kaarten, grafieken, records, ritgegevens en herkenbare sportdata zoals bij Garmin/Strava. Maar Sparki moet daar bovenop iets toevoegen: de sporter begeleiden in een ontdekkingstocht door zijn eigen sportdata.

Doel:
Maak de app merkbaar anders in gebruik. De gebruiker moet niet direct in losse data of coachadvies vallen, maar eerst zijn sport beleven, daarna iets interessants ontdekken, daarna begrijpen wat het betekent, en pas daarna eventueel een advies krijgen.

Pas dit toe op:

1. Home-scherm
2. Activiteit-detail scherm
3. Navigatie/kaartstructuur
4. Coach/AI-observaties
5. Grafieken en datakaarten

Nieuwe hoofdvolgorde per gebruiker:

1. Beleven

* Toon eerst de sportervaring.
* Recente rit/training, kaart, afstand, tijd, hoogtemeters, gevoel, foto's indien aanwezig, records, opvallende prestatie.
* Geen belerende coachtekst als eerste blok.
* De gebruiker moet eerst denken: “leuke rit / interessant / mooi om terug te zien”.

2. Ontdekken

* Daarna toont Sparki maximaal 1 tot 3 ontdekkingen.
* Voorbeelden:

  * “Dit was je langste rit van deze maand.”
  * “Je hartslag bleef stabieler dan bij vergelijkbare ritten.”
  * “Je reed dit segment sneller dan vorige keer, ondanks lagere piekbelasting.”
  * “Je bent nu 3 weken consequent bezig.”
* Dit zijn geen adviezen, maar interessante observaties.

3. Begrijpen

* Bij iedere ontdekking moet de gebruiker kunnen doorklikken naar “Waarom ziet Sparki dit?”
* Toon dan de onderliggende data:

  * grafiek
  * vergelijking met eerdere ritten
  * gebruikte sensoren
  * onzekerheid/confidence
  * ontbrekende data
* Grafieken blijven dus aanwezig, maar pas als verdieping en niet als eerste informatielaag.

4. Verbeteren

* Pas daarna mag Sparki een advies geven.
* Advies moet kort, concreet en optioneel zijn.
* Voorbeelden:

  * “Morgen rustig herstellen.”
  * “Deze week kun je de duur iets uitbreiden.”
  * “Doe vandaag geen extra intensiteit.”
* Advies mag nooit het plezier of de beleving verdringen.

Belangrijke UX-regel:
Eerst beleven, dan ontdekken, dan begrijpen, dan verbeteren.
Geen coachadvies bovenaan tenzij er een duidelijke waarschuwing of risico is.

Home-scherm moet worden opgebouwd als:

* Bovenaan: persoonlijke sportbeleving van vandaag/gisteren
* Daarna: 1 hoofdontdekking van Sparki
* Daarna: compacte sportdata/records
* Daarna: eventuele actie of advies
* Daarna: doorklik naar analyse/grafieken

Activiteit-detail moet worden opgebouwd als:

* Hero met kaart en kernprestatie
* “Wat was leuk/opvallend?”
* Records en persoonlijke momenten
* Grafieken: vermogen, hartslag, snelheid, hoogte, cadans indien beschikbaar
* Sparki-ontdekking
* Waarom/uitleg
* Eventueel advies voor herstel of volgende training

Navigatie vereenvoudigen naar:

* Vandaag
* Activiteiten
* Ontdekken
* Trainen
* Jij

Verwijder of verberg de oude Core als zichtbare hoofdcomponent.
De Core mag intern blijven bestaan als analyse-engine, maar de sporter hoeft geen AI-core te bedienen of voortdurend te zien.

Tone of voice:

* Sparki is een gids, geen schoolmeester.
* Niet: “Je moet…”
* Wel: “Kijk eens, dit valt op…”
* Niet alleen tekstkaarten.
* Combineer beleving, data, grafiek en korte observatie.

Done looks like:

* De app voelt niet meer als een verzameling dashboards.
* De app voelt ook niet als alleen een AI-coach met tekst.
* De gebruiker ziet eerst zijn sportmoment terug.
* Daarna krijgt hij iets interessants te ontdekken.
* Daarna kan hij uitleg en grafieken openen.
* Daarna krijgt hij pas advies.
* Home en activiteit-detail zijn zichtbaar anders en rustiger.
* Garmin/Strava-achtige data blijft aanwezig, maar Sparki voegt interpretatie en ontdekking toe.
