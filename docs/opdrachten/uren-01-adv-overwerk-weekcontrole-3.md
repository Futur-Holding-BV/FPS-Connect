# UREN_01 — ADV, overwerk met projectslot, en de wekelijkse volledigheidscontrole

**Opdracht voor Replit · 9 augustus 2026 · gemeten op `d3bf870` (`main`)**

---

## 1. De regel van FPS

[stated] René, 9 augustus 2026:

> 38 uur CAO per week plus 2 uur ADV sparen geeft 40 uur per week volgens de planning.
> Bij ons bouw je alleen op boven de 38u. 2 uur is geregelde ADV. Erboven is overwerk en dat mag alleen vooraf na goedkeuring van de PL. Tijd voor tijd en liefst binnen 1 maand opnemen.

Daaruit volgt:

| Gewerkte uren in een week | ADV | Overwerk |
|---|---|---|
| 36 | 0 | 0 |
| 38 | **0** | 0 |
| 40 | 2,0 | 0 |
| 44 | 2,0 | 4 uur, alleen met open slot |

**ADV = `min(2, max(0, gewerkteUren − 38))`.** Verlof telt niet mee voor ADV-opbouw; alleen werkelijk gewerkte uren.

---

## 2. Wat er nu staat — gemeten

- `lib/db/src/schema/uren.ts` bevat twee tabellen: `uren_registraties` (per dag, met begin- en eindtijd, pauzeminuten → `netto_uren`, status, koppeling aan gebouw/project/opdracht/planningitem) en `week_staten` (jaar, weeknummer, status, `totaal_uren`, `adv_uren`, vergrendeling door HRM).
- De weekstaatstroom is compleet: aanmaken, indienen, goedkeuren, afwijzen, vergrendelen, ontgrendelen.
- `berekenAdv()` in `routes/uren.ts` rekent `gewerkteUren × ADV_FACTOR`, met `ADV_FACTOR = 2/40`, en alleen wanneer het CAO-veld de tekst "metaal" bevat **én** `dienstverband === "vast"`.
- `verlofVoorWeek()` toont goedgekeurd verlof naast de weekstaat, zonder dubbele uren-invoer.
- `POST /uren/tijd-voor-tijd-aanvraag` bestaat en maakt een verlofaanvraag tegen de `isTijdVoorTijd`-verlofsoort van de werkgever.
- `contracturen_per_week` staat op `medewerkers` en op `medewerker_aanstellingen`.

**Wat ontbreekt:**

- Het woord *overwerk* komt **nul keer** voor in `routes/uren.ts` en in het urenschema. Geen drempel, geen grens van 2 uur, geen goedkeuring vooraf. (`akkoord_vereist` op `uren_registraties` is iets anders: klantakkoord bij regiewerk.)
- Er is **geen enkele controle** die een weekstaat tegen de contracturen legt. `contracturenPerWeek` wordt alleen gebruikt in `fie-service.ts` en `verlofprofiel.ts`.
- Er is **geen voeder in `bewakingsloop.ts`** voor onvolledige of niet-ingediende weekstaten.
- `totaal_uren` telt uitsluitend `netto_uren`; verlof telt er niet in mee.

---

## 3. ADV-berekening herstellen

1. `berekenAdv()` wordt `min(2, max(0, gewerkteUren − 38))`, met de 38 en de 2 als **instelling per CAO of per werkgever**, niet als getal in de code.
2. **De CAO-controle mag niet meer op vrije tekst.** Nu bepaalt `cao.toLowerCase().includes("metaal")` of iemand ADV opbouwt. Een andere schrijfwijze of een typefout levert stilzwijgend nul op. Vervang dit door een expliciete instelling op de CAO-keuze of de werkgever.
3. **Komt een medewerker niet in aanmerking voor ADV, dan is dat zichtbaar op de weekstaat** — "geen ADV-opbouw (CAO)" — en niet een leeg veld dat op een fout lijkt.
4. Melden bij oplevering: **hoeveel bestaande weekstaten een andere ADV-uitkomst krijgen onder de nieuwe formule**, met het totaal aan uren verschil. Niets met terugwerkende kracht aanpassen zonder akkoord van René.

---

## 4. Het overwerkslot op een project

**Besloten door René:** het slot mag worden opengezet door **de projectleider en René**.

### 4.1 Hoe het werkt

