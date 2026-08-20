# VERVOLG_01 — leidt een knop ergens toe?

**Opdrachtgever:** René · **Uitvoerder:** Replit · **Datum:** 11-08-2026 (opnieuw uitgegeven)
**Gemeten op:** FPS Connect, hoofdversie van 10 augustus. 302 tabellen, 81 schemabestanden.

---

## 1. Waarom deze doorlichting

Connect legt veel vast. De vraag is of er ook iets gebeurt.

Het duidelijkste voorbeeld staat al vast. Een monteur vraagt materiaal aan, de werkvoorbereider keurt goed — en dat goedkeuren zette alleen een woordje in een veld. Er kwam geen bestelling uit, en het taakje in de werkbak bleef openstaan alsof er niets gebeurd was. Voorkant af, achterkant af, niets ertussen.

Dat is inmiddels gerepareerd. De vraag is hoeveel van zulke plekken er nog meer zijn.

---

## 2. Wat er gemeten moet worden

Loop alle 302 tabellen langs en zoek drie soorten velden:

- statusvelden (concept, verzonden, goedgekeurd, afgerond, enzovoort)
- ja/nee-schakelaars
- instellingen die aan of uit kunnen

Zoek per veld drie dingen uit:

1. **waar wordt het geschreven** — welke schermen of handelingen zetten dit veld
2. **waar wordt het gelezen** — waar wordt de waarde weer opgehaald
3. **wat volgt eruit** — gebeurt er buiten het veld zelf ook iets

Geef elk veld daarna een letter:

**A — er volgt iets uit.** Aantoonbaar, buiten het veld zelf: er gaat een taak open of dicht, er ontstaat een ander record, iets anders wordt geblokkeerd, er gaat een bericht uit, een termijn gaat lopen, of de AI gebruikt het.

**B — het verandert alleen zichzelf.** Er zit een knop op, de waarde wordt netjes opgeslagen, en verder gebeurt er niets. Dit was de materiaalaanvraag vóór de reparatie.

**C — dood veld.** Het wordt geschreven maar nergens gelezen, of het wordt gelezen maar speelt nooit een rol in een beslissing.

---

## 3. Hoe het opgeleverd wordt

Eén tabel, gesorteerd op C eerst, dan B, dan A. De dode velden staan bovenaan omdat die objectief vast te stellen zijn en dus de scherpste bevinding vormen.

Voeg daarna één regel toe bij elke C, en bij elke B die geld, veiligheid of een wettelijke termijn raakt: wat gaat er in de praktijk mis doordat hier niets op volgt.

Geen oplossingen, geen urenschattingen, geen voorstellen. Deze opdracht meet en bouwt niets.

---

## 4. Vier valkuilen — hier is eerder op misgegaan

1. **Zoek op gedrag, niet op één woord.** Een zoekactie op een tabelnaam is geen meting. Twee plekken die hetzelfde ophalen doen daarom nog niet hetzelfde.
2. **Let op imports over meerdere regels.** Bij een eerdere telling werden vijf schermen ten onrechte als "doet niets" bestempeld omdat hun schrijfacties over meerdere regels waren geïmporteerd.
3. **Er zijn meerdere manieren om te schrijven.** Naast de gegenereerde hulpfuncties wordt er ook rechtstreeks geschreven. Wie alleen op één vorm zoekt, telt fout.
4. **Bij twijfel: onbekend, met de reden erbij.** Een gegokte A is schadelijker dan een eerlijke onbekende, want een gegokte A verdwijnt uit beeld.

---

## 5. Controle op de meting zelf

De materiaalaanvraag moet er als **A** uit komen, met als gevolg dat goedkeuren een concept-bestelling aanmaakt en het taakje in de werkbak sluit. Komt hij er anders uit, dan deugt de meting niet en moet die eerst gecorrigeerd worden.

---

## 6. Slotregels

- Wijk je af van deze opdracht, meld dat dan vóór je begint.
- Toets elke aanname hierboven tegen de werkelijke code en meld afwijkingen.
- Zet het resultaat als document in de metingen-map, en meld waar het staat.
