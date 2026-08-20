# FINANCIEEL_AI_01 — Kritisch meekijken op AK en bedrijfsresultaat

**Opdrachtgever:** René Vink · **Datum:** 7 augustus 2026 · **Uitvoerder:** Replit
**Systeem:** FPS Connect (`vinkrene-jpg/fps-one`, branch `main`)
**Hangt samen met:** `CALCULATIE_AI_01`. Deze opdracht levert de andere helft van dezelfde vraag.

**Verplicht vooraf lezen:** `replit.md` · `docs/ontwikkelfilosofie.md` · `docs/kwaliteitskader.md` · `docs/PRODUCTION_RUNBOOK.md` · `.agents/memory/MEMORY.md`

---

## 1. De vraag achter deze opdracht

Bij een nieuwe calculatie is niet bekend welke omzet dat jaar gehaald wordt, en dus ook niet welk AK-percentage nodig is. Jaarcijfers vanaf 2023 geven daarvoor houvast.

Maar er is een tweede lever die minstens zo belangrijk is, en die René zelf benoemt: **de AK zelf omlaag brengen.** Het AK-percentage stijgt als de omzet achterblijft — maar het daalt ook als de vaste kosten dalen. Een verzekering die te duur is, een post die is meegegroeid zonder dat iemand ernaar keek: dat werkt door in élke calculatie van dat jaar.

Deze opdracht laat de AI kritisch meekijken op die vaste kosten en daarover adviseren in het dashboard.

---

## 2. Wat er al klaarstaat

**Bouw geen nieuwe financiële administratie.** Het meeste bestaat.

| Onderdeel | Waar | Wat erin zit |
|---|---|---|
| Jaarbegroting per boekjaar | `fie_jaarbegrotingen` | omzetdoel, directe kosten, doelmarge, **AK-bedrag per productief uur**, productieve uren, verdeelsleutel (uren of omzet) |
| AK-posten | `fie_ak_posten` | per werkgever, per **categorie**, met **jaarbedrag** |
| Verzekeringen | `org_verzekeringen` | polissen per FPS-onderneming, **met premie en premiefrequentie** |
| Capaciteit en prognose | `fie_capaciteit`, prognose per boekjaar | productieve uren |
| Nacalculatie | `fie_nacalculaties` | begroot tegenover werkelijk |
| Loonkosten | HRM- en salarismodules | |
| Werkelijk betaalde kosten | facturen (sinds `FACTUUR_02`) | wat er werkelijk is uitgegeven, per leverancier |

**Wat ontbreekt is de verbinding en het oordeel.** De FIE-module wordt door geen enkele AI-prompt geraadpleegd, en `mod-calculatie` kent hem niet — de AK-opslag staat daar gewoon op 15 procent als startwaarde.

**Let op bij de bestaande verzekeringsprompt.** `ORGANISATIE_VERZEKERING_SUGGESTIES_PROMPT` bestaat al, maar die geeft algemene aanbevelingen met typische premiebandbreedtes uit modelkennis — hij kijkt niet naar de polissen die FPS werkelijk heeft. Deze opdracht doet het omgekeerde: uitgaan van de eigen cijfers.

---

## 3. Wat er gebouwd wordt

### 3.1 De AK-omzetverhouding over de jaren

Bereken per boekjaar en **per werkmaatschappij**: totale AK in euro's, gerealiseerde omzet, en het resulterende AK-percentage.

Toon dat als reeks vanaf 2022, niet als één getal. Het gaat om het **verband**, niet om een norm.

**Waarom dit zo moet:** de AK is grotendeels een vast bedrag in euro's terwijl de omzet varieert. Het percentage beweegt dus omgekeerd mee. Eén gemiddeld percentage over drie jaar verbergt precies de informatie die nodig is.

### 3.1a De noemer: productie, niet gefactureerde omzet

**Dit is geen detail — het bepaalt de uitkomst.** Getoetst op de werkelijke jaarrekeningen van Futur Holding:

| Jaar | Gefactureerde omzet | Mutatie onderhanden projecten | Productie |
|---|---|---|---|
| 2022 | € 2.915.342 | −€ 434.560 | € 2.480.782 |
| 2023 | € 1.765.922 | +€ 315.321 | € 2.081.243 |
| 2024 | € 1.677.161 | +€ 430.870 | € 2.108.031 |

