# AI_01 — Van reactief naar meedenkend

**Opdracht voor Replit · 9 augustus 2026 · gemeten op `d3bf870` (`main`)**

---

## 1. De vraag

[stated] René, 9 augustus 2026: *"Denk jij dat AI op modules nog nadrukkelijker aanwezig kan zijn? Laten we de AI-slimheid onbenut?"*

**Het antwoord is niet "meer AI".** Gemeten: `lib/aiPrompts.ts` telt **1.322 regels met 64 prompts**, verdeeld over vrijwel elke module — calculatie, inkoop, magazijn, toolbox, HRM, CRM, offertes, uitvoering, salaris, plattegronden, gereedschapsfoto's, incidenten, LMRA, ZZP-juridisch. In breedte is er niets onbenut.

**Wat wél onbenut blijft, is de soort.** Vrijwel alle 64 zijn **reactief**: je opent een scherm en vraagt om een analyse. Er komt bijna niets uit zichzelf naar je toe, en er is vrijwel niets dat leert van wat FPS zelf al gedaan heeft.

Deze opdracht verandert dat langs drie lijnen: eerst meten wat er werkelijk gebruikt wordt, dan de nuttige uitkomsten naar je toe brengen, en dan de AI een geheugen geven.

---

## 2. Fase 0 — lees wat je al meet

**Dit is geen nieuwe meting. Connect legt dit al vast en niemand kijkt ernaar.**

Gemeten bestaande tabellen:

| Tabel | Wat erin zit |
|---|---|
| `ai_aanroepen` | module · functie · gebruiker · entiteitstype en -id · modelslot · modelnaam · **promptnaam, -versie en -hash** · **prompt- en completiontokens** |
| `ai_veld_correcties` | tekstfragment · veldnaam · **`ai_voorstel`** tegenover **`gekozen`** |
| `ai_categorie_correcties` | idem, op categorieniveau |
| `ai_beslissingen`, `ai_wijzigingsvoorstellen`, `ai_prompt_scans` | besluitvorming en promptbeheer |
| `services/ai-prompt-governance.ts` | promptbeheer |

**Lever vóór er iets gebouwd wordt deze vier tabellen op in `docs/metingen/AI_01_gebruik.md`:**

1. **Per module en functie: hoe vaak aangeroepen** in de laatste 30 en 90 dagen, en door hoeveel verschillende gebruikers.
2. **Per functie: het tokenverbruik** en daarmee de kosten. Welke drie functies kosten het meest, en worden die ook het meest gebruikt?
3. **Per veld: hoe vaak het AI-voorstel is overgenomen tegenover gecorrigeerd** — uit `ai_veld_correcties` en `ai_categorie_correcties`. Dat is de nauwkeurigheid, gemeten aan echt gedrag.
4. **Welke van de 64 prompts zijn in 90 dagen nul keer aangeroepen.**

**Wat die uitkomst bepaalt, en waarom dit vóór alles komt:**

- Een functie die niemand gebruikt wordt **niet uitgebreid** — daar is de vraag waarom, niet hoe meer.
- Een functie waarvan het voorstel vaak wordt gecorrigeerd wordt **verbeterd, niet vermenigvuldigd**.
- Nul keer aangeroepen prompts zijn kandidaat om te verdwijnen. Meld ze; verwijder niets zonder besluit van René.

**Meer AI bouwen bovenop functies die niemand gebruikt, maakt het probleem groter in plaats van kleiner.**

---

## 3. Van reactief naar proactief

De werkbak (`WERKBAK_01`) is het bestaande kanaal om iets naar iemand toe te brengen. Van de veertien voeders komen er nu **twee** uit de AI: conceptantwoorden en eerste reacties op meldingen.

Voeg toe als voeder in de **bestaande** `bewakingsloop.ts` — geen nieuwe planner, geen nieuwe meldingentabel:

