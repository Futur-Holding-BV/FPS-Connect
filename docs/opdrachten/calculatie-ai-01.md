# CALCULATIE_AI_01 — Adviseren op basis van je eigen cijfers

**Opdrachtgever:** René Vink · **Datum:** 7 augustus 2026 · **Uitvoerder:** Replit
**Systeem:** FPS Connect (`vinkrene-jpg/fps-one`, branch `main`)

**Verplicht vooraf lezen:** `replit.md` · `docs/ontwikkelfilosofie.md` · `docs/kwaliteitskader.md` · `docs/PRODUCTION_RUNBOOK.md` · `.agents/memory/MEMORY.md`

---

## 1. Wat er al is, en waar het tekortschiet

De calculatie-AI bestaat en is niet slecht. `CALCULATIE_ANALYSE_BASE_PROMPT` stelt zich op als senior calculator brandpreventie en krijgt de volledige huidige calculatie mee: gebouw, geregistreerde spots, veldopname, alle regels, de inkoopadministratie, en alle opslagen (AK, ABK, risico, winst, materiaal, arbeid, korting).

**Maar waaraan hij toetst, is niet van FPS.** In de prompt staat letterlijk dat een normale AK plus risico plus winst tussen 30 en 45 procent ligt, en dat hij moet letten op "opvallend lage of hoge tarieven voor brandpreventie in Nederland". Dat zijn vaste getallen in een prompttekst en algemene kennis uit het model — geen enkele verwijzing naar wat FPS zelf rekent.

**Gemeten op 7 augustus 2026:** de analyse krijgt uitsluitend de calculatie mee waar je op dat moment aan werkt. Geen eerdere calculatie, geen prijshistorie, geen eenheidsprijs, geen vergelijking met wat er werkelijk is ingekocht.

Het advies is daarmee dat van een ervaren buitenstaander die je boeken niet kent. Dat is precies het deel dat weinig waard is: algemene brandpreventiekennis kun je overal inhuren. Je eigen prijshistorie is van jou alleen.

---

## 2. Wat er wél klaarstaat om te gebruiken

Bouw geen nieuwe gegevensopslag. Alles wat nodig is bestaat al.

**2.1 De eenheidsprijzenbibliotheek** (`lib/db/src/schema/eenheidsprijzen.ts`) bevat per code: omschrijving, categorie, eenheid, **materiaalcomponent**, **arbeidscomponent**, **normtijd**, kostprijs, verkoopprijs, marge, btw-code, **geldig vanaf**, inclusies en exclusies.

Dit is een complete prijsnorm van FPS zelf. **Hij wordt op dit moment door geen enkele AI-prompt geraadpleegd** — alleen door de importroute en zijn eigen beheerpagina.

**2.2 Alle eerdere calculatieregels** (`calculatie_regels`) bevatten hoeveelheid, stukprijs, eenheid, categorie en omschrijving. Elke calculatie die ooit gemaakt is, is dus een prijsmeting.

**2.3 Werkelijk betaalde inkoopprijzen.** Sinds `FACTUUR_02` komen leveranciersfacturen gestructureerd binnen. Daarmee is voor het eerst te vergelijken wat er gecalculeerd was met wat er werkelijk betaald is.

**2.4 Nacalculatie** (`fie_nacalculaties`) bestaat al als begrip. Controleer wat daar in de praktijk in staat voordat je erop bouwt.

---

## 3. Wat er gebouwd wordt

De analyse krijgt drie extra blokken context mee, naast wat hij nu al krijgt.

### Blok A — De eigen norm per regel

Zoek per calculatieregel de bijbehorende eenheidsprijs op (op code als die er is, anders op omschrijving en eenheid) en geef mee:

- de normtijd, materiaal- en arbeidscomponent uit de bibliotheek;
- de kostprijs en verkoopprijs volgens de bibliotheek;
- **de afwijking van de regel ten opzichte van die norm, in procenten.**

De AI kan dan zeggen: *"deze doorvoering staat op € 47 terwijl je eigen eenheidsprijs € 38 is — 24% hoger, is dat bewust?"* Dat is een advies dat alleen FPS kan krijgen.

Is er geen eenheidsprijs gevonden, dan meldt de AI dát — geen aanname.

