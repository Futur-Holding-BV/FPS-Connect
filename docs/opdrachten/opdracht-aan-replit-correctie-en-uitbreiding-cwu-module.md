OPDRACHT AAN REPLIT

Correctie en uitbreiding CWU-module FPS Connect

CWU staat binnen FPS Connect voor:

CALCULATIE – WERKVOORBEREIDING – UITVOERING

Dit is één van de belangrijkste onderdelen van FPS Connect en moet worden gezien als de volledige projectketen vanaf het eerste gebouw tot en met de oplevering en nacalculatie.

De gehele module moet daarom procesgestuurd worden opgebouwd.

---------------------------------------
NIEUWE MENUSTRUCTUUR
---------------------------------------

Onder CWU moeten de volgende onderdelen komen:

1. Gebouwen
2. Opname
3. Calculatie
4. Offertes
5. Opdrachten
6. Werkvoorbereiding
7. Inkoop
8. Planning
9. Uitvoering
10. Urenregistratie
11. Nacalculatie
12. Oplevering

Het huidige hoofdstuk "Gebouwen" moet worden verplaatst naar CWU.

---------------------------------------
CENTRALE GEDACHTE
---------------------------------------

Het gebouw is de centrale projectkaart.

Alles draait om één gebouw.

Aan één gebouw kunnen gekoppeld worden:

- meerdere opnames
- meerdere calculaties
- meerdere offertes
- meerdere opdrachten
- meerdere meerwerkopdrachten
- meerdere inkopen
- meerdere planningen
- meerdere uitvoeringen
- meerdere opleveringen
- meerdere onderhoudstrajecten

Een gebouw is dus geen opdracht.

Een gebouw kan gedurende tientallen jaren meerdere projecten bevatten.

Hier moet het datamodel volledig op voorbereid zijn.

---------------------------------------
1. GEBOUWEN
---------------------------------------

Een gebouwkaart bevat minimaal:

- gebouwnaam
- opdrachtgever
- eindgebruiker
- adres
- contactpersonen
- gebouwtype
- bouwjaar
- plattegronden
- foto's
- documenten
- status
- gekoppelde projecten
- gekoppelde opnames
- gekoppelde calculaties
- gekoppelde offertes
- gekoppelde opdrachten
- gekoppelde uitvoering
- gekoppelde onderhoudscontracten

De status van een gebouw moet automatisch worden bepaald aan de hand van de onderliggende projectstatus.

Voorbeelden:

Nieuw

Opname gepland

Opname gereed

Calculatie

Offerte

Opdracht

Werkvoorbereiding

In uitvoering

Opgeleverd

Onderhoud

Afgesloten

---------------------------------------
2. OPNAME
---------------------------------------

Na het aanmaken van een gebouw bezoekt de projectleider het gebouw.

Tijdens de opname moeten kunnen worden vastgelegd:

- foto's
- notities
- locatie op plattegrond
- verdieping
- ruimte
- gebrek
- omschrijving
- prioriteit
- voorlopige oplossing

Er moet ook een opname mogelijk zijn zonder locatiebezoek.

Bijvoorbeeld wanneer een opdrachtgever een bestaande rapportage of voorzieningenlijst aanlevert.

De datastructuur moet hier alvast geschikt voor worden gemaakt.

---------------------------------------
3. CALCULATIE
---------------------------------------

Vanuit de opname wordt de calculatie opgebouwd.

Per regel moeten minimaal aanwezig zijn:

- omschrijving
- locatie
- hoeveelheid
- eenheid
- materiaal
- arbeid
- onderaanneming
- materieel
- projectbegeleiding
- AK
- ABK
- opslag
- marge
- kostprijs
- verkoopprijs
- btw
- totaal

Calculeren moet volledig vrij kunnen worden opgebouwd.

---------------------------------------
PRINTMODELLEN CALCULATIE
---------------------------------------

Minimaal drie modellen:

1.
Klant beperkt

Alleen regels en regeltotalen.

2.
Klant uitgebreid

Volledige begroting.

3.
Monteur

Werkzaamheden + arbeid.

Geen commerciële gegevens zichtbaar.

Later uitbreidbaar.

---------------------------------------
4. OFFERTES
---------------------------------------

Na de calculatie wordt de offerte opgesteld.

Offertemodellen:

- simpel
- middel
- uitgebreid

Simpel

Alleen offerteblad.

Middel

Offerteblad + begroting.

Uitgebreid

Offerteblad

Begroting

Vrij selecteerbare bijlagen.

Bijlagen kunnen o.a. zijn:

