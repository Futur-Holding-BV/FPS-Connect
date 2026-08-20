BV_DOORVOEREN_02

Alles hieronder is gemeten op main, 20-08-2026. Niet opnieuw onderzoeken, gewoon bouwen.

VERTREKPUNT (feitelijk)
- gebouwen.werkgeverId → echte FK naar werkgeversTable. In orde.
- offertes.werkmaatschappijId → echte FK sinds migratie 0082, met de vastgelegde lijn: de BV hangt aan het WERK, het gebouw levert alleen de standaardwaarde, daarna wijzigbaar. Dit is het patroon dat overal gevolgd wordt.
- projecten.werkmaatschappij → text(), vrij tekstveld, geen koppeling.
- calculatiesTable en modCalculatiesTable → geen BV-veld, alleen gebouwId.
- werkgeversTable bevat al: naam, cao (default "Metaal & Techniek"), kenmerkPrefix, logoUrl, logoVarianten, primaireKleur (default #F23B0D), merkKleuren.
- primaireKleur wordt uitsluitend op papier gebruikt: offertes/print.tsx, modules/calculatie/print.tsx, documentopmaak, studio, merkenkast. Op geen enkel scherm.
- pages/uitvoering/detail.tsx (de projectkaart) toont de werkmaatschappij niet en biedt er geen keuze voor.

TE BOUWEN

1. Voeg werkmaatschappijId toe aan projectenTable, calculatiesTable en modCalculatiesTable, als FK naar werkgeversTable, exact zoals bij offertes. Vul bij aanmaken met de BV van het gebouw; daarna wijzigbaar met vastlegging van wijziger en moment.

2. Migreer projecten.werkmaatschappij (tekst) naar de nieuwe koppeling. Match op werkgeversTable.naam, hoofdletter- en spatie-ongevoelig. Geen match of meerdere matches → leeg laten. Schrijf het resultaat weg in docs/metingen/BV_MIGRATIE.md: aantal gematcht, aantal leeg, en de aangetroffen schrijfwijzen. Verwijder het oude tekstveld pas in een tweede stap, nadat de migratie is nagelopen.

3. Erfketen: gebouw → project → calculatie → offerte → inkoop → factuur. Elke schakel neemt de BV over van zijn voorganger als standaardwaarde, en is los wijzigbaar. Wijkt een schakel af van zijn voorganger, dan toont het scherm dat als waarschuwing bij de BV-aanduiding — niet blokkeren, wel zichtbaar.

4. Twee soorten BV, gescheiden:
   - VERKOOP-BV (het werk): bepaalt kenmerkPrefix, logo, briefpapier, IBAN en de AccountView-administratie. Staat op gebouw, project, calculatie, offerte, inkoop en factuur.
   - WERKGEVENDE BV (de medewerker): bepaalt de CAO en daarmee de kostprijs per uur. FPS Bouw & Renovatie is een interne BV met uitsluitend timmermannen onder de bouw-CAO; die verkoopt niets naar buiten, maar levert wel uren op projecten van de andere drie.
   Een uur telt dus tegen de kostprijs van de werkgevende BV, terwijl de opbrengst bij de verkoop-BV landt. Toon in het projectresultaat de werkelijke personeelskosten per BV van herkomst, naast de opbrengst. Bestaat er nog geen doorbelasting tussen BV's, bouw die dan als berekening in het projectresultaat — niet als boeking.

5. BV-kleur op het scherm. Gebruik werkgeversTable.primaireKleur als enige bron; maak geen tweede kleurenlijst. Zet als beginwaarde: FPS Bouw blauw, FPS Brandpreventie rood, FPS Onderhoud groen, FPS Bouw & Renovatie grijs.
   Toon op elke kaart en elk detailscherm — gebouw, project, calculatie, offerte, werkvoorbereiding, inkoop, factuur — een gekleurde balk of rand in die kleur, met de naam van de BV er in tekst bij. Kleur is nooit de enige drager.
   Niet als schermachtergrond. Rood is in Connect al de kleur van fouten en blokkerende meldingen: geef de BV-aanduiding een vaste eigen plek (linkerrand van de kaart plus een label bovenaan) die verschilt van waar waarschuwingen staan.
   FPS Bouw & Renovatie verschijnt alleen bij personeel, uren en kostprijs — nooit op een werk-, verkoop- of factuurkaart.

6. Zet op de projectkaart (pages/uitvoering/detail.tsx) een keuzeveld voor de werkmaatschappij, zoals gebouw-aanmaken-dialog.tsx dat al heeft. Nu is de BV daar niet in te vullen en niet te zien.

GRENZEN
- Geen tweede kleuren-, logo- of kenmerkopslag naast werkgeversTable.
- Bestaande offertes, kenmerknummers en documenten veranderen niet.
- Overlap met BV_SCHEIDING_01 (scheiding richting boekhouding): dat pakket regelt de administratiecodes en het boeken. Bouw dat hier niet opnieuw; sluit erop aan.