Pas de calculatiemodule van FPS Connect fundamenteel aan.

Probleem:
De huidige calculatie werkt met pop-ups per regel. Dat is te traag en omslachtig. Een calculator moet snel regels kunnen invoeren, aanpassen, kopiëren, sorteren en rekenen zonder telkens een modal/popup te openen.

Gewenste richting:
Maak de calculatie als een spreadsheet/calculatieblad, vergelijkbaar met IBIS / ENK / Excel-achtige calculatie.

Belangrijk:
Verwijder de popup als primaire invoerwijze. De popup mag hooguit later optioneel blijven voor detailinformatie, maar niet als hoofdproces.

Nieuwe opzet calculatieblad:
Toon een tabel met directe invoer in cellen.

Kolommen minimaal:
- Regelnummer
- Hoofdstuk
- Omschrijving
- Kostenpost / kostensoort
- Normregel
- Eenheid
- Hoeveelheid
- MU per eenheid
- Arbeidsrol
- Arbeidstarief
- Arbeidskosten
- Materiaalkosten per eenheid
- Materiaaltotaal
- Materieelkosten
- Onderaanneming
- Opslag / toeslag
- Stelpost
- BTW-code
- Interne notitie
- Klanttekst offerte
- Subtotaal
- Marge
- Totaal excl. btw

Gedrag:
1. Elke cel is direct bewerkbaar.
2. Enter gaat naar de volgende regel.
3. Tab gaat naar de volgende cel.
4. Nieuwe regel toevoegen kan direct onderaan of met sneltoets.
5. Regels kunnen gekopieerd, verwijderd en versleept worden.
6. Hoofdstukken werken als groepeerregels.
7. Totalen worden live rechts en onderaan bijgewerkt.
8. Geen verplichte lange formulieren voordat een regel kan worden toegevoegd.
9. De gebruiker moet snel “vrij” kunnen calculeren.
10. Later ingevulde velden mogen automatisch worden aangevuld door AI.

AI-intelligente cellen:
Maak cellen contextgevoelig:
- Bij omschrijving “brandklep vervangen” stelt AI kostensoort, eenheid, normregel en MU voor.
- Bij materiaalomschrijving stelt AI materiaalprijs of historisch gebruikte prijs voor.
- Bij afwijkende MU of tarief toont AI subtiel een waarschuwing.
- Bij klanttekst kan AI automatisch een nette offertetekst voorstellen.
- Bij interne notitie kan AI risico’s of aandachtspunten voorstellen.
- AI mag nooit automatisch definitief aanpassen zonder acceptatie van gebruiker.
- AI-voorstellen moeten inline zichtbaar zijn, niet in een grote popup.

Voorbeelden AI-hulp:
- Grijze suggestietekst in cel
- Kleine knop “AI voorstel toepassen”
- Waarschuwing: “MU wijkt 35% af van vergelijkbare regels”
- Suggestie: “BTW mogelijk 9% bij onderhoud bestaande woning”
- Suggestie: “Gebruik eerder toegepast tarief voor monteur”

Weergavemodi behouden:
- Intern
- Directie
- Klant
- Monteur

Maar deze modi moeten filters/views zijn op hetzelfde calculatieblad, niet aparte invoerprocessen.

Rechterzijde:
Behoud de kostopbouw rechts:
- Materiaal
- Arbeid
- Materieel
- Onderaanneming
- AK
- Risico
- Winst
- BTW
- Totaal

Maar maak dit live gekoppeld aan het blad.

Offerte maken:
De knop “Maak offerte” gebruikt de klanttekstregels uit het calculatieblad.
Interne notities mogen nooit op de klantofferte komen.
Monteur-view gebruikt alleen regels die relevant zijn voor uitvoering.

Belangrijk UX-principe:
De calculator moet kunnen werken zoals in een calculatieblad:
snel typen, tabben, kopiëren, corrigeren, regels dupliceren en subtotalen zien.
Geen modal-first ontwerp meer.

Maak eerst een werkende versie met:
- inline tabelinvoer
- live totalen
- regel toevoegen/verwijderen/kopiëren
- hoofdstukken groeperen
- kostensoorten
- BTW-codes
- AI-suggesties als eenvoudige inline mock/placeholder op basis van omschrijving

Gebruik bestaande data waar mogelijk, maar wijzig de UX radicaal naar spreadsheet/calculatieblad.