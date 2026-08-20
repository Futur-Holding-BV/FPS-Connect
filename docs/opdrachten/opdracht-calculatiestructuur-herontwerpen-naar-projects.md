OPDRACHT – Calculatiestructuur herontwerpen naar projectstructuur

Doel

Verbeter de bestaande calculatiemodule zodat deze aansluit op de manier waarop FPS daadwerkelijk projecten uitvoert.

De huidige calculatiemodule hoeft niet opnieuw gebouwd te worden.

Behoud zoveel mogelijk bestaande functionaliteit.

Pas uitsluitend de structuur aan zodat grotere projecten overzichtelijk kunnen worden gecalculeerd, uitgevoerd, bewaakt en opgeleverd.

=========================================================
UITGANGSPUNT
=========================================================

Een calculatie bestaat niet alleen uit hoofdstukken.

Een calculatie bestaat uit projectonderdelen.

Bij woningbouw is dat meestal een woning.

Bij utiliteit kan dit een ruimte, compartiment, verdieping, schacht, bouwdeel of vrije projecteenheid zijn.

Gebruik daarom de neutrale naam:

CALCULATIE-EENHEID

=========================================================
STRUCTUUR
=========================================================

De hiërarchie wordt:

Project
    ↓
Calculatie-eenheid
    ↓
Hoofdstuk
    ↓
Calculatieregel
    ↓
Subregel (optioneel)

Voorbeeld:

Project

Appartement 01
    Bouwkundige voorzieningen
        Brandwerende deur
        Glas
        Kitwerk

Appartement 02
    Bouwkundige voorzieningen
        ...

Appartement 03

Algemene projectkosten
    Bouwplaatskosten
    Steiger
    Container
    Projectleiding

Staartkosten

Projecttotaal

=========================================================
CALCULATIE-EENHEDEN
=========================================================

Ondersteun minimaal:

- woning
- appartement
- kamer
- ruimte
- verdieping
- compartiment
- schacht
- bouwdeel
- gevel
- installatiezone
- vrije projecteenheid

De gebruiker moet ook eigen typen kunnen toevoegen.

=========================================================
VOORDELEN
=========================================================

Per calculatie-eenheid direct inzicht geven in:

- kostprijs
- verkoopprijs
- materiaal
- arbeid
- onderaanneming
- overige kosten
- marge
- uren

Daarnaast projecttotalen tonen.

=========================================================
KOPPELING MET OVERIGE MODULES
=========================================================

Deze calculatiestructuur moet later rechtstreeks kunnen worden gebruikt door:

- werkbegroting
- inkoop
- magazijn
- planning
- uitvoering
- oplevering
- onderhoud
- nacalculatie

Hierdoor blijft gedurende het gehele project dezelfde structuur behouden.

=========================================================
WERKVOORBEREIDING
=========================================================

Werkbegroting moet dezelfde calculatie-eenheden gebruiken.

De werkvoorbereider hoeft de structuur dus niet opnieuw op te bouwen.

=========================================================
PLANNING
=========================================================

Planning moet kunnen plannen per:

- calculatie-eenheid
- hoofdstuk
- regel

=========================================================
UITVOERING
=========================================================

De monteur moet uiteindelijk werkzaamheden kunnen uitvoeren per:

Calculatie-eenheid

waardoor foto's, uren, materialen, opmerkingen en opleverpunten automatisch aan de juiste eenheid gekoppeld worden.

=========================================================
OPLEVERING
=========================================================

Opleverrapporten moeten per calculatie-eenheid kunnen worden opgebouwd.

Daarna automatisch een projecttotaal genereren.

=========================================================
NACALCULATIE
=========================================================

Nacalculatie moet uiteindelijk inzicht geven per:

- calculatie-eenheid
- hoofdstuk
- project

Hierdoor is direct zichtbaar welke woning, ruimte of bouwdeel afwijkt.

=========================================================
AI SENIOR CALCULATOR
=========================================================

AI moet straks ook per calculatie-eenheid adviseren.

Bijvoorbeeld:

- opvallend dure woning;
- ontbrekende werkzaamheden;
- afwijkende uren;
- ontbrekende materialen;
- ontbrekende leverancier;
- ontbrekende offerte;
- afwijkende marge.

=========================================================
BELANGRIJK
=========================================================

Gebruik zoveel mogelijk bestaande tabellen, componenten en routes.

Bouw geen tweede calculatiemodule.

Voer deze wijziging uit als uitbreiding van de bestaande structuur.

=========================================================
OPLEVERING
=========================================================

Rapporteer:

1. Welke bestaande onderdelen zijn hergebruikt.

2. Welke onderdelen aangepast zijn.

3. Welke gevolgen dit heeft voor:

- werkbegroting
- planning
- uitvoering
- oplevering
- nacalculatie

4. Welke bestaande schermen hierdoor gewijzigd worden.

5. GO / NO GO voor gebruik in een echte projectcalculatie.

Belangrijk:

Het doel is niet ENK na te bouwen.

Het doel is een betere projectstructuur te maken die de volledige levenscyclus van een project ondersteunt: van calculatie tot onderhoud.