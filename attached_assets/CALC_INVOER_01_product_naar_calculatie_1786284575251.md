# CALC_INVOER_01 — Van een product op een leverancierssite naar een calculatieregel

**Opdracht voor Replit · 9 augustus 2026 · gemeten op `d3bf870` (`main`)**

---

## 1. De vraag

[stated] René, 9 augustus 2026:

> Ik heb de website open staan van een leverancier-fabrikant, een product is te zien. Bijvoorbeeld Knauf met een wandsysteem W111. Ik zou dat willen kunnen aanklikken of omkaderen met de muis, en dat de AI dat wandsysteem inbouwt in mijn calculatie. Even de lengte en hoogte erbij. Idem voor een brandklep, manchet, deuren etcetera.

---

## 2. Wat er al is, en wat de echte moeilijkheid is

**Gemeten — de helft bestaat al:**

- **`CALCULATIE_VULLEN_BASE_PROMPT`** genereert zes tot veertien calculatieregels op basis van projectcontext, met de eigen tarieven, en geeft er waarschuwingen bij over ontbrekende posten. De uitvoervorm ligt vast: hoofdstuk · categorie · omschrijving · eenheid · hoeveelheid · tarief · `mu_per_eenheid` · `arbeids_tarief` · staartkosten · bouwplaatskosten · klanttekst.
- **`documentIntelligence.ts` leest afbeeldingen** en stuurt ze met `detail: "high"` naar het model (r.380-385). Een geplakte schermafdruk is dus leesbaar — en sinds `DOCUMENT_01` op bruikbare kwaliteit.
- **`mod_calc_artikelen`** bevat leverancier, artikelcode, omschrijving, eenheid, inkoopprijs, verkoopprijs, categorie.
- **`mod_calc_normtijden`** bevat code, omschrijving, categorie, eenheid en **uren per eenheid** — de arbeidskant.

**Wat níét bestaat: de server haalt geen externe webpagina's op.** `link-scanner.ts` beoordeelt uitsluitend de reputatie van een URL (verdachte TLD's, IP-adressen, verkorters, typosquatting) en haalt hem niet binnen. Dat is geen omissie maar voorzichtigheid.

**En dit is de kern: het herkennen is het makkelijke deel.** Knauf W111 herkennen kan het model prima. Het moeilijke is de koppeling aan **jouw** artikel en **jouw** normtijd. Een wandsysteem rekent per m², een brandklep per stuk. Vindt het systeem geen normtijd, dan ontstaat er een regel met materiaal en zónder arbeid — en dat is **erger dan geen regel**, want de calculatie lijkt dan compleet terwijl het uurloon ontbreekt.

---

## 3. Wat gebouwd wordt

### 3.1 Invoer: plakken

Op het calculatiescherm komt één invoerplek waar je kunt plakken:

- **geplakte tekst** — de productbeschrijving die je op de site selecteert en kopieert;
- **een geplakte schermafdruk** — via `documentIntelligence`, dat dit al kan;
- **een productdocument** (pdf-blad van de fabrikant) — via dezelfde weg.

Daarnaast twee invoervelden voor de maatvoering: **lengte en hoogte** (of een andere eenheid, afhankelijk van het herkende product), plus een vrij veld voor bijzonderheden.

**Een URL laten ophalen door de server valt buiten deze opdracht.** Dat is een nieuwe capaciteit met een eigen risico — een server die willekeurige adressen benadert, is een bekend aanvalspad, en `link-scanner.ts` laat zien dat daar al over nagedacht is. Wil René dat later, dan hoort daar een vaste lijst toegestane leveranciersdomeinen bij. **Meld dat als aparte keuze; bouw het hier niet.**

### 3.2 Herkennen

De AI leest het geplakte materiaal en levert per herkend product:

- fabrikant en productaanduiding (bijvoorbeeld Knauf W111)
- soort en toepassing
- **eenheid** waarin het gerekend wordt (m², st, m)
- de eigenschappen die voor de calculatie tellen — brandwerendheid, afmetingen, materiaal
- de hoeveelheid, berekend uit de opgegeven maatvoering

### 3.3 Koppelen — hier zit het werk

Per herkend product wordt gezocht naar:

1. **een eigen artikel** in `mod_calc_artikelen` — op artikelcode, anders op leverancier plus omschrijving;
2. **een normtijd** in `mod_calc_normtijden` — voor het arbeidsdeel.

Vier uitkomsten, elk met een eigen zichtbare stand:

| Uitkomst | Wat er gebeurt |
|---|---|
| Artikel **én** normtijd gevonden | volledige conceptregel, materiaal en arbeid |
| Alleen artikel | regel met materiaal, **arbeid als ontbrekend gemarkeerd**, met de vraag welke normtijd erbij hoort |
| Alleen normtijd | arbeidsregel, materiaalprijs als ontbrekend gemarkeerd |
| Geen van beide | **geen regel**, wel een melding met wat er herkend is en de vraag of het als nieuw artikel moet worden aangelegd |