- Standaard staat het slot op elk project **dicht**. Dicht betekent: een medewerker kan in die week niet boven de 40 uur uitkomen.
- Openzetten gebeurt op een project, met **altijd een einde eraan**. Standaard **tot en met zondag van de lopende week** — dat past op de aanleiding ("het werk is vandaag niet af"). Een andere einddatum mag, een slot zonder einde niet.
- Optioneel een **urenplafond**: bijvoorbeeld maximaal 12 uur extra op dit project. Bereikt het plafond, dan sluit het slot vanzelf.
- Bij het openzetten wordt vastgelegd wie het deed, wanneer, en waarom (één regel tekst, verplicht).

### 4.2 De toets — dit is het lastige deel

De grens van 40 uur geldt **per persoon per week**. Het slot zit **op een project**. Een monteur kan in één week op drie projecten werken.

De regel is daarom: **een weektotaal boven 40 uur is toegestaan voor zover de uren bóven 40 geschreven zijn op een project waarvan het slot op die datum open stond.**

Concreet: staat het weektotaal op 44 uur en zijn er 4 uur op een project met open slot, dan is het toegestaan. Zijn die 4 uur verdeeld over projecten waarvan er maar één open stond, dan wordt alleen het deel op het open project geaccepteerd en de rest geweigerd met een duidelijke melding.

Het gaat om het slot **op de datum van de urenregel**, niet om het slot op het moment van invoeren. Achteraf openzetten om iets goed te praten mag wel, maar wordt zichtbaar vastgelegd.

### 4.3 Wat er gebeurt bij overschrijding zonder open slot

De urenregel wordt **niet stil geweigerd en niet stil afgekapt**. De monteur krijgt te zien dat hij boven de 40 uur uitkomt en dat het project daarvoor niet openstaat, met één handeling: **toestemming vragen**. Die vraag komt bij de projectleider en bij René.

---

## 5. Tijd voor tijd

- Uren boven de 40 met een open slot leveren **automatisch een voorstel** voor een tijd-voor-tijdaanvraag op, via de bestaande route `POST /uren/tijd-voor-tijd-aanvraag`. **Geen nieuwe route en geen nieuwe tabel.**
- Het voorstel wordt getoond, niet stilzwijgend aangemaakt. De medewerker bevestigt.
- **Opnametermijn:** staat tijd-voor-tijd langer dan een maand open, dan komt er een signaal — naar de medewerker en naar de projectleider. Dat is "liefst binnen een maand" uit de regel; het is een herinnering, geen blokkade en geen automatisch verval.

---

## 6. De wekelijkse volledigheidscontrole

Dit is het antwoord op de oorspronkelijke vraag: er is nu niets dat merkt dat iemand zijn week niet vol heeft.

### 6.1 De norm

Per medewerker uit `contracturen_per_week` (via de hoofdaanstelling), **niet het vaste getal 40**. Deeltijders hebben een lagere norm.

### 6.2 Wat meetelt

**Gewerkte uren + goedgekeurd verlof + bijzonder verlof + feestdagen + ziekte.**

Dit is de belangrijkste eis van deze paragraaf. Telt alleen `netto_uren` mee, dan geeft elke vakantieweek vals alarm en zet iedereen de melding binnen een maand uit. `verlofVoorWeek()` levert de verlofuren al; `feestdagen` en `ziekmeldingen` bestaan als tabellen.

### 6.3 De melding

- **Maandagochtend**, over de week ervoor, als voeder in de bestaande `bewakingsloop.ts`. **Geen eigen planner.**
- Naar de **medewerker zelf** wanneer zijn week onder de norm blijft of nog niet is ingediend. Eerst hijzelf — hij kan het oplossen.
- Naar **HRM** wanneer een week twee keer op rij onvolledig is of niet is ingediend. Pas dan is het een probleem van iemand anders.
- Naar **HRM en René** wanneer een week meer dan de norm plus 2 uur bevat zonder open slot — dat is een regel die overtreden is.
- Signalen landen op de **bestaande werkbak**. Geen nieuwe meldingentabel.

### 6.4 Wat er niet in staat

Geen automatische aanvulling van ontbrekende uren, geen voorgevulde weekstaat op basis van de planning. Uren die niet gemaakt zijn horen niet vanzelf in de administratie te verschijnen.

---

## 6b. Uren boeken op een uurcode

