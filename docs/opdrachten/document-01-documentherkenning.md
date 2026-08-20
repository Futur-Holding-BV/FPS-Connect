# DOCUMENT_01 — Documentherkenning betrouwbaar maken

**Opdrachtgever:** René Vink · **Datum:** 7 augustus 2026 · **Uitvoerder:** Replit
**Systeem:** FPS Connect (`vinkrene-jpg/fps-one`, branch `main`)
**Prioriteit: eerst.** `FACTUUR_02`, `FACTUUR_03`, `LOON_01` en `AANVRAAG_01` steunen alle vier op deze module. Zolang hij niet betrouwbaar leest, bouwen we een geldstroom bovenop iets dat niet werkt.

**Verplicht vooraf lezen:** `replit.md` · `docs/ontwikkelfilosofie.md` · `docs/kwaliteitskader.md` · `docs/PRODUCTION_RUNBOOK.md` · `.agents/memory/MEMORY.md`

---

## 1. Het probleem

René: *"wat direct verstorend werkte was dat de AI geen enkel document goed kon lezen met een juiste vervolgactie."* In het overdrachtsdocument staat een concreet geval: een pixelgebaseerde FPS Brandpreventie-PDF werd in productie als Unknown geclassificeerd.

**Dit is geen afstelkwestie. De oorzaak is gemeten en het is er één.**

---

## 2. Gemeten oorzaak: het beeld dat de AI krijgt is onleesbaar

`lib/documentIntelligence.ts` doet drie stappen: bestandstype herkennen → tekstextractie → **AI-vision als terugval wanneer er geen of weinig machineleesbare tekst is**. Die derde stap is waar het misgaat.

Een gescand document doorloopt vier achtereenvolgende verkleiningen:

| Stap | Waar | Instelling | Gevolg |
|---|---|---|---|
| 1. PDF naar beeld | `lib/pdfVisie.ts` r. 22 | `-r 120` (120 DPI) | voor documentherkenning is 200-300 DPI de norm; 120 is al te laag |
| 2. Verkleinen | `pdfVisie.ts` r. 41 en 81 | `resize({ width: 800 })` | een A4 wordt teruggebracht tot 800 pixels breed |
| 3. Comprimeren | `pdfVisie.ts` r. 42 en 82 | `jpeg({ quality: 75 })` | compressieartefacten precies op kleine tekst |
| 4. Aanbieden aan de AI | `documentIntelligence.ts` r. 381 | **`detail: "low"`** | het beeld wordt nogmaals teruggebracht naar circa 512×512 — ongeacht wat er in stap 1 tot 3 gebeurde |

**Wat dat betekent in de praktijk:** een volledige A4-factuur wordt aan de AI aangeboden als een plaatje van ongeveer 512 bij 512 pixels. Bodytekst van 10 punt is daarin nog geen vijf pixels hoog. De AI ziet de vórm van het document — een logo, een tabel, een blok tekst — maar kan geen factuurnummer, geen bedrag, geen IBAN en geen loondeel lezen.

Dat verklaart precies wat René beschrijft: het lukt met geen enkel document, en bij een gescande PDF komt er "Unknown" uit. Documenten mét machineleesbare tekst gaan wél goed, want die lopen niet via vision.

**Stap 4 is de zwaarste.** `detail: "low"` maakt de eerste drie instellingen zinloos: hoe scherp je ook rendert, het wordt alsnog teruggebracht.

---

## 3. Wat er moet gebeuren

**3.1 — `detail` van `low` naar `high`** in `documentIntelligence.ts` r. 381. Dit is de belangrijkste wijziging; zonder deze hebben de andere geen effect.

**3.2 — Renderen op 220 DPI** in plaats van 120 (`pdfVisie.ts` r. 22).

**3.3 — De verkleining naar 800 pixels vervangen** door een bovengrens die tekst leesbaar houdt: maximaal 2000 pixels aan de lange zijde, zonder vergroten. Een A4 op 220 DPI is ongeveer 1870 pixels breed en past daar dus onder.

**3.4 — JPEG-kwaliteit naar 85.**

**3.5 — Meer dan één pagina aanbieden bij meerdere pagina's.** Controleer hoeveel pagina's er nu daadwerkelijk worden gerenderd via `renderPdfPaginas`. Een factuur met een specificatie op pagina twee moet volledig gelezen worden. Bovengrens: de eerste vijf pagina's; zijn het er meer, meld dat expliciet in het bewijsspoor.

**3.6 — Kosten eerlijk benoemen.** Scherpere beelden kosten meer per document. Meet bij de oplevering wat één factuur nu kost aan verwerking, en meld dat getal. Dit is bewust een afweging: een onleesbaar document is gratis maar waardeloos.

---

## 4. Wat er níét mag gebeuren

**Geen tweede documentherkenner bouwen.** Er is er één, en die moet werken.

**Niets gokken bij onleesbaarheid.** Kan de AI een gegeven niet lezen, dan is het antwoord "niet gevonden" en volgt er een gebeurtenis — geen plausibel ingevuld factuurnummer. Controleer of dat nu al zo werkt; is er ergens een terugval die een waarde verzint of overneemt uit de bestandsnaam, dan gaat die eruit.

**Het bewijsspoor blijft.** De module houdt per stap bij wat er gebeurde (`bewijs`-array). Dat moet blijven en moet de nieuwe instellingen vermelden, zodat bij een fout te zien is welke weg het document heeft afgelegd.

---

## 5. Acceptatie — met echte documenten, niet met testbestanden

Verzamel **tien echte documenten** uit de praktijk, met minimaal:

- twee gescande facturen (pixelgebaseerd, geen tekstlaag)
- één factuur van een uitzendbureau **met G-verdeling**
- één meerpagina-factuur met de specificatie op pagina twee
- de FPS Brandpreventie-PDF uit het bekende storingsgeval
- twee prijsaanvragen
- één document dat expliciet géén factuur of aanvraag is

**Per document moet aantoonbaar zijn:**

1. de juiste categorie is herkend;
2. bij een factuur: leverancier, factuurnummer, datum, bedrag en IBAN zijn correct uitgelezen — vergeleken met wat er werkelijk op staat;
3. bij de uitzendbureaufactuur: het loondeel is correct uitgelezen;
4. bij het meerpagina-document: gegevens van pagina twee zijn meegenomen;
5. bij het niet-factuurdocument: er wordt géén factuur van gemaakt;
6. waar iets niet leesbaar was, staat "niet gevonden" — geen verzonnen waarde.

**Lever een tabel op** met per document: wat erop staat, wat de AI eruit haalde, en of dat klopt. Dat is meteen de nulmeting waartegen latere wijzigingen worden afgezet.

**Deze opdracht is niet af bij een groene build.** Hij is af als die tabel er ligt en klopt.