### Blok B — De eigen geschiedenis per regelsoort

Geef per regelsoort mee wat FPS de afgelopen periode werkelijk rekende: de mediaan, de laagste en de hoogste stukprijs uit eerdere calculaties, met het aantal waarnemingen en de periode erbij.

**Belangrijk: mediaan, niet gemiddelde.** Eén uitschieter mag het beeld niet bepalen.

Zijn er minder dan vijf waarnemingen, dan wordt dat blok voor die regelsoort **niet meegegeven** — dan is er geen geschiedenis om iets op te baseren, en een advies op basis van twee metingen is slechter dan geen advies.

### Blok C — Gecalculeerd versus werkelijk betaald

Waar mogelijk: wat is er op vergelijkbare regels werkelijk ingekocht volgens de binnengekomen facturen? Dit is het waardevolste signaal, want het legt bloot waar een calculatie structureel te laag zit.

Alleen meegeven waar de koppeling aantoonbaar is. Bij twijfel: weglaten, niet gissen.

### Blok D — De opslagen tegen de eigen praktijk

De vaste norm van 30 tot 45 procent uit de prompttekst gaat eruit. Daarvoor in de plaats: **wat FPS zelf hanteert**, uitgesplitst naar type werk als dat te bepalen is. Wijkt deze calculatie af van wat FPS gewoonlijk rekent, dan is dat het advies — niet een vergelijking met een landelijk gemiddelde dat niemand kent.

---

## 4. De prompt aanpassen

De huidige twaalf aandachtspunten blijven staan; die zijn goed. Er komen drie bij, en één gaat eruit.

**Weg:** *"Afwijkende marge (normale AK+risico+winst voor dit type werk: 30-45%)"* — vervangen door een toets tegen de eigen praktijk uit blok D.

**Nieuw:**

13. Regels die significant afwijken van de eigen eenheidsprijs — noem de afwijking in euro's én procenten.
14. Regels die significant afwijken van wat FPS historisch rekende voor dezelfde soort werk.
15. Regels waar de calculatie structureel onder de werkelijk betaalde inkoopprijs ligt.

**Vaste regel voor de AI:** een advies dat op eigen cijfers berust, **noemt die cijfers**. "Deze regel wijkt af" is waardeloos; "€ 47 tegenover je eigen norm van € 38 en een mediaan van € 39 over 23 eerdere calculaties" is bruikbaar. Waar de AI algemene kennis gebruikt in plaats van FPS-cijfers, zegt hij dat erbij.

---

## 5. Wat niet mag

- **Geen tweede prijzenbibliotheek.** Gebruik `eenheidsprijzen`; ontbreekt er iets, dan is dat een bevinding voor René, geen reden voor een eigen tabel.
- **Geen advies op te weinig waarnemingen.** Onder de vijf: weglaten.
- **Geen gemiddelden** waar een mediaan hoort.
- **Geen verzonnen vergelijking.** Kan een regel niet aan een eenheidsprijs of historie worden gekoppeld, dan meldt de AI dat het onbekend is.
- **De prompt mag geen vaste bedragen of percentages meer bevatten** die als FPS-norm worden gepresenteerd. Normen komen uit de gegevens.
- Niet melden dat het klaar is op grond van een geslaagde build of typecheck.

---

## 6. Acceptatie

Neem **drie echte, afgeronde calculaties** uit de praktijk en draai de analyse opnieuw.

1. Bij minstens één regel noemt de AI de eigen eenheidsprijs met de afwijking erbij, in euro's en procenten.
2. Bij minstens één regelsoort noemt hij de eigen historische mediaan, met het aantal waarnemingen.
3. Waar een regel niet te koppelen was, staat dat er expliciet bij — geen stilzwijgen en geen gok.
4. Het advies over de opslagen verwijst naar wat FPS zelf hanteert, niet naar een landelijk percentage.
5. Bij een regelsoort met minder dan vijf waarnemingen wordt geen historisch advies gegeven.
6. Draai dezelfde calculatie twee keer: de cijfers in het advies zijn identiek.

**Lever een vergelijking op:** dezelfde calculatie, het advies vóór en het advies ná. Dat maakt in één oogopslag zichtbaar wat de eigen cijfers toevoegen — en of het de moeite waard was.
