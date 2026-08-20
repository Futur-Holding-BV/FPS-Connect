# INKOOP_01 — Inkoop als stroom

**Opdrachtgever:** René Vink · **Datum:** 8 augustus 2026 · **Uitvoerder:** Replit
**Systeem:** FPS Connect (`vinkrene-jpg/fps-one`, branch `main`)
**Volgorde:** ná `WVB_01` (die levert de behoefte met een nodig-op-datum). Hergebruikt `INKOOP_AI_01`, dat al gebouwd is.

**Verplicht vooraf lezen:** `replit.md` · `docs/ontwikkelfilosofie.md` · `docs/kwaliteitskader.md` · `docs/PRODUCTION_RUNBOOK.md` · `.agents/memory/MEMORY.md`

---

## 1. Waar dit over gaat

**De inkoopplanning bestaat om voorfinanciering te voorkomen.** Niet bij de start van een project vijftig brandwerende voordeuren met alles erop inkopen en in het magazijn zetten. Gefaseerd bestellen, op het moment dat het nodig is. Zo min mogelijk voorraad; liever bestellen op een project.

Alles hieronder dient dat doel of het overzicht dat ervoor nodig is.

---

## 2. De stroom

**Stap 1 — Behoefte.** Komt uit `WVB_01`: per regel wat, hoeveel, voor welk project en **wanneer nodig**. Wat op voorraad ligt telt af.

**Stap 2 — Bundelen of niet.** Zie §3.

**Stap 3 — Boven de grens: offertes.** Bij grotere bedragen worden offertes opgevraagd bij meerdere leveranciers, vergeleken op prijs én op condities, en dan pas ingekocht.

**Stap 4 — Inkoopopdracht.** Inkopen gebeurt **altijd** via een inkoopopdracht, met het **werknummer** erin waarop gefactureerd moet worden. Geen uitzonderingen — dit is de tegenhanger van de afwijsreden `geen_opdracht` in `FACTUUR_02`.

**Stap 5 — Levering.** Meestal via het eigen magazijn, waar het materiaal wordt **klaargezet in de stelling van dat project**.

**Stap 6 — Pakbon.** Zie §5.

---

## 3. Bundelen over projecten

**Het uitgangspunt van René: inkopen voor meerdere projecten kan — je laat het alleen op verschillende momenten uitleveren.** Bestelling gebundeld voor het prijsvoordeel, levering gespreid tegen de voorfinanciering.

**Te bouwen: een inkoopoverzicht over alle projecten heen**, gegroepeerd per artikel, met per regel het project, de hoeveelheid en de nodig-op-datum. Regels over projecten heen aanvinken levert **één inkoopopdracht bij één leverancier**.

**Bindend: elke regel houdt zijn eigen werknummer en zijn eigen leveringsmoment.** Een gebundelde opdracht is één bestelling met meerdere deelleveringen, niet één levering.

**Twee gevolgen die vastgelegd moeten worden:**

**3.1 — De inkoopcondities bepalen of het bundelen werkelijk iets oplevert.** Factureert de leverancier per deellevering, dan blijft het voordeel. Factureert hij de hele opdracht bij de eerste levering, of rekent hij opslag voor het aanhouden, dan betaal je alsnog vooruit en is het voordeel weg. **Leg per leverancier vast hoe hij factureert bij deellevering**, naast betalingstermijn, korting en franco-grens.

Toont de AI een bundelingsvoorstel, dan noemt hij die conditie erbij — of meldt dat hij onbekend is.

**3.2 — Een factuur op een gebundelde opdracht beslaat meerdere projecten.** `FACTUUR_02` gaat nu uit van één opdracht per factuur. Zo'n factuur moet over werknummers verdeeld worden, volgens de regels van de inkoopopdracht. **Meld dit als afhankelijkheid**; zonder die aanpassing loopt de eerste gebundelde inkoop vast bij de factuurcontrole.

---

## 4. Wie mag wat

**Inkoopniveaus per rol, met bedragsgrenzen.** Een werkvoorbereider of projectleider mag tot een bepaald bedrag zelf inkopen; daarboven geeft René goedkeuring.

**Hergebruik de bestaande goedkeuringsmotor.** `/goedkeuring/beleidsregels` bestaat al en is precies hiervoor bedoeld. Bouw geen apart goedkeurpad.

**Nieuwe leverancier — twee gescheiden stappen:**

