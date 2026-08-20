# Voorraadtelling met de camera — uitwerking

*17 augustus 2026. Gemeten op de code van FPS Connect, main.*

---

## Eerst het goede nieuws: de helft staat er al

In magazijnbeheer bestaat de **stellingscan** al: je maakt een foto van een stelling, die wordt aan een magazijnlocatie gehangen, de AI kijkt ernaar en doet voorstellen, en er is een goedkeuringsstap met wie het goedkeurde en wanneer. De voorraad zelf zit per artikel én per locatie in de administratie, met een volledig spoor van elke mutatie. En op het artikel staan drie prijzen: de inkoopprijs, de laatste inkoopprijs en het gewogen gemiddelde.

Wat je vraagt is dus geen nieuw fundament, maar drie aanvullingen op iets dat al werkt.

**Wat er anders moet.** De bestaande scan is gebouwd om te bepalen wát er bijbesteld moet worden — de opdracht aan de AI is letterlijk zo geschreven. Voor een telling moet hij iets anders doen: niet oordelen of het genoeg is, maar tellen hoeveel er ligt.

---

## De drie dingen die erbij komen

### 1. Een vak tekenen op de foto

Je maakt een foto van een stelling en trekt met je vinger een rechthoek om het deel dat beoordeeld moet worden. Meerdere vakken op één foto mag: elk vak is een eigen telling, zodat je een stelling met drie planken in één opname kunt afhandelen.

Waarom dit meer is dan gemak: een uitsnede geeft de AI aanzienlijk minder om zich in te vergissen. Een hele stelling met vier planken door elkaar levert een gok op; één plank met twintig dozen van hetzelfde artikel is een telling.

Bij elk vak hoort een aanduiding — plank 1, plank 2, of de locatiecode die je al gebruikt. Die gaat mee naar de regel, zodat later terug te vinden is wáár de twintig stuks lagen.

### 2. Tellen in plaats van bijbestellen

Per vak levert de AI regels op: welk artikel hij denkt te zien, hoeveel, en hoe zeker hij is. Die zekerheid is geen sierlijk detail maar de kern van de bruikbaarheid — bij twijfel moet het vak omhoog komen in de lijst die jij nog moet nalopen.

De uitkomst is altijd een **voorstel**, nooit een boeking. Elke regel wordt door een mens bevestigd, gecorrigeerd of verworpen, en pas dan telt hij mee.

Dat is niet uit voorzichtigheid, maar omdat een boekhouder een telling moet kunnen navertellen. Staat er in de administratie een aantal dat een camera heeft bedacht en niemand heeft gezien, dan is dat geen telling maar een schatting — en dan is de post waardeloos als onderbouwing.

### 3. De telling als bevroren moment

Dit is het stuk dat volledig ontbreekt en dat je nodig hebt voor je boekhouder.

Een telling is een eigen ding met een peildatum, meestal 31 december. Zolang hij loopt kun je scannen, bevestigen en corrigeren. Als hij wordt vastgesteld gebeurt er dit:

**Alles wordt bevroren.** Per artikel: het getelde aantal, de gehanteerde prijs, de waarde, en de locatie waar het lag. Verandert de inkoopprijs in maart, dan verandert de telling van december niet mee. Dat is de hele reden dat het een eigen tabel moet zijn en geen berekening over de huidige voorraad.

**De foto's blijven eraan hangen** — inclusief het getekende vak — als bewijsstuk bij de regel. Vraagt de boekhouder over drie maanden hoe je aan die vierentwintig komt, dan is er een foto met een kader eromheen.

**Er komt een verschillenlijst.** Wat stond er in de administratie, wat is er geteld, en wat is het verschil in aantal en in geld. Dat is het gesprek dat je met je boekhouder voert. Verschillen worden geboekt als een correctiemutatie met verwijzing naar de telling, zodat het spoor doorloopt.

**En de uitvoer voor de boekhouder** is één overzicht: per artikel het aantal, de waarderingsgrondslag, de waarde, en het totaal onderaan, met peildatum, wie geteld heeft en wie vastgesteld. Dat is precies wat hij op 31 december van je vraagt.

---

## Twee dingen die je boekhouder gaat vragen

**Tegen welke prijs waardeer je.** Er staan drie prijzen op een artikel. Inkoopprijs, laatste inkoopprijs of gewogen gemiddelde geven verschillende uitkomsten, en je mag niet elk jaar wisselen. Dat is een vraag voor woensdag — hij weet wat gebruikelijk is, en het is een van de weinige dingen waar hij echt over gaat.

**Wat doe je met wat er al drie jaar ligt.** Voorraad die niet meer verkocht of gebruikt wordt, hoort afgewaardeerd te worden. Het systeem weet wanneer een artikel voor het laatst is bewogen, dus dat is uit te rekenen. Zet het als kolom in de telling: laatste beweging, en hoe lang geleden. Dan ziet hij het zelf.

---

## Waar dit tegenaan loopt

**Herkennen wat er ligt is makkelijker dan tellen hoeveel.** Een stapel van tien dozen waarvan je er drie ziet, is voor een camera geen tien. Bij dozen op een plank naast elkaar gaat het goed; bij stapels, halfvolle dozen en losse onderdelen niet.

De eerlijke verwachting: dit versnelt het werk aanzienlijk voor alles wat netjes op een plank ligt, en het lost het handmatig tellen van rommelige plekken niet op. Dat is geen reden om het niet te bouwen — het is een reden om de telling zo te bouwen dat handmatig invullen even gemakkelijk is als een foto maken.

**En één ding uit de rekenkant komt hier terug:** de aantallen en de prijzen staan opgeslagen als benaderd getal. Voor een voorraadwaarde die de boekhouder gebruikt, hoort dat exact te zijn — hetzelfde punt als bij de calculatie.

---

## Volgorde

Eerst de telling als bevroren moment met handmatig invullen, de verschillenlijst en de uitvoer voor de boekhouder. Dat is het deel dat je in december echt nodig hebt en dat zonder AI werkt.

Daarna de camera erop: het vak tekenen en het tellen per vak. Dat maakt hetzelfde werk sneller, maar het is geen voorwaarde om te kunnen tellen.

Wie het andersom doet, heeft in december een mooie fotofunctie en geen overzicht om af te geven.
