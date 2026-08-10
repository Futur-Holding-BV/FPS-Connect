# AKKOORD_01 — De akkoordpoort onder uren en inkoop

**Opdracht voor Replit · 10 augustus 2026 · gemeten op `89277ca9` (`main`)**

Kern in één zin: **een opdracht is pas werkbaar als er een vastgelegd akkoord onder ligt, en alles wat geld kost — uren en inkoop — toetst daarop.**

---

## 1. Waarom — vier gemeten gaten

René's regels: op een concept-calculatie (met of zonder concept-offerte) mogen monteurs geen uren schrijven en mag er geen inkoopbon ontstaan; een offerte moet akkoord zijn; alleen de hoofdbeheerder mag een status terugzetten. Gemeten stand:

| # | Regel | Gemeten |
|---|---|---|
| 1 | geen uren op een concept | **niet ingericht** — `POST /uren` (`routes/uren.ts` r.725) toetst alleen uurcode, HRM-weekvergrendeling en overwerkslot. De status van offerte, calculatie of opdracht wordt nergens gelezen |
| 1b | — | **groter gat:** `bepaalOpdrachtId()` geeft `null` zonder `opdracht_id`/`planning_item_id`, en `toetsUurcode()` r.686 doet dan `return { ok: true }`. **Uren zónder opdracht zijn altijd toegestaan**, met `project_naam` als vrij tekstveld |
| 2 | geen inkoopbon op een concept | **niet ingericht** — `lib/inkoopbonService.ts` leest `opdrachten.offerteId` en maakt de bon **zonder statuscontrole** |
| 3 | offerte moet akkoord zijn | **deels** — statussen zijn `concept → verzonden → bekeken → ondertekend` (+ afgewezen, ingetrokken). Er is **geen status "definitief"**; de opdracht ontstaat bij ondertekening (`portaal.ts` r.528). Een "prijsafspraak-offerte na akkoord op een calculatie" bestaat niet |
| 4 | alleen hoofdbeheerder zet terug | **niet ingericht** — `afgewezen → concept` en `ingetrokken → concept` staan beide op `bevoegdheid: ["offertes", 2]`. **Wél goed: vanuit `ondertekend` bestaat géén terugweg** — die blijft zo |

---

## 2. Het model — één poort, drie gronden

René: *"Ondertekende offerte klinkt te star."* Drie vormen zijn gelijkwaardig:

**A. Ondertekende offerte** — via het portaal, bestaat al.
**B. Opdrachtbevestiging van de opdrachtgever** — door de projectleider geaccepteerd, met het document erbij.
**C. Offerte handmatig op akkoord gezet door de projectleider.**

Leg dat vast op de **opdracht** (`opdrachtenTable` heeft nu géén enkel akkoordveld):

- `akkoord_grond` — `ondertekening` | `opdrachtbevestiging` | `vrijgave_pl`
- `akkoord_door_id` + `akkoord_op`
- `akkoord_document_id` — **verplicht bij grond B**
- `akkoord_herkomst` — **verplicht bij grond C**, kort vrij tekstveld: waar komt het akkoord vandaan (mail / telefonisch / mondeling op locatie), met naam en datum

Waarom die laatste: bij C kan het systeem niet controleren dát er akkoord is. Het verschil tussen *"de PL zegt dat het akkoord was"* en *"telefonisch akkoord met [naam] op 12 augustus"* is precies wat later bij een discussie over meerwerk telt. Geen bewijslast, geen verplicht document — één regel tekst.

**Opmerking bij het bestaande commentaar in `schema/opdrachten.ts` r.8:** daar staat *"Aangemaakt wanneer offerte status 'akkoord' of 'ondertekend' wordt"* — maar een status `akkoord` bestaat niet in `workflow-configs.ts`. Ruim dat commentaar op of maak het waar; laat het niet half staan.

---

## 3. De poort zelf

**Eén functie, niet drie regels op drie plekken.** Bijvoorbeeld `lib/akkoordPoort.ts` met `heeftAkkoord(opdrachtId, tx?)`. Zowel uren als inkoop roepen die aan. Een tweede eigen controle ergens anders is een afwijzingsgrond.

**3.1 Uren.** `POST /uren` (en de wijzigingsroute) weigert met een duidelijke melding zodra de opdracht geen akkoord heeft. Weigeringstekst noemt wat eraan ontbreekt, niet "geen toegang".

**3.2 Uren zonder opdracht.** Dit is een apart en groter probleem. **Niet in deze opdracht dichttimmeren** — kantoor- en magazijnuren horen legitiem geen opdracht te hebben. Wél opleveren in `docs/metingen/AKKOORD_01_uren_zonder_opdracht.md`: **hoeveel urenregels van de laatste 12 maanden hebben `opdracht_id IS NULL`, uitgesplitst naar wel/geen indirecte werkzaamheid en naar medewerkerprofiel.** Blijkt daar een grote groep monteursuren tussen te zitten met alleen een vrije `project_naam`, dan is dat een eigen opdracht waard.

**3.3 Inkoop.** `maakConceptInkoopbon()` weigert zonder akkoord — dus ook de automatische bon uit een goedgekeurde materiaal-aanvraag (`MATERIAAL_01` fase 3). **Gevolg dat je expliciet moet afhandelen:** de goedkeuring van de materiaal-aanvraag mag dan niet stilzwijgend zonder bon eindigen. Weiger de goedkeuring met een heldere melding, of keur goed zonder bon **en** zet er een werkbaksignaal op. Kies één van beide, leg de keuze vast in het antwoorddocument, en bouw niet allebei.

---

## 4. Condities vastleggen — bij alle drie de gronden

Na akkoord moeten de **condities/voorwaarden** vastliggen. Bron per grond:

- **A en C (onze eigen offerte):** de voorwaarden van die offerte. `offerte-voorwaarden-sets` bestaat al — hergebruiken, geen tweede voorwaardenopslag.
- **B (opdrachtbevestiging):** de voorwaarden uit dat document.
- **C aanvullend:** ontbreken er voorwaarden, dan **vult de projectleider ze zelf in**.

Minimaal vast te leggen velden — vul aan op grond van wat de bestaande voorwaardensets al kennen, en meld wat je aantrof: betaaltermijn · garantietermijn · afspraak over meerwerk · opleverdatum of doorlooptijd · eventuele boete- of kortingsclausule · toepasselijke algemene voorwaarden.

---

## 5. ⚠️ De AI kan een opdrachtbevestiging nog NIET lezen — corrigeer deze aanname

Gemeten in `lib/documentIntelligence.ts`:

- er zijn ~20 categorieën, maar **`opdrachtbevestiging` staat er niet bij**; het dichtstbijzijnde is `contract` (routeert naar CRM)
- **alleen `factuur` heeft echte veldextractie** (leverancier, factuurnummer, factuurdatum, vervaldatum, betalingstermijn, bedragen, IBAN, loondeel, tenaamstelling, `onzekere_velden`). Andere categorieën leveren hooguit organisatie + jaar
- **voorwaarden-extractie bestaat nergens**

De machinerie is er wél: sinds `DOCUMENT_01` wordt op volle resolutie gelezen, en de factuurextractie levert al gestructureerde uitvoer mét onzekere velden. **Bouw de categorie `opdrachtbevestiging` naar hetzelfde model als `factuur`**, met de velden uit §4.

**Harde regel, gelijk aan de factuurstroom: de AI vult voor, de mens bevestigt.** Elk uitgelezen veld komt als voorstel in beeld met de vindplaats erbij; onzekere velden worden als onzeker gemarkeerd. Niets wordt stil overgenomen als vastgelegde conditie.

---

## 6. Opdrachten boven €10.000 — bedrijfsleider erbij

**Goed nieuws: de motor bestaat al en hoeft niet gebouwd te worden.** `schema/goedkeuring.ts` kent beleidsregels **per documenttype + bedragsband** (`ondergrens`/`bovengrens`, null = geen grens), met N-van-M-goedkeuringen en drempelgedreven toewijzing. `workflow-configs.ts` roept al `checkVereistGoedkeuring(db, "offerte", bedragInclBtw, null)` aan vóór verzenden.

Twee dingen ontbreken:

1. **De haak zit op offerte-vérzenden, niet op het akkoord op een opdracht.** Voeg de akkoordhandeling toe als entiteit waarop een beleidsregel kan gelden, en configureer de band **vanaf €10.000 → bedrijfsleider**. Dit geldt voor alle drie de gronden.
2. **Er bestaat geen preset "Bedrijfsleider."** De achttien presets in `lib/permissies/src/index.ts` zijn: Administratie · Calculatie · Commercieel · Controleur · Directie · Externe boekhouder · Externe inhuur · HRM-adviseur · Magazijnbeheerder · Monteur · Onderhoudsmonteur · Planner · Project-admin · Projectleider · Timmerman · Uitvoerder · Wagenparkbeheerder · Werkvoorbereider. **Voeg er één toe** — dat mag volgens `RECHTEN_01` (presets bijmaken wél, modules bijmaken niet). Stel voor welke bevoegdheden erbij horen en bouw pas na akkoord van René.