De niet-personele overhead (huisvesting, verkoop, auto, kantoor, algemene kosten, afschrijvingen) afgezet tegen beide noemers:

| Jaar | Overhead | % van omzet | % van productie |
|---|---|---|---|
| 2022 | € 295.391 | **10,1%** | **11,9%** |
| 2023 | € 218.750 | **12,4%** | **10,5%** |
| 2024 | € 256.208 | **15,3%** | **12,2%** |

Tegen gefactureerde omzet lijkt de overhead in twee jaar met de helft gestegen. Tegen productie is het beeld vlak. Het verschil komt volledig door het moment van factureren.

**Vaste regel: het AK-percentage wordt berekend over de productie — gefactureerde omzet plus de mutatie onderhanden projecten.** Toon beide, maar reken met productie. Doe je dat niet, dan stuurt de AI op een percentage dat vooral zegt wanneer er is gefactureerd.

### 3.1b Personeelskosten zijn geen AK

In de jaarrekening staan de personeelskosten als één bedrag onder de kostenblok. **Dat is geen AK.** Het bevat zowel productieve uren (monteurs, uitvoerders) als indirecte uren (kantoor, leiding, werkvoorbereiding). Alleen het indirecte deel hoort in de AK.

Die splitsing staat niet in de jaarrekening, maar is wél af te leiden uit de urenregistratie in Connect: productieve uren staan op een opdracht, indirecte niet.

**Zonder deze splitsing is elk AK-percentage een schatting.** Bouw de splitsing dus vóórdat er een percentage getoond wordt, en meld het als bevinding wanneer de urenregistratie er niet toereikend voor is.

Ter grootte-orde, uit de jaarrekeningen: de personeelskosten stegen van € 551.646 (2023) naar € 741.517 (2024) — ruim 34% — terwijl de productie vrijwel gelijk bleef. Dat is de zwaarste beweging in het hele cijferbeeld en verdient als eerste een verklaring.

### 3.2 Het lopende jaar meenemen

Toon de omzet tot nu toe tegenover de begroting, en wat dat betekent voor het AK-percentage bij de huidige koers. Loopt de omzet achter, dan is het AK-percentage in nieuwe calculaties feitelijk te laag — en dat blijkt nu pas bij de jaarrekening.

**Alleen tonen, nooit automatisch bijstellen.** Het percentage verhogen omdat de omzet achterblijft maakt FPS duurder, waardoor er mogelijk minder werk wordt gewonnen, waardoor het percentage nóg verder omhoog moet. Dat is een spiraal en die beslissing hoort bij René, niet bij een automatisme. De AI toont het gevolg; de keuze blijft bij de mens.

### 3.3 Kritisch meekijken op elke AK-post

Per AK-post beoordeelt de AI jaarlijks en bij wijziging:

- **de ontwikkeling over de jaren** — een post die 30% is gestegen terwijl de omzet gelijk bleef, is een signaal;
- **het aandeel in de totale AK** — welke posten bepalen het percentage werkelijk;
- **begroot tegenover werkelijk betaald** — koppel de AK-post aan wat er via de facturen daadwerkelijk is uitgegeven;
- **bij verzekeringen**: de werkelijke premie uit `org_verzekeringen`, afgezet tegen wat gebruikelijk is voor een bedrijf van deze omvang in deze sector, en tegen de eigen historie.

**De uitkomst is een advies met een concrete vervolgstap**, bijvoorbeeld: *"De AVB-premie steeg in drie jaar van € 8.400 naar € 12.900 terwijl uw omzet gelijk bleef. Dat is 0,4 procentpunt van uw AK. Overweeg een offerte op te vragen."*

Dat is precies wat René vroeg: niet alleen constateren, maar aangeven wanneer het tijd is om een offerte op te vragen.

### 3.4 Loonkosten als AK-post

Indirecte loonkosten (kantoor, leiding, niet-productieve uren) zijn vaak de grootste AK-post. Toon die apart, met de ontwikkeling over de jaren en het aandeel in de totale AK.

**Wees hier voorzichtig met adviezen.** Bij loonkosten is een cijfermatige constatering op zijn plaats — een aanbeveling over personeel niet. De AI toont de ontwikkeling en het aandeel; verder gaat hij niet.

### 3.5 Het dashboard

Eén overzicht met:

- de AK-omzetverhouding per jaar en per werkmaatschappij, als reeks;
- het lopende jaar tegenover de begroting;
- de AK-posten gerangschikt op aandeel, met de ontwikkeling erbij;
- de openstaande adviezen, met per advies het bedrag waar het om gaat.

**Rangschik op bedrag, niet op datum.** Een advies over € 4.500 hoort boven een advies over € 200.

---

## 4. Harde regels

- **Elk advies noemt de cijfers waarop het berust** — bedrag, jaar, en de bron. "Deze post is gestegen" is waardeloos; "van € 8.400 in 2023 naar € 12.900 in 2025" is bruikbaar.
- **Geen advies zonder minstens twee jaren gegevens.** Eén jaar is geen ontwikkeling.
- **Waar de AI algemene marktkennis gebruikt** in plaats van FPS-cijfers, zegt hij dat erbij. De premiebandbreedtes uit de bestaande verzekeringsprompt zijn modelkennis, geen meting.
- **Niets automatisch bijstellen.** Geen enkel percentage, geen enkele opslag, geen enkele post wordt door de AI gewijzigd. Hij adviseert; René beslist.
- **Nooit gegevens verzinnen bij een ontbrekend jaar.** Ontbreekt 2024, dan staat er dat 2024 ontbreekt.
- Geen tweede financiële administratie naast FIE.

### 4.1 Vragen in plaats van concluderen

De AI ziet cijfers, geen context. Hij ziet dat een verzekeringspremie met vijftig procent steeg; hij weet niet dat de dekking omhoog moest vanwege een groot project.

**Daarom: waar iets opvalt, stelt de AI een vraag — hij trekt geen conclusie.** Niet *"deze premie is te hoog"* maar *"deze premie steeg van € 8.400 naar € 12.900 terwijl de omzet gelijk bleef — is de dekking gewijzigd?"*

Dat verschil bepaalt of het advies vertrouwd of weggeklikt wordt.

### 4.2 Een maximum op het aantal openstaande adviezen

Veertig adviezen op een dashboard worden er nul.

- Er staan **nooit meer dan tien adviezen tegelijk open**, gerangschikt op bedrag.
- Zijn er meer, dan tonen alleen de zwaarste; de rest wacht tot er ruimte is.
- **Een advies verdwijnt niet vanzelf.** Het blijft staan tot het is afgehandeld of bewust is weggezet, met een reden erbij. Geen verval na een week.

Dat laatste is het verschil tussen een controller en een meldingenlijst.

### 4.3 Niet bijstellen naar gemak

Een controller ontleent zijn waarde aan onafhankelijkheid — hij zegt wat je niet wilt horen.

**Is een advies onwelkom, dan is dat geen reden om de prompt milder te zetten.** Wordt een advies structureel als onterecht ervaren, dan wordt de onderliggende regel of de gegevensbron aangepast, met vermelding van wat er is gewijzigd en waarom. Nooit de toon.

---

## 5. Wat er van René nodig is

De jaarcijfers vanaf 2023 moeten in `fie_jaarbegrotingen` en `fie_ak_posten` terechtkomen: per boekjaar en per werkmaatschappij de gerealiseerde omzet en de AK-posten per categorie.

**Onderzoek eerst of die tabellen daarvoor toereikend zijn.** `fie_jaarbegrotingen` is opgezet als bégroting — vooruitkijkend. Voor deze opdracht is ook de **realisatie** nodig. Ontbreekt dat, meld het als bevinding vóórdat er iets gebouwd wordt; het is een klein veld erbij, maar wel een besluit.

---

## 6. Acceptatie

1. Ik zie per werkmaatschappij de AK-omzetverhouding vanaf 2023 als reeks, niet als één getal.
2. Ik zie wat het AK-percentage zou moeten zijn bij de omzet waar ik dit jaar op koers ligt.
3. Ik zie welke AK-posten het percentage werkelijk bepalen, gerangschikt op aandeel.
4. Bij een post die sterker steeg dan mijn omzet krijg ik een advies met de bedragen erbij en een concrete vervolgstap.
5. Bij verzekeringen wordt de werkelijke premie uit mijn eigen polisgegevens genoemd, niet een algemene bandbreedte.
6. Er wordt nergens automatisch een percentage aangepast.
7. Ontbreekt een jaar, dan staat dat er — er wordt niets ingevuld.

**Bewijs bij oplevering:** het dashboard met echte cijfers van minstens twee boekjaren, en minstens één advies dat aantoonbaar uit die cijfers volgt in plaats van uit algemene kennis.
