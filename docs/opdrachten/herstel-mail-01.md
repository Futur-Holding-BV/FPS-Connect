# HERSTEL_MAIL_01 — drie punten

*Voor Replit. Opgesteld 17 augustus 2026 op basis van eigen metingen aan de repo op commit `0fc040cf` en aan de mislukte uitrol-run 32022113638.*

Niet op te knippen in "wat past er in de tijd" — dit hoort als geheel. De volgorde is wel bindend: punt 1 eerst, want zolang die openstaat komt er niets op productie.

---

## Punt 1 — de uitrol is geblokkeerd door één regel code

**Wat er gemeten is.** De uitrol van vanochtend faalde niet op de server maar op stap 8, "Controle 1/3 — typecheck". Alles daarna is overgeslagen; productie is niet aangeraakt. De fout:

```
scripts/src/verificatie-storage-links.ts(78,33): error TS2307:
Cannot find module '/home/runner/workspace/artifacts/api-server/node_modules/@google-cloud/storage/build/esm/src/index.js'
```

Op regel 78 staat een `await import(...)` met een vast pad dat begint met `/home/runner/workspace/`. Dat pad bestaat alleen binnen Replit. Op de bouwmachine van GitHub bestaat het niet, dus de typecontrole struikelt en de hele uitrol stopt.

**Wat er moet gebeuren.**

Voeg `@google-cloud/storage` toe als afhankelijkheid van het pakket `@workspace/scripts` en importeer hem gewoon bij naam, zonder pad. Daarmee klopt het overal: in Replit én op de bouwmachine.

Lukt dat niet zonder versieconflict met de api-server, kies dan de terugvaloptie: haal het pad uit een omgevingsvariabele met het huidige pad als standaardwaarde, en zet dat in een variabele vóór de import. De typecontrole kan een variabel pad niet naspeuren en laat het met rust, terwijl het binnen Replit blijft werken zoals nu.

**En dan de reden dat dit terugkomt.** Er staan nog vier van dezelfde vaste paden in de code, allemaal in de api-server: de virusdefinities, de scanregels en twee opslagmappen voor bestanden in quarantaine. Drie ervan staan hard in de code zonder uitweg. Zodra de app naar de eigen server verhuist, wijzen die vier naar mappen die daar niet bestaan — dan is het geen typefout meer maar een virusscanner die stil niets doet. Zet ze alle vier op een omgevingsvariabele met het huidige pad als standaardwaarde, en laat de app bij het opstarten controleren of die mappen er werkelijk zijn.

---

## Punt 2 — een dood mailadres is nergens te zien

**Wat er gemeten is.** In de database wordt vastgelegd wanneer een adres onbestelbaar werd en waarom, en dat gegeven werkt: wie onbestelbaar is valt automatisch buiten elke doelgroep. Maar in de hele app komt dat veld nergens in beeld. Er is geen scherm waar je kunt zien dat een adres gekaatst is. De enige manier om erachter te komen is een doelgroepstelling draaien en zien dat het aantal lager is dan verwacht.

Zo blijft een klant waarvan het adres niet meer werkt onzichtbaar tot iemand er toevallig over struikelt. Bij één contact is dat vervelend; bij een verzendlijst die een jaar meegaat is het een stille stapel waar je niets van weet.

**Wat er moet gebeuren.**

**Bij de contactpersoon zelf** hoort de status te staan: dat het adres onbestelbaar is, sinds wanneer, en met welke reden. Duidelijk zichtbaar, niet weggestopt achter een tabblad — dit is een reden om die persoon niet te bereiken, en dat is even belangrijk als zijn telefoonnummer.

**Er hoort een overzicht te zijn van alle onbestelbare adressen bij elkaar**, met per regel de organisatie, de contactpersoon, de datum en de reden. Dat is de werklijst: nabellen, adres corrigeren, of het contact afvoeren.

**Vanuit dat overzicht moet je het ook kunnen afhandelen.** Een nieuw adres invullen wist de onbestelbaar-status en zet de persoon terug in de doelgroepen. Afvoeren haalt hem eruit. Zonder die twee handelingen is het overzicht een klaagmuur.

**En de nieuwe adressen komen er ook in.** Wordt een adres bij een bestaande contactpersoon gewijzigd, dan begint hij schoon: de oude onbestelbaar-status hoort niet mee te verhuizen naar een adres dat nog nooit geprobeerd is.

---

## Punt 3 — bewijsscripts mogen niet op productie kunnen draaien

**Wat er gemeten is.** De bewijs- en verificatiescripts halen hun serveradres uit een instelling, met een terugval op de eigen omgeving. Staat die instelling op productie, dan maken ze echte klantgegevens aan in het echte klantenbestand — testorganisaties, testcontacten, testcampagnes — en ruimen ze die daarna weer op.

Zolang dat opruimen slaagt merkt niemand iets. Maar het opruimen staat aan het eind: breekt het script halverwege af, of valt de verbinding weg, dan blijven die testgegevens staan tussen de echte klanten. En een script dat contacten aanmaakt en verwijdert kan dat ook met de verkeerde doen.

**Wat er moet gebeuren.**

Laat elk bewijs- en verificatiescript bij de start controleren waar het naartoe wijst, en direct stoppen als dat het productieadres is. Niet met een waarschuwing die je kunt negeren — stoppen, met één regel uitleg wat er dan wel moet.

Voor de gevallen waarin er wél op productie gemeten moet worden: laat die scripts uitsluitend lezen, nooit schrijven. Wie iets wil aanmaken hoort dat op een eigen omgeving te doen.

En ruim op wat er mogelijk al staat: zoek in het klantenbestand naar organisaties, contactpersonen, doelgroepen, sjablonen en campagnes waarvan de naam met "Bewijs" begint of waarvan het adres op `@fps.local` of `bewijs-onbestelbaar-fps.nl` eindigt, en verwijder wat daar niet hoort. Wat gevonden en verwijderd is hoort in het opleverbewijs.

---

## Punt 4 — de faalmail wijst de verkeerde kant op

**Wat er gemeten is.** In de mail van vanochtend stond: "Deploy-stap gefaald (build, migratie of containers-up op de VPS)." Er is nooit een deploy-stap gestart. Die zin staat vast in de workflow en heeft niets met de werkelijke oorzaak te maken.

Het verschil dat die zin verbergt is groot: een gestruikelde controle betekent dat de code een fout bevat en dat productie ongemoeid draait. Een gefaalde deploy betekent dat er iets halverwege is blijven steken op de server. Het eerste kan wachten tot je tijd hebt; het tweede niet.

**Wat er moet gebeuren.** Zet in de faalmail de naam van de stap die werkelijk faalde en de laatste regels van zijn uitvoer. En zet er in één zin bij wat de stand van productie is: is de uitrol gestopt vóór de server werd aangeraakt, of erna. Die twee gegevens staan allebei binnen de workflow beschikbaar op het moment dat de mail verstuurd wordt.

---

## Wat er opgeleverd moet worden

Van punt 1: de groene uitrol zelf is het bewijs — geen aparte verantwoording nodig.

Van punt 2: de schermen, plus wat de zoekactie uit punt 3 heeft gevonden.

Van punt 3: welke scripts nu geblokkeerd worden, en wat er aan testgegevens is aangetroffen en opgeruimd.

Van punt 4: één faalmail uit een echte mislukte run, zodat de nieuwe tekst te zien is. Forceer daarvoor geen fout op main — een tak volstaat.