- flyers
- productinformatie
- certificaten
- technische bladen
- algemene voorwaarden
- bedrijfsinformatie

Offertes moeten versiebeheer krijgen.

---------------------------------------
5. OPDRACHTEN
---------------------------------------

Na akkoord ontstaat een opdracht.

Een gebouw kan meerdere opdrachten bevatten.

Bijvoorbeeld:

Hoofdopdracht

Meerwerk 1

Meerwerk 2

Onderhoud

Elke opdracht heeft een eigen:

- planning
- calculatie
- uitvoering
- nacalculatie

---------------------------------------
6. WERKVOORBEREIDING
---------------------------------------

Dit wordt één van de belangrijkste onderdelen van Connect.

Werkvoorbereiding moet de projectleider ondersteunen.

Taken:

- documenten controleren
- materialen controleren
- ontbrekende gegevens signaleren
- werkpakketten maken
- monteurs indelen
- timmermannen indelen
- onderaannemers koppelen
- planning voorbereiden
- risico's signaleren

AI moet actief controleren of iets ontbreekt.

---------------------------------------
7. INKOOP
---------------------------------------

Inkoop wordt opgebouwd vanuit de calculatie.

Iedere calculatieregel moet kunnen leiden tot:

materiaal

onderaanneming

huur

materieel

overige inkoop

Van iedere inkoop moet een inkoopopdracht kunnen worden gemaakt.

Deze moet per mail kunnen worden verzonden.

Na levering kan de bestelling op:

Ontvangen

worden gezet.

Extra inkopen tijdens uitvoering moeten ook mogelijk zijn.

---------------------------------------
ONDERAANNEMERS
---------------------------------------

Wanneer:

omzet > € 5.000 excl. btw

of

er een verhoogd uitvoeringsrisico bestaat,

moet automatisch een onderaannemingsovereenkomst worden voorgesteld.

Deze overeenkomst bevat o.a.:

- G-rekening
- verzekeringen
- certificeringen
- voorwaarden
- digitale ondertekening

Facturen mogen pas worden vrijgegeven wanneer aan alle contractvoorwaarden is voldaan.

---------------------------------------
8. PLANNING
---------------------------------------

Werkvoorbereiding maakt een detailplanning.

Na akkoord van de projectleider mag AI een voorstel doen voor de centrale planning.

Hierbij moet AI rekening houden met:

- beschikbaar personeel
- monteurs
- timmermannen
- onderaannemers
- levertijden
- materiaal
- prioriteit opdrachtgever
- geografische ligging
- reistijd
- projectduur
- bestaande planning
- spoedwerk

Dit wordt later verder uitgebreid.

---------------------------------------
9. UITVOERING
---------------------------------------

Tijdens uitvoering moet zichtbaar zijn:

- voortgang
- foto's
- kwaliteitscontroles
- afwijkingen
- meerwerk
- materiaalgebruik
- dagrapporten

---------------------------------------
10. URENREGISTRATIE
---------------------------------------

Monteurs, timmermannen en inleners registreren hun uren via de mobiele app.

Uren worden gekoppeld aan:

gebouw

opdracht

calculatieregel

werksoort

ruimte

Hiermee wordt automatisch de nacalculatie gevuld.

---------------------------------------
11. NACALCULATIE
---------------------------------------

Alle werkelijke kosten worden vergeleken met de begroting.

Onder andere:

materiaal

arbeid

onderaanneming

projectleiding

inkoop

meerwerk

uren

marges

Hieruit ontstaan dashboards voor projectresultaat.

---------------------------------------
12. OPLEVERING
---------------------------------------

Na afronding wordt de oplevering uitgevoerd.

Deze koppelt rechtstreeks met de bestaande opleverrapportage.

Alle gegevens uit de uitvoering moeten automatisch beschikbaar zijn.

---------------------------------------
AI-ONDERSTEUNING
---------------------------------------

Binnen de volledige CWU-module moet AI actief ondersteunen.

Niet alleen beantwoorden van vragen, maar ook:

- ontbrekende gegevens signaleren
- risico's herkennen
- planningsconflicten melden
- budgetoverschrijdingen voorspellen
- materiaaltekorten voorspellen
- levertijden bewaken
- onderaannemers beoordelen
- waarschuwingen geven
- controles uitvoeren
- voorstellen doen voor optimalisatie

AI moet functioneren als een digitale projectassistent voor calculatie, werkvoorbereiding en uitvoering.

Deze module vormt uiteindelijk het hart van FPS Connect en moet daarom modulair, schaalbaar en professioneel worden ontworpen.