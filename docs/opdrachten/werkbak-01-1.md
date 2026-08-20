# WERKBAK_01 — het werk komt naar je toe

## Aanleiding

René: *"Ook weer een hoofdstuk erbij waar van alles belangrijks achter zit maar
wat niet naar je toe komt. Dit is een structureel probleem dat steeds wordt
doorgebouwd. Het moet zichtbaar zijn zonder dat ik ga zoeken."*

En de kern van waarom Connect er is: *"juist daarom heb ik Connect laten bouwen
om zaken te vergemakkelijken en te automatiseren. Dat lukt op deze manier geheel
niet."*

Elke module krijgt nu zijn eigen ingang met zijn eigen telbolletje, verstopt in
een submenu. Contractbewaking staat ingesprongen onder Personeel, meldingen
onder Veiligheid, voertuigmeldingen onder Wagenpark. Om te weten of er iets
ligt, moet je overal langs.

**Dit is geen extra scherm erbij. Dit vervangt het patroon.**

---

## 1. Eén werkbak per persoon, altijd zichtbaar

- Een vast blok **bovenaan de zijbalk**, op elk scherm zichtbaar, met het aantal
  openstaande punten.
- Daarin komt alles samen wat om aandacht van díé persoon vraagt, ongeacht uit
  welke module het komt.
- Gesorteerd op urgentie, niet op module: een bijna-ongeval staat boven een
  verlopend certificaat.
- **Aanklikken gaat rechtstreeks naar de kaart waar de handeling plaatsvindt** —
  de medewerker, de factuur, de offerte, het voertuig. Nooit naar een
  tussenoverzicht.
- Een punt verdwijnt pas als de handeling gedaan is, niet als hij gelezen is.

## 2. Per functie zijn eigen punten

Iedereen ziet dezelfde werkbak, gevuld met wat bij zijn functie hoort. Wat René
noemde:

- **Werkvoorbereider**: mails die aandacht nodig hebben · offertes waar geen
  reactie op komt · offertes die onvolledig zijn en terug moeten naar de maker ·
  facturen die op goedkeuring staan · materiaalaanvragen.
- **René en Jacqueline (HRM)**: aflopende contracten · verstreken en naderende
  aanzegtermijnen · einde proeftijd · ketenregel · ZZP'ers die te lang werken en
  het DBA-risico · einde inleen · verlopende certificaten en keuringen ·
  verlofverjaring.
- **Veiligheid, voor iedereen die het aangaat**: LMRA-problemen · bijna-ongevallen
  en ongevallen · veiligheidsmeldingen.
- **Uitvoering en financieel**: overschrijding van uren of kosten · meer- en
  minderwerkmeldingen · afwijkende factuurbedragen · gewijzigde rekeningnummers ·
  voertuigmeldingen · gereedschapskeuringen · aflopende verzekeringen · mislukte
  uitrollen en koppelingen.

Welk punt bij welke functie hoort, volgt uit de functie en zijn rechten (zie
`GEBRUIKERS_01`). Wie een punt niet mag zien, krijgt het niet — ook niet als
teller.

## 3. Bouw voort op wat er al is

Meet en meld eerst wat er bestaat en wat het doet. In elk geval aanwezig:
`werkbak_items`, `gebruikers_meldingen`, `actiepunten`, de werk-inbox met
mailkoppelingen, de goedkeuringsmotor, de factuursignalen en de bewakingsloop.

- **Geen vijfde register erbij.** Kies één van deze als de bron waar alles in
  landt en leg uit waarom; sluit de andere daarop aan of laat ze vervallen.
- Bestaande signalen (factuursignalen, contractbewaking, veiligheidsmeldingen,
  wagenparkmeldingen) worden voeders van de werkbak in plaats van eilanden.
- Meet en meld welke van de genoemde punten nu al berekend worden en welke nog
  niet bestaan. Bouw de ontbrekende erbij.

## 4. De vaste regel — dit is het zwaarste punt

**Nieuwe bewaking levert een punt in de werkbak op, nooit een eigen
menu-ingang met een eigen telbolletje.**

- De bestaande losse ingangen met badges (Contractbewaking onder Personeel,
  Meldingen onder Veiligheid, Meldingen onder Wagenpark) blijven als
  overzichtspagina bestaan, maar hun signalen komen voortaan in de werkbak. De
  telbolletjes daar vervallen.
- Neem deze regel op in de bouwrichtlijnen van het project, zodat elke volgende
  opdracht eraan voldoet.
- Meld bij oplevering welke plekken je hebt omgezet en welke je hebt laten
  staan, met de reden.

## 5. Werkt hij, dan merk ik dat zonder te kijken

- Een punt dat te lang blijft staan, gaat na een vastgestelde termijn ook per
  mail de deur uit naar de persoon die het moet oppakken. Bij geld- of
  veiligheidszaken daarnaast naar René.
- Die termijn is per soort punt instelbaar, niet vastgelegd in de code.

---

## 6. Vul deze opdracht eerst aan, bouw hem daarna

Dit document is geschreven zonder volledige kennis van alles wat er in Connect
bewaakt wordt. Jij kent de hele codebasis. Breid het uit voordat je bouwt, en
bouw daarna in één keer het geheel — niet alleen wat hierboven staat.

Vul in elk geval aan:

- **Welke signalen ontbreken.** Loop alle modules langs en noem alles wat nu
  iets bewaakt, telt of op een status wacht en dat om aandacht van een mens
  vraagt — ook wat nergens zichtbaar is.
- **Bij welke functie elk signaal hoort.** Doe je voorstel; René corrigeert waar
  het niet klopt.
- **Waar deze opzet vastloopt.** Denk aan signalen zonder eigenaar, punten die
  nooit vanzelf verdwijnen, en hetzelfde punt dat uit twee registers binnenkomt.
  Dit weegt het zwaarst: een werkbak die volloopt met punten die niemand kan
  afsluiten, wordt binnen een maand net zo genegeerd als de telbolletjes van nu.
- **Of het breed genoeg is.** Zeg het als je vindt van niet, en waarom.

Lever die aanvulling als eerste hoofdstuk van je antwoorddocument, met je
oordeel erbij. Bouw daarna door zonder op akkoord te wachten — behalve waar je
aanvulling iets raakt dat René al besloten heeft; dat legt je eerst voor.

---

## Vaste eisen

- Toets elke aanname over module, route en bevoegdheid tegen de code en meld
  afwijkingen — pas niets stilzwijgend aan.
- Wijk je af van de scope, meld dat vóór je bouwt.
- Antwoord naar `docs/antwoorden/WERKBAK_01.md`, metingen naar
  `docs/metingen/`.