[stated] René: *"Uren moeten ook geboekt worden op werkzaamheden. In ENK noemen ze dat uurcodes. Die komen overeen met de geselecteerde uurcodes uit de werkbegrotingen."*

### 6b.1 Gemeten — de keten bestaat al, op één schakel na

- **`mod_calc_normtijden`** heeft `code`, `omschrijving`, `categorie`, `eenheid`, `uren_per_eenheid`, `actief`. **Dat is de uurcodelijst**; er hoeft geen nieuwe tabel te komen.
- **`mod_calc_regels.normtijd_id`** verwijst daarnaar. Een calculatieregel draagt dus al zijn uurcode.
- **`werkbegroting_regels.calc_regel_id`** verwijst naar de calculatieregel. De uurcode van een werkbegrotingsregel is daarmee **afleidbaar**, maar staat er niet zelf op.
- **`uren_registraties.werkzaamheid_categorie` is vrije tekst.** Geen verwijzing, geen lijst, geen controle.

**De enige echt ontbrekende schakel is dus de laatste: een urenregel weet niet op welke uurcode hij hoort.** Daardoor is nu niet te zeggen hoeveel uur er begroot was en hoeveel er geschreven is *per werksoort* — alleen per project als totaal.

### 6b.2 Wat gebouwd wordt

1. **`werkbegroting_regels` krijgt een eigen `normtijd_id`**, gevuld vanuit de calculatieregel bij het opstellen van de begroting. Afleiden via twee stappen werkt tot iemand een regel met de hand toevoegt; dan is de code weg.
2. **`uren_registraties` krijgt een verwijzing naar de uurcode** in plaats van vrije tekst. Het bestaande veld `werkzaamheid_categorie` blijft staan voor wat er nu in zit, maar wordt niet meer gevuld.
3. **Bij het schrijven van uren op een opdracht toont de app de uurcodes die in de werkbegroting van die opdracht voorkomen** — niet de hele lijst met normtijden. Dat is wat René bedoelt met "de geselecteerde uurcodes uit de werkbegrotingen".
4. **Een uurcode is verplicht bij uren op een opdracht.** Uren zonder opdracht (kantoor, magazijn) niet.

### 6b.3 Twee dingen die het anders stukmaken

**Niet alles past op een uurcode uit de begroting.** [stated] René: *"Je hebt werkzaamheden die niet benoemd zijn in de werkbegroting. Zoals opruimen, werkruimte creëren, rondgang met de opdrachtgever, tussentijds materiaal ophalen etcetera. Laten we diverse soortgelijke werkzaamheden als een dropdown aanbieden. Dan gaan we later wel zien hoe dat uitpakt."*

Zonder zo'n lijst kiest een monteur een willekeurige begrotingscode om langs het scherm te komen, en dan is de hele meting waardeloos.

Naast de begrotingscodes komt daarom een tweede groep in dezelfde keuzelijst: **indirecte werkzaamheden**. Startlijst, af te maken door René:

- Opruimen en werkruimte creëren
- Rondgang met de opdrachtgever
- Materiaal ophalen (tussentijds)
- Reistijd
- Wachttijd
- Mobiliseren en demobiliseren
- Werkoverleg en toolbox
- Veiligheid en afzetting

**Deze lijst wordt beheerd in het systeem, niet vastgelegd in de code.** René zegt er zelf bij dat we later zien hoe het uitpakt — dan moet een code toevoegen, hernoemen of uitzetten een handeling in een scherm zijn en geen wijziging in de broncode. Een code die al gebruikt is, wordt op inactief gezet en nooit verwijderd.

**En daar zit ook de opbrengst van "later zien hoe het uitpakt":** na een paar maanden is te zien welk deel van de tijd naar indirect werk gaat en waaraan. Blijkt opruimen structureel een uur per dag, dan is dat geen verlies maar iets dat in de calculatie hoort. Daarvoor moeten deze uren nu wel apart gemeten worden en niet weggemoffeld onder een begrotingscode.

**"Staat niet in de begroting" is informatie, geen fout.** Kan een monteur zijn werk niet kwijt op een code uit de begroting, dan mag hij kiezen voor *werkzaamheid staat niet in de begroting*, met een korte omschrijving. Dat wordt geen blokkade maar **een signaal naar de werkvoorbereider** — het betekent meestal meerwerk of een begroting die niet klopt. Precies wat je wilt weten.