1. **Calculatie wijkt af van de eigen historie.** Bestaat al als analyse (`CALCULATIE_ANALYSE_BASE_PROMPT`) maar moet worden opgevraagd. Wijkt een regel sterk af van wat FPS eerder voor vergelijkbaar werk rekende, dan is dat een signaal aan de calculator — vóór de offerte de deur uit gaat.
2. **Inkoopprijs wijkt af.** `INKOOP_PROMPT` bestaat. Zelfde principe: een factuurregel die fors afwijkt van wat je normaal voor dat artikel betaalt.
3. **Magazijnbestelsuggestie.** `MAGAZIJN_BESTELSUGGESTIE_PROMPT` bestaat en wordt nu alleen op verzoek gedraaid. Als voorraad onder de norm zakt hoort dat naar de magazijnbeheerder te komen.
4. **HRM-capaciteitssignalen.** `HRM_CAPACITEIT_SIGNALEN_PROMPT` bestaat. Dit gaat over dekking bij uitval — punt 2 en 7 uit het organisatiedocument. Dat is niets waard als je het moet gaan opvragen.
5. **Werkvoorbereidingsadvies.** `WERKVOORBEREIDING_ADVIES_PROMPT` bestaat, idem.

**De harde regel bij elk van deze vijf:** een AI-signaal in de werkbak is **`soort = "doen"` met een concrete handeling**, of het komt er niet in. "De AI heeft iets opgemerkt" zonder dat er iets te beslissen valt, is ruis — en ruis is precies waar René bij Trello op afknapte.

**Tweede harde regel: elk AI-signaal draagt zijn onderbouwing.** Waarom wijkt dit af, waarvan, en met hoeveel. Zonder dat is het niet te beoordelen en wordt het weggeklikt.

---

## 4. Het geheugen — dit is de grootste winst

In `CALCULATIE_AI_01` en `INKOOP_AI_01` staan bewuste remmen: **geen historisch prijsadvies onder vijf waarnemingen per regelsoort, geen verwachte inkoopprijs onder drie waarnemingen per artikel.**

Die remmen zijn goed. Maar `ENK_IMPORT_01` — geschreven om die historie te vullen — **komt nul keer voor in de changelog en is dus niet gebouwd.** Daarmee zwijgt de AI over precies datgene waar hij het meeste waard zou zijn.

**Dit is de kern van het antwoord op René's vraag.** De AI is niet dom; hij weet niets van FPS. Jaren aan calculaties, eenheidsprijzen en inkoop zitten in ENK en niet in Connect.

**Twee bronnen, in deze volgorde:**

1. **`ENK_IMPORT_01` alsnog uitvoeren.** Die opdracht ligt er al; deze opdracht voegt er niets aan toe behalve de volgorde. **Zonder dit heeft de rest van §4 geen inhoud.**
2. **De correctietabellen als tweede leerbron.** `ai_veld_correcties` legt vast wat de AI voorstelde én wat de mens ervan maakte. Dat is een kant-en-klare leerlus die nu alleen wordt vastgelegd en niet gebruikt.

**Voor die tweede bron gelden strikte grenzen:**

- Correcties worden gebruikt om **voorstellen te verbeteren**, nooit om een besluit automatisch over te nemen.
- Onder **tien correcties op hetzelfde veld** gebeurt er niets. Eén afwijkende correctie is geen patroon.
- Wat er geleerd is, moet **zichtbaar en uitzetbaar** zijn: "dit voorstel is aangepast omdat dit veld twaalf keer eerder anders is ingevuld." Een AI die stilletjes verandert op grond van eerder gedrag is niet te controleren.

---

## 5. De drie modules zonder AI

Gemeten: geen enkele prompt raakt **wagenpark**, **declaraties** of **abonnementen**.

**Beoordeel per module of dat een gat is of terecht** en meld de uitkomst — bouw niet ongevraagd. Aanknopingspunten:

