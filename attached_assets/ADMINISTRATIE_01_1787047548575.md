# ADMINISTRATIE_01 — werkmaatschappijen, bankrekeningen, inkoopbon en boeken naar AccountView

Vervangt alle eerdere losse opdrachten en aanvullingen over dit onderwerp
(INKOOP_BON, INKOOP_BOEKING_01, BEDRIJFSGEGEVENS_01, BV_SCHEIDING_01). Alleen
dit document geldt.

## Waarom

FPS heeft **vier werkmaatschappijen met vier aparte AccountView-administraties**.
Connect houdt daar op de belangrijkste plekken geen rekening mee, en kosten die
direct betaald worden lopen dood voordat ze geboekt zijn. Zolang dat zo is mag
er niets automatisch geboekt worden: een automaat die in de verkeerde
administratie boekt is erger dan handwerk.

De volgorde in dit document is bindend: fase 1 en 2 vóór fase 3, fase 3 vóór
fase 4.

---

## Fase 0 — meten en voorleggen (vóór er iets verandert)

1. Hoeveel werkmaatschappijen staan er in Connect en welke zijn actief? Wijkt
   dat af van vier, dan melden en wachten.
2. Welke gegevens horen bij één werkmaatschappij en welke zijn bedrijfsbreed?
   Loop in elk geval langs: facturen, algemene inkoop, opdrachten, uren,
   declaraties, magazijn, leveranciers, gereedschap, CRM. Geef per soort een
   voorstel met één zin waarom.
3. Welke AccountView-instellingen zijn nu gevuld, staat de koppeling in test-
   of livemodus, en is er ooit werkelijk geboekt? Zet niets om.
4. Leg de uitkomst van 2 en 3 aan René voor voordat je fase 1 begint.

---

## Fase 1 — één scherm voor de werkmaatschappij

Bedrijfsgegevens en Werkmaatschappijen tonen dezelfde gegevens; het zijn twee
vensters op één bron.

1. Voeg ze samen tot één scherm: per werkmaatschappij alles bij elkaar.
2. Controleer dat geen veld uit een van beide schermen verdwijnt.
3. Er wordt niets gemigreerd — het is dezelfde bron.

---

## Fase 2 — bankrekeningen per werkmaatschappij

Er is nu één rekeningnummerveld per werkmaatschappij, zonder doel,
tenaamstelling of vastlegging van wijzigingen. Aan de leverancierskant bestaat
het rijkere model al; neem dat als voorbeeld.

1. Bankrekeningen worden een lijst per werkmaatschappij. Per rekening: IBAN,
   tenaamstelling en doel (ontvangst, crediteuren, loon, G-rekening). Eén
   rekening mag meerdere doelen hebben.
2. Het bestaande nummer per werkmaatschappij wordt overgenomen en krijgt
   standaard alle doelen. **Elke werkmaatschappij heeft een eigen nummer** —
   FPS Bouw en FPS Brandpreventie verschillen. Nergens terugvallen op het
   nummer van een andere werkmaatschappij.
3. FPS heeft geen G-rekening. Het doel blijft als keuze bestaan maar hoeft niet
   gevuld te worden.
4. IBAN wordt bij invoeren op geldigheid gecontroleerd.
5. Elke wijziging aan een rekening wordt vastgelegd met wie, wanneer en wat er
   veranderde, en stuurt de bestaande faalmail naar René. Een gewijzigd
   rekeningnummer is de klassieke fraudetruc.
6. Wijzigen mag alleen met het hoogste financiële recht. Meld welk recht dat nu
   precies is voordat je het vastzet.
7. Documenten en de herkenning van het loonbestand gebruiken vanaf nu de
   rekening met het juiste doel in plaats van het enkele veld. Ontbreekt die,
   dan wijst het scherm aan wat er mist; niets stil laten mislukken.

---

## Fase 3 — elke factuur en elke administratie bij de juiste BV