### 6b.4 Wat het oplevert

Met de code op zowel de begrotingsregel als de urenregel is per opdracht te tonen: **begroot uren per uurcode tegenover geschreven uren per uurcode**. Dat is de nacalculatie op werksoort in plaats van op projecttotaal.

En het maakt iets mogelijk dat nu niet kan: `uren_per_eenheid` in `mod_calc_normtijden` is een vaste norm die niemand toetst. Met werkelijke uren per code kun je zien **welke normtijden structureel te laag of te hoog staan**. Dat is buiten scope van deze opdracht, maar het is de reden om de code op de urenregel goed vast te leggen.

---

## 6c. De mandagstaat — uren die het pand uit moeten

[stated] René, 9 augustus 2026: *"Mandagenregister moeten wij meestal meesturen met de facturen. Dus dit is van onze mensen."*

FPS werkt bij een deel van de opdrachten als **onderaannemer**. Dan hoort er bij de factuur een mandagstaat: per week, per werk, per medewerker, per dag het aantal uren — met naam, geboortedatum en BSN, en handtekeningvelden voor opdrachtgever en onderaannemer. Dat is ketenaansprakelijkheid.

Synthetisch voorbeeld: Voorbeeldstraat 4 Teststad, week 9, aannemer Voorbeeld Aannemer, één medewerker, 4,25 uur op maandag.

### 6c.1 Gemeten

- **`medewerkers.bsn` bestaat**, met in de code de aantekening *"verplicht voor loonadministratie; strikt vertrouwelijk"*. `geboortedatum` staat er ook.
- **`facturen` draagt al `g_rekening_van_toepassing`, `g_rekening_bedrag` en `normaal_bedrag`**, en `leveranciers` heeft eveneens een G-rekeningveld. Die kant van de ketenaansprakelijkheid is dus voorzien.
- **Een mandagstaat bestaat nergens.** Nul treffers op mandagstaat, mandagen, manurenstaat of WKA in de hele broncode.

### 6c.2 Wat gebouwd wordt

- **Genereren uit `uren_registraties`** — de gegevens zijn er al: medewerker, datum, opdracht, netto-uren. Per opdracht, per week, per medewerker, uitgesplitst naar dag.
- **Per opdracht of per opdrachtgever instelbaar of een mandagstaat vereist is.** Niet elke opdrachtgever vraagt erom; standaard uit.
- **Meegaan met de uitgaande factuur** als bijlage, niet als los rapport dat iemand erbij moet zoeken. Staat de instelling aan en ontbreekt de mandagstaat bij het factureren, dan is dat een **melding**, geen blokkade.
- **Handtekeningvelden** voor opdrachtgever en onderaannemer op het document.
- Alleen **goedgekeurde** uren komen erop. Een concept-weekstaat levert geen mandagstaat.

### 6c.3 Het BSN — hier moet je scherp op zijn

Een BSN is een bijzonder persoonsgegeven. Het mag hier omdat de wet het bij ketenaansprakelijkheid vraagt, maar dat is een **enge** rechtvaardiging:

- **Het BSN verschijnt uitsluitend op de mandagstaat**, en alleen bij opdrachten waar de instelling uit §6c.2 aanstaat. Nergens anders in enige uitvoer van Connect — geen export, geen rapport, geen AI-aanroep.
- **Elke keer dat een mandagstaat gegenereerd wordt, wordt vastgelegd wie dat deed en voor welk werk.**
- Het document valt onder de bestaande AVG-opruiming, met een eigen bewaartermijn. **Die termijn stelt René vast, niet Replit.**

### 6c.4 Wat hier niet in zit

FPS huurt zelf ook onderaannemers in (`onderaannemer_orders` bestaat). Dan komt de mandagstaat de andere kant op binnen. **Meld of dat in dezelfde stroom past of een eigen opdracht wordt; bouw het hier niet mee.**

---

## 7. Verboden