**Bedrag is inclusief of exclusief btw?** Niet zelf invullen — de bestaande aanroep gebruikt `bedragInclBtw`. Meld welke je gebruikt en waarom.

---

## 7. Werkomschrijving door de hele lijn

René: de werkomschrijving moet **binnen de lijn van de aanvraag overal hetzelfde zijn, maar wel aanpasbaar**.

- **Fase 0 eerst meten:** waar staat de werkomschrijving nu in aanvraag/projectkans, calculatie, offerte en opdracht — één veld per stap, of meerdere? Wordt er nu iets gekopieerd? Lever dit op in `docs/metingen/AKKOORD_01_werkomschrijving.md` **voordat je bouwt**.
- Daarna: de omschrijving reist mee bij het aanmaken van de volgende stap, met bewerkrecht per stap. **Bij wijziging wordt zichtbaar dat hij afwijkt van de bron** — geen stille divergentie, geen verplichte gelijkheid.
- **Prijsafspraak-offerte:** bij akkoord op een calculatie zónder offerte wordt er alsnog een offerte aangemaakt met de prijsafspraak, en de werkomschrijving wordt **uit de calculatie gekopieerd** en is daarna aanpasbaar.

---

## 8. Status terugzetten — alleen hoofdbeheerder

De twee terugzet-overgangen (`afgewezen → concept`, `ingetrokken → concept`) worden voorbehouden aan de hoofdbeheerder. **Vanuit `ondertekend` blijft er geen terugweg** — dat is nu al zo en blijft zo.

Datzelfde geldt voor het intrekken van een gegeven akkoord op een opdracht: alleen hoofdbeheerder, en het gaat door het auditspoor.

---

## 9. Wat je NIET doet

- Uren zonder opdracht blokkeren (§3.2 — alleen meten).
- De offertestatussen hernoemen of een status `definitief` toevoegen; `ondertekend` blijft de terminale status.
- Een tweede voorwaardenopslag naast `offerte-voorwaarden-sets`.
- Een eigen goedkeuringspad naast de bestaande goedkeuringsmotor.
- De bedrijfsleider-preset activeren vóór René de bevoegdheden heeft gezien.

---

## 10. Acceptatie — op gedrag

1. Uren boeken op een opdracht zonder akkoord → geweigerd met een melding die zegt wát ontbreekt. Mét akkoord → gaat door.
2. Inkoopbon aanmaken op een opdracht zonder akkoord → geweigerd, langs beide paden (handmatig én uit de materiaal-aanvraag).
3. Alle drie de gronden zijn vast te leggen; B zonder document en C zonder herkomst worden geweigerd.
4. Een opdracht van €12.000 kan pas akkoord krijgen na de bedrijfsleider; €8.000 niet.
5. Terugzetten lukt als hoofdbeheerder en niet met `offertes: 2`.
6. Een opdrachtbevestiging uploaden levert **voorstellen** met vindplaats, geen stil vastgelegde condities.
7. De twee metingen uit §3.2 en §7 liggen er.

---

## 11. Twee vaste eisen

1. **Toets elke aanname over een module, niveau of bestandsplaats tegen de code en meld afwijkingen — pas niets stilzwijgend aan.**
2. **Wijk je van de scope af, meld dat vóórdat je bouwt.**

---

## Antwoorden en bevindingen in de repo

Antwoorden op vragen uit deze opdracht komen **niet alleen in de chat** maar worden vastgelegd in de repo:
- **vragen en bevindingen** → `docs/antwoorden/AKKOORD_01.md`
- **metingen, tellingen en inventarisaties** → `docs/metingen/AKKOORD_01_<onderwerp>.md`

Elk antwoord vermeldt: datum · commit-SHA waarop gemeten is · de vraag · het antwoord · en expliciet wat **gemeten** is en wat **aangenomen**.
Is er een besluit van René nodig, schrijf dat als zodanig op — niet zelf invullen en doorbouwen.
Deze bestanden worden bijgewerkt, niet overschreven; oudere bevindingen blijven met hun datum staan.