1. Facturen krijgen een werkmaatschappij. Bij een inkoopfactuur wordt die
   afgeleid uit het project of de inkoop; kan dat niet, dan is het een
   verplichte keuze bij het afhandelen — **nooit een stille standaardwaarde**.
2. De AccountView-instellingen worden per werkmaatschappij: eigen
   administratiecode, dagboeken, grootboekrekeningen en mappingtabellen. Geen
   enkele instelling blijft gedeeld.
3. De huidige, enkele instelling wordt **niet** aan een werkmaatschappij
   toegewezen. Alle werkmaatschappijen beginnen leeg; René vult ze in. Zo kan
   een oude instelling nooit stil aan de verkeerde BV blijven hangen.
4. Een nieuwe werkmaatschappij krijgt automatisch een lege koppeling met de
   standaard dagboeken ingevuld. Het aanmaken van die koppeling is nooit een
   losse handeling die iemand kan vergeten.
5. Meet en meld of de AccountView-koppeling de beschikbare administraties kan
   opsommen. Kan dat, dan wordt de administratiecode een keuzelijst in plaats
   van een tekstveld — dan is een typefout in een administratiecode
   uitgesloten. Kan het niet, meld dat dan met de reden.
6. Boeken kan alleen als de werkmaatschappij van de factuur hoort bij de
   administratie waarin geboekt wordt. Klopt dat niet, dan geen boeking en de
   bestaande faalmail.
7. Toets aantoonbaar dat een factuur van de ene BV nooit in de administratie
   van een andere geboekt kan worden, ook niet bij handmatig exporteren.

---

## Fase 4 — van inkoopbon naar geboekte factuur

Bij "op rekening" werkt de keten al: het A-nummer wordt op de binnenkomende
factuur herkend, de factuur wordt gekoppeld, de kostensoort overgenomen en het
bedrag vergeleken met een tolerantie van 2%. Bij "direct betaald" bestaat die
weg niet — de bon wordt alleen opgeslagen, niet gelezen en niet gekoppeld.
Terwijl juist daar de factuur achteraf van de website van de leverancier
gehaald wordt.

1. Bij "direct betaald" mag het bewijsstuk een factuur zijn. Wordt er een pdf
   geüpload, dan gaat die door dezelfde AI-lezing als een binnenkomende factuur
   en wordt hij als inkoopfactuur aan die inkoopregel gekoppeld. Een foto van
   een kassabon blijft gewoon een bon.
2. De AI vergelijkt leverancier, bedrag en kostensoort met wat bij de inkoop is
   ingevuld — dezelfde vergelijking en tolerantie als nu bij "op rekening".
   Klopt het, dan gaat de factuur naar klaar voor boeking en wordt de inkoop
   afgerond. Wijkt het af, dan het bestaande signaal.
3. Eén bewijsstuk per inkoop: er komt geen tweede veld naast.
4. Een factuur die klaar voor boeking staat, geen openstaande goedkeuring heeft
   en een werkmaatschappij met ingevulde administratie draagt, wordt
   **automatisch** naar AccountView geboekt. Mislukt dat, dan de bestaande
   faalmail met de reden. Handmatig exporteren blijft mogelijk.
5. Automatisch boeken staat per werkmaatschappij uit zolang haar administratie
   leeg is. Komt er dan toch een factuur voor die BV, dan blijft hij staan met
   een leesbare reden en gaat de faalmail eruit.
6. Zet de koppeling niet zelf van testmodus naar livemodus. Meld wanneer alles
   klaar is om om te zetten.

---

## Vaste eisen

- Toets elke aanname over module, route en bevoegdheid tegen de code en meld
  afwijkingen — pas niets stilzwijgend aan.
- Wijk je af van de scope, meld dat vóór je bouwt.
- Antwoord naar `docs/antwoorden/ADMINISTRATIE_01.md`, metingen naar
  `docs/metingen/`.