- `ADV_FACTOR = 2/40` niet laten staan als getal in de code.
- Geen weekcontrole die alleen op `netto_uren` kijkt.
- Geen slot zonder einddatum.
- Geen nieuwe route of tabel voor tijd voor tijd; de bestaande gebruiken.
- Geen eigen planner voor de wekelijkse melding.
- Geen automatische aanpassing van bestaande weekstaten met terugwerkende kracht.
- Geen blokkade op het opnemen van tijd voor tijd na een maand; alleen een signaal.
- Geen BSN in enige uitvoer behalve de mandagstaat zelf.
- Geen mandagstaat uit concept-uren; alleen goedgekeurde uren.
- Geen blokkade op factureren wanneer een mandagstaat ontbreekt; wel een melding.
- Geen nieuwe uurcodetabel; `mod_calc_normtijden` is de lijst.
- De indirecte werkzaamheden niet in de code vastleggen; ze moeten in een scherm te beheren zijn.
- Een gebruikte indirecte code nooit verwijderen; alleen op inactief zetten.
- Geen vrije tekst meer als werksoort op een urenregel bij een opdracht.
- Geen blokkade wanneer het werk niet op een begrotingscode past; dat wordt een signaal.

---

## 8. Twee vaste eisen

**Toets elke aanname en meld afwijkingen.** Controleer voor elk onderdeel welke module en welk niveau de bijbehorende backendroute werkelijk eist, en meld elk verschil met wat hier staat — **pas niets stilzwijgend aan**.

**Wijk je af van de scope van deze opdracht, meld dat dan vóór je bouwt.**

---

## 9. Acceptatie

Met vermelding van commit-SHA, GitHub `main`-SHA en productie-SHA:

1. **ADV klopt.** Toon vier weekstaten: 36 uur → 0 · 38 uur → **0** · 40 uur → 2,0 · 44 uur → 2,0.
2. **Herrekening gemeld:** hoeveel bestaande weekstaten een andere ADV krijgen, en hoeveel uur verschil dat totaal is. Niets aangepast zonder akkoord.
3. **Slot dicht werkt.** Een monteur probeert 42 uur te schrijven op een project met gesloten slot: geweigerd, met de melding en de knop om toestemming te vragen. Toon het scherm.
4. **Slot open werkt.** Projectleider zet het slot open tot zondag; dezelfde 42 uur wordt nu geaccepteerd. Toon wie het openzette en met welke reden.
5. **De verdeling over projecten klopt.** Een week van 44 uur waarvan 2 uur op een open project en 2 uur op een gesloten project: alleen het open deel wordt geaccepteerd. Toon het antwoord.
6. **Slot sluit vanzelf** na de einddatum. Toon een poging de dag erna.
7. **Vakantieweek geeft geen alarm.** Een week met 16 gewerkte uren en 24 uur goedgekeurd verlof geldt als volledig. Toon de berekening.
8. **Onvolledige week geeft wél een melding**, maandagochtend, eerst aan de medewerker. Toon de regel uit `bewaking_draaien` en het werkbak-item.
9. **Tijd voor tijd wordt voorgesteld, niet aangemaakt.** Toon het voorstel en dat er zonder bevestiging niets is vastgelegd.
10. **Tijd voor tijd ouder dan een maand levert een signaal op**, zonder dat het saldo vervalt.
11. **Uurcode verplicht.** Uren schrijven op een opdracht zonder uurcode wordt geweigerd; op een kantooruur niet. Toon beide.
12. **De keuzelijst toont alleen de uurcodes uit de werkbegroting van die opdracht**, plus de indirecte werkzaamheden als aparte groep. Toon de lijst naast de begroting.
12b. **De indirecte lijst is te beheren zonder code**: voeg er een toe, hernoem er een en zet er een op inactief. Toon de drie handelingen en dat de reeds geschreven uren op de inactieve code intact blijven.
13. **Begroot tegenover geschreven per uurcode** is zichtbaar op de opdracht. Toon het overzicht met minstens twee codes.
14. **De mandagstaat wordt gegenereerd** uit goedgekeurde uren, per week per werk per medewerker per dag, met handtekeningvelden. Toon het document voor het synthetische voorbeeld Voorbeeldstraat week 9.
15. **Het BSN staat alleen daar.** Bewijs dat het in geen enkele andere uitvoer, export of AI-aanroep voorkomt.
16. **De mandagstaat gaat mee met de factuur** wanneer de instelling aanstaat, en ontbreken levert een melding op en geen blokkade. Toon beide gevallen.
17. **Concept-uren leveren geen mandagstaat op.** Toon de weigering.
18. **"Staat niet in de begroting" werkt**: de urenregel wordt geaccepteerd en er ontstaat een signaal bij de werkvoorbereider. Toon beide.
