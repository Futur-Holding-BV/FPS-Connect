# ADVIES_01 — Een adviesrapport inlezen en de calculatie ernaar inrichten

**Opdracht voor Replit · 9 augustus 2026 · gemeten op `d3bf870` (`main`)**

---

## 1. De vraag

[stated] René, 9 augustus 2026: *"Ik wil ook een adviesrapport in kunnen laden, die Connect dan inleest, en de calculatie daarvoor ingericht."*

Aanleiding zijn vijf echte FPS-stukken die hij aanleverde. Het duidelijkste voorbeeld is **VvE De Grundel** (€ 294.452,65): die calculatie is regel voor regel gestructureerd naar de nummering van een **brandveiligheidsconsult-rapport** — 1.3, 1.4, 1.5 … 2.9/2.10/3.9 … 3.11. **Het adviesrapport bepaalt daar de opbouw van de calculatie.**

---

## 2. Gemeten — vier vijfde van de structuur bestaat al

`mod_calc_regels` draagt nu al:

`categorie · omschrijving · **normtijd_id** · **artikel_id** · eenheid · hoeveelheid · tarief · totaal · volgorde · opmerkingen · **regelnummer** · **mu_per_eenheid** · **arbeids_tarief** · onderaanneming_bedrag · is_staartkosten · is_bouwplaatskosten · **hoofdstuk** · klanttekst · btw_tarief · wand_plafond · toepassing_tekst`

**Dat is bijna precies wat de echte calculaties laten zien.** Uit het Cityflat-rapport blijkt de kolomopzet `prijs/eenh · materiaalprijs · mu/eenh · mu totaal · arbeidsloon · totaal`, met **een constant verkoop-uurtarief van € 60,91** en normtijden als 1,2 mu voor een bergingsdeur schilderen en 0,35 voor een bovenlicht kitten. Die velden zijn er.

**En `regelnummer` bestaat al** — precies het veld waarin de nummering van een adviesrapport thuishoort.

### Wat wél ontbreekt

| Wat | Waarom het nodig is |
|---|---|
| **Regelsoort** | de echte calculaties bevatten regels zónder bedrag: `"geen werkzaamheden aannemer"`, `"kopse zijden blijven onbewerkt"`, `"woonkamer-achterdeur"`, `"zie 2.9"`. Nu zou zo'n regel een totaal van € 0 krijgen en meetellen als post |
| **Stelpost als eigen soort** | `"stelpost herstellen tegelwerk keuken €180,- excl btw per woning"` en `"brandoverslagberekening laten uitvoeren -STELPOST €1500,-"` staan als tekst mét bedrag, maar tellen niet mee in het totaal |
| **Optioneel-vlag** | Cityflat: calculatietotaal € 16.330,60, waarvan € 12.180,71 aangeboden en € 4.149,89 als optie. Dat optionele blok zit ín de calculatie maar apart in de offerte |
| **Ouder-kindrelatie tussen regels** | `"afnemen deur Progold € 1,72"` en `"1x gronden en 1x schilderen Satin € 25,28"` horen bij `"bergingsdeuren schilderen 1,2 mu"` erboven. Nu drukt alleen `volgorde` dat uit, en die breekt bij elke herschikking |

---

## 3. De regelsoorten

Voeg één veld toe: **`soort`**, met vijf waarden.

| Soort | Telt mee in totaal | Voorbeeld |
|---|---|---|
| `regel` | ja | bergingsdeuren schilderen, 65 st, 1,2 mu |
| `materiaal` | ja, maar hangt aan een ouderregel | afnemen deur Progold, € 1,72 |
| `tekst` | nee | "geen werkzaamheden aannemer" · "kopse zijden blijven onbewerkt" · "woonkamer-achterdeur" · "zie 2.9" |
| `stelpost` | **nee, maar wél zichtbaar met bedrag** | brandoverslagberekening — stelpost € 1.500 |
| `kop` | nee | "OPTIONEEL HEEL KOZIJN SCHILDEREN" |

En één vlag: **`optioneel`**. Regels met die vlag tellen niet mee in het aangeboden bedrag maar worden **apart onder de offerte vermeld**, precies zoals in de Cityflat-offerte.

**Bestaande calculaties veranderen niet.** Alles wat er nu staat krijgt `soort = "regel"` en `optioneel = false`; er wordt geen enkel bedrag herrekend. Meld hoeveel regels dat betreft.

---

## 4. Het adviesrapport inlezen

### 4.1 Binnenkomen via Slim Upload

`adviesrapport` wordt een categorie in `DOC_CATEGORIEEN` (naast `prijslijst` uit `PRIJS_01`). Herkent Slim Upload er een, dan wordt het bestand gearchiveerd en aangeboden om er een calculatie mee in te richten.

De inhoud wordt gelezen via `documentIntelligence` — dat leest al pdf's en afbeeldingen met `detail: "high"`.

### 4.2 Wat eruit gehaald wordt

- **de genummerde punten** met hun nummer en tekst: 1.3, 1.4, 2.9/2.10/3.9, 3.11
- de **locatie of ruimte** waar het punt over gaat, als het rapport die noemt
- de **geconstateerde tekortkoming** en het **geadviseerde herstel**
- het **hoofdstuk** waar het punt onder valt

**Het nummer uit het rapport gaat één op één naar `regelnummer`.** Dat is de hele koppeling tussen rapport en calculatie, en het maakt de calculatie later terugleesbaar naast het rapport.

Een punt kan meerdere nummers dragen ("2.9/2.10/3.9") — dat blijft zo staan, niet opsplitsen.

### 4.3 Per punt een voorstel

Voor elk gelezen punt wordt één van drie dingen voorgesteld:

1. **Werkzaamheden** — één of meer calculatieregels, met artikel en normtijd waar die te koppelen zijn, volgens dezelfde vier uitkomsten als in `CALC_INVOER_01` §3.3: gevonden, alleen artikel, alleen normtijd, of geen van beide.
2. **`"geen werkzaamheden aannemer"`** als tekstregel — voor punten die niet bij FPS liggen. **Dit is geen weglating maar een vastlegging**, en het staat zo in de echte calculaties. Een intake die alleen invult wat er wél moet gebeuren, gooit bewijs richting de opdrachtgever weg.
3. **Niet te beoordelen** — het punt wordt getoond met de vraag wat ermee moet. Nooit stil overslaan.

**Elk punt uit het rapport komt terug in het voorstel.** Als er dertig punten in staan, staan er dertig regels in het voorstel — desnoods dertig keer "niet te beoordelen". Het aantal punten en het aantal voorgestelde regels worden naast elkaar getoond.

### 4.4 Bevestigen

Hetzelfde variabelenscherm als in `PROJECTSTART_01` §4.3, met de drie soorten waarden: opgegeven, afgeleid met herkomst, en ontbrekend.

**Niets wordt automatisch vastgelegd.** Per punt bevestigen, aanpassen of overslaan. Wat de AI voorstelde tegenover wat de calculator ervan maakte, gaat naar `ai_veld_correcties` — de leerbron uit `AI_01`.

### 4.5 Het rapport blijft eraan hangen

Het ingelezen document wordt gekoppeld aan de calculatie via `document_koppelingen`, zodat je vanuit een calculatieregel terug kunt naar het punt in het rapport waar hij vandaan komt.

---

## 5. Wat dit niet is

**Geen vervanging van de calculator.** Het rapport levert de structuur en de punten; de hoeveelheden, de normtijden en de beoordeling blijven mensenwerk. Een adviesrapport zegt "brandwerendheid onvoldoende bij deze doorvoer", niet hoeveel uur dat kost.

**Geen normtijd of prijs die niet uit de eigen gegevens komt.** Zelfde regel als overal: ontbreekt hij, dan is dat een gat.

---

## 6. Verboden

- Geen bedrag, normtijd of hoeveelheid schatten uit een adviesrapport.
- Geen punt uit het rapport stil overslaan.
- Geen bestaande calculatieregel van soort of bedrag veranderen bij de migratie.
- Geen tweede documentcategorie-mechanisme; `DOC_CATEGORIEEN` is de plek.
- Geen tweede plek voor artikelen of normtijden.
- Geen automatisch vastgelegde calculatieregels.
- Een tekstregel of stelpost mag nooit meetellen in het calculatietotaal.

---

## 7. Twee vaste eisen

**Toets elke aanname en meld afwijkingen.** Controleer per onderdeel welke module en welk niveau de bijbehorende backendroute werkelijk eist, en meld elk verschil met wat hier staat — **pas niets stilzwijgend aan**.

**Wijk je af van de scope van deze opdracht, meld dat dan vóór je bouwt.**

---

## 8. Acceptatie

Met vermelding van commit-SHA, GitHub `main`-SHA en productie-SHA:

1. **De vijf regelsoorten werken.** Toon een calculatie met een gewone regel, een materiaalregel onder een ouderregel, een tekstregel, een stelpost en een kop — en bewijs dat het totaal alleen de eerste twee bevat.
2. **De optioneel-vlag splitst de offerte.** Bouw het Cityflat-voorbeeld na: calculatietotaal € 16.330,60, aangeboden € 12.180,71, optioneel € 4.149,89.
3. **Migratie verandert niets.** Meld hoeveel bestaande regels `soort = "regel"` kregen en bewijs dat geen enkel calculatietotaal is veranderd.
4. **Een adviesrapport wordt herkend** door Slim Upload en aangeboden voor het inrichten van een calculatie.
5. **De nummering komt over.** Lees een rapport met genummerde punten en toon dat `regelnummer` de nummers uit het rapport draagt, inclusief een samengesteld nummer als "2.9/2.10/3.9".
6. **Elk punt komt terug.** Toon het aantal punten in het rapport naast het aantal voorgestelde regels, en dat die aantallen kloppen.
7. **"Geen werkzaamheden aannemer" wordt voorgesteld** waar het punt niet bij FPS ligt, als tekstregel zonder bedrag.
8. **Een punt dat niet te beoordelen is, wordt getoond met een vraag** — niet weggelaten.
9. **Niets vastgelegd zonder bevestiging.** Toon de database vóór en na het inlezen.
10. **Vanuit een calculatieregel is het punt in het brondocument terug te vinden.** Toon de weg terug.
11. Meld voor het gebruikte rapport de **koppelgraad**: bij hoeveel voorgestelde regels zowel artikel als normtijd gevonden werd.