**Nooit een regel met een verzonnen prijs of een verzonnen normtijd.** Ontbreekt er iets, dan staat dat er als ontbrekend — zichtbaar, niet als nul.

### 3.4 Bevestigen

De uitkomst is een **voorstel**, geen invoer. De calculator ziet de voorgestelde regels naast elkaar met per regel wat er gekoppeld is en wat niet, en kiest wat hij overneemt. **Niets wordt automatisch opgeslagen** — hetzelfde patroon als in `FACTUUR_02`, `WERVING_01` en `CONTRACT_01`.

Wat de AI voorstelde en wat de calculator ervan maakte, wordt vastgelegd in `ai_veld_correcties` — dat is de leerbron uit `AI_01`.

### 3.5 Een nieuw artikel aanleggen

Herkent het systeem een product dat nog niet in `mod_calc_artikelen` staat, dan kan het in één handeling worden aangelegd met wat er herkend is: leverancier, artikelcode, omschrijving, eenheid, categorie.

**De prijs wordt niet overgenomen van de website.** Een adviesprijs op een fabrikantensite is niet wat FPS betaalt. Het prijsveld blijft leeg tot iemand hem invult of tot er een inkoopfactuur binnenkomt — dat is de weg die `LEVERANCIER_01` en `INKOOP_AI_01` al leggen.

---

## 4. Meten wat het waard is

Lever na een proefperiode op in `docs/metingen/CALC_INVOER_01_koppelgraad.md`:

- hoe vaak er geplakt is;
- **in hoeveel gevallen zowel artikel als normtijd gevonden werd** — dat getal bepaalt of dit werkelijk tijd bespaart;
- welke producten het vaakst niet te koppelen waren.

**Blijkt de koppelgraad laag, dan is de oplossing niet betere herkenning maar een vollere artikelen- en normtijdenbibliotheek** — en dat is precies wat `ENK_IMPORT_01` zou vullen.

---

## 5. Waarom niet wat René letterlijk vroeg

Omkaderen met de muis op een externe website vereist een **browserextensie**: een stuk software dat op elke pagina mag meelezen. Dat is een apart product met eigen onderhoud, een eigen installatie op elke computer, en een eigen beveiligingsverhaal.

**Plakken geeft vrijwel hetzelfde gemak** — selecteren, kopiëren, plakken is drie handelingen — en werkt vandaag, op elke computer, zonder installatie.

**Voorstel: bouw dit eerst, meet de koppelgraad uit §4, en beoordeel dán of een extensie de moeite is.** Is de koppelgraad laag, dan lost een extensie niets op; die maakt alleen het invoeren sneller, niet het koppelen beter.

---

## 6. Verboden

- Geen externe URL's ophalen vanaf de server.
- Geen prijs overnemen van een fabrikants- of leverancierswebsite.
- Geen calculatieregel met een geschatte of ingevulde normtijd; ontbreekt hij, dan staat dat er.
- Geen automatisch opgeslagen calculatieregels.
- Geen tweede plek voor artikelen of normtijden; `mod_calc_artikelen` en `mod_calc_normtijden` zijn de enige.
- Geen nieuwe promptbestand; `aiPrompts.ts` is de enige.

---

## 7. Twee vaste eisen

**Toets elke aanname en meld afwijkingen.** Controleer per onderdeel welke module en welk niveau de bijbehorende backendroute werkelijk eist, en meld elk verschil met wat hier staat — **pas niets stilzwijgend aan**.

**Wijk je af van de scope van deze opdracht, meld dat dan vóór je bouwt.**

---

## 8. Acceptatie

Met vermelding van commit-SHA, GitHub `main`-SHA en productie-SHA:

1. **Een geplakte productbeschrijving levert conceptregels op.** Gebruik een echt voorbeeld — een Knauf-wandsysteem met lengte en hoogte — en toon het voorstel.
2. **Een geplakte schermafdruk werkt even goed.** Toon dezelfde uitkomst uit een afbeelding.
3. **Een brandklep levert een regel per stuk op, een wandsysteem per m².** Toon beide.
4. **Een product zonder normtijd levert géén stille regel op.** Toon dat het arbeidsdeel als ontbrekend wordt gemeld en dat er gevraagd wordt welke normtijd erbij hoort.
5. **Een onbekend product levert geen regel op**, wel een melding met wat er herkend is en het aanbod het als artikel aan te leggen.
6. **Er wordt geen prijs van de website overgenomen.** Toon een aangelegd artikel met een leeg prijsveld.
7. **Niets wordt automatisch opgeslagen.** Toon dat de calculatie ongewijzigd is zolang de calculator niets bevestigt.
8. **De correctie wordt vastgelegd.** Wijzig één voorgestelde regel en toon de regel in `ai_veld_correcties`.
9. **Koppelgraad gemeten.** Lever de telling uit §4 op over minimaal tien plakhandelingen.