1. **René besluit** of er zaken mee gedaan wordt. Dat is een relatiebesluit.
2. **Jacqueline legt vast** — de administratie.

Een werkvoorbereider mag hooguit **aanvragen**, nooit zelf een leverancier aanmaken.

**Dit vervangt de eerdere afspraak** in `FACTUUR_01` en `INKOOP_AI_01`, waar stond dat de AI een leverancierstype voorstelt en Jacqueline dat bevestigt. Werk die twee daarop bij.

---

## 5. Pakbonnen

**Nu wordt er niets met pakbonnen gedaan, terwijl de meeste leveranciers ermee leveren.** Daardoor weet het systeem wel wat besteld is, maar niet wat er werkelijk staat — en kan de vraag van de monteur ("wat komt er nog aan en wanneer") niet betrouwbaar beantwoord worden.

**Te bouwen: pakbon fotograferen met de telefoonapp bij ontvangst.** Het beeld gaat door de bestaande documentherkenning, wordt gekoppeld aan de inkoopopdracht, en zet de betreffende regels op geleverd.

Dit sluit twee eerdere opdrachten aan elkaar: `MONTEURAPP_01` levert de installeerbare app, en `DOCUMENT_01` heeft de herkenning leesbaar gemaakt (220 DPI, `detail: "high"`) zodat een foto werkelijk uitleesbaar is.

**Regels:**
- kan de pakbon niet aan een inkoopopdracht gekoppeld worden, dan wordt hij **wel bewaard** en als onverwerkt gemeld — nooit weggegooid, nooit gegokt;
- wijkt het geleverde aantal af van het bestelde, dan is dat een signaal, geen stille correctie;
- de pakbon blijft bewaard als bewijs bij de latere factuurcontrole.

---

## 6. Overzicht en inzicht

**6.1 — Per project:** wat is ingekocht, wat moet nog, en voor wanneer. In één beeld.

**6.2 — Over meerdere projecten:** het overzicht uit §3, dat tegelijk de bundelingskans toont.

**6.3 — Voor de monteurs op een project:** een eenvoudig beeld van **wat er nog aankomt en wanneer**. Geen prijzen, geen leveranciersgegevens — alleen wat er komt, wanneer, en of het al in de stelling staat.

**6.4 — Voor de projectleider: alle offerteaanvragen en offertes moeten zichtbaar zijn en niet in de e-mail blijven hangen.** Een offerteaanvraag die per mail de deur uit gaat, hoort aan de opdracht te hangen — inclusief het antwoord van de leverancier. Sluit aan op de mailstroom uit `FACTUUR_02`; bouw geen apart mailspoor.

---

## 7. Acceptatie

1. Ik zie per project wat er is ingekocht, wat er nog moet, en voor wanneer.
2. Ik zie over projecten heen welke artikelen ik samen kan inkopen.
3. Ik kan regels van drie projecten in één inkoopopdracht zetten, met drie verschillende leveringsmomenten en drie werknummers.
4. Bij een bundelingsvoorstel zie ik hoe die leverancier factureert bij deellevering — of dat dat onbekend is.
5. Elke inkoop loopt via een inkoopopdracht met werknummer; er is geen weg eromheen.
6. Boven mijn ingestelde grens komt een inkoop bij mij ter goedkeuring, daaronder niet.
7. Een werkvoorbereider kan een nieuwe leverancier aanvragen maar niet aanmaken.
8. Ik fotografeer een pakbon met de app en de regels staan op geleverd.
9. Wijkt het geleverde af van het bestelde, dan krijg ik een melding.
10. Een monteur ziet op zijn project wat er nog aankomt en wanneer.
11. Een offerteaanvraag en het antwoord daarop hangen aan de opdracht, niet alleen in een mailbox.

**Bewijs bij oplevering:** één gebundelde inkoopopdracht over minstens twee projecten met verschillende leveringsmomenten, en één echte pakbon die met de app is gefotografeerd en correct gekoppeld.

## 8. Wat niet mag

- Geen inkoop buiten een inkoopopdracht om.
- Geen gebundelde opdracht waarin een regel zijn werknummer of leveringsmoment verliest.
- Geen apart goedkeurpad naast `/goedkeuring/beleidsregels`.
- Geen leverancier aangemaakt door een werkvoorbereider.
- Geen pakbon weggegooid of gegokt.
- Geen apart mailspoor naast de bestaande mailstroom.
- Niet melden dat het klaar is op grond van een geslaagde build of typecheck.