- **Wagenpark** heeft sinds 9 augustus wél een afstootadvies op eigen kostencijfers, buiten `aiPrompts.ts` om. Meld waar dat staat en of dat daarheen verplaatst moet, zodat alle AI op één plek beheerd wordt.
- **Declaraties** — een bonherkenning zou hier hetzelfde doen als bij facturen. Kansrijk, maar alleen als declaraties werkelijk gebruikt worden; controleer dat eerst.
- **Abonnementen** gaat over klantabonnementen; waarschijnlijk terecht zonder AI.

---

## 6. Vaste regels voor AI in Connect

Deze gelden vanaf nu voor elke AI-functie, bestaand en nieuw:

1. **Uitlegbaar.** Elke uitkomst draagt waaróp hij gebaseerd is. Bij een cijfer: het aantal waarnemingen en de periode.
2. **Nooit stil opslaan.** De AI stelt voor, een mens bevestigt. Dat patroon staat al in `FACTUUR_02`, `WERVING_01` en `CONTRACT_01`; het wordt hier algemeen.
3. **Zwijgen boven gokken.** Te weinig gegevens betekent geen advies, met vermelding wat er nodig is om het wel te kunnen geven.
4. **Elke aanroep wordt gelogd** in `ai_aanroepen` met promptnaam en -versie. Dat gebeurt al; het wordt een eis.
5. **Geen AI-signaal zonder handeling.**

---

## 7. Verboden

- Geen nieuwe AI-functie bouwen vóór de meting uit fase 0 is opgeleverd.
- Geen nieuwe promptbestand of tweede plek voor prompts; `aiPrompts.ts` is de enige.
- Geen eigen planner voor de proactieve signalen; de bewakingsloop bestaat.
- Geen nieuwe meldingentabel; de werkbak bestaat.
- Geen automatisch overnemen van een AI-voorstel, in geen enkele module.
- Geen leren van correcties onder de tien waarnemingen per veld.
- Geen prompt verwijderen zonder besluit van René.

---

## 8. Twee vaste eisen

**Toets elke aanname en meld afwijkingen.** Controleer per onderdeel welke module en welk niveau de bijbehorende backendroute werkelijk eist, en meld elk verschil met wat hier staat — **pas niets stilzwijgend aan**.

**Wijk je af van de scope van deze opdracht, meld dat dan vóór je bouwt.**

---

## 9. Acceptatie

Met vermelding van commit-SHA, GitHub `main`-SHA en productie-SHA:

1. **`docs/metingen/AI_01_gebruik.md` is opgeleverd** met de vier tabellen uit §2, inclusief de lijst prompts die nul keer zijn aangeroepen. *Dit is het eerste acceptatiepunt en er is niets gebouwd voordat het er ligt.*
2. Voor elk van de vijf proactieve signalen uit §3: het item verschijnt in de werkbak, is van soort **"doen"**, en draagt zijn onderbouwing. Toon één voorbeeld per signaal.
3. **Een AI-signaal zonder handeling bestaat niet.** Toon dat een uitkomst zonder te nemen besluit nergens als werkbakitem verschijnt.
4. **De remmen werken nog steeds.** Toon een calculatieregel met minder dan vijf waarnemingen: geen advies, wél de mededeling wat er nodig is.
5. **Leren van correcties is zichtbaar en uitzetbaar.** Toon een voorstel dat is aangepast op grond van eerdere correcties, met de uitleg erbij, en toon dat het uit te zetten is.
6. **Onder tien correcties gebeurt er niets.** Toon een veld met negen correcties waarbij het voorstel ongewijzigd blijft.
7. Meld per module uit §5 of het ontbreken van AI een gat is of terecht, met reden.
8. Meld waar het wagenpark-afstootadvies staat en of het naar `aiPrompts.ts` verplaatst moet.
9. **Meld of `ENK_IMPORT_01` is uitgevoerd.** Zo niet, dan is §4 alleen voorbereid en niet werkend — zeg dat expliciet in plaats van het te laten lijken alsof het af is.
