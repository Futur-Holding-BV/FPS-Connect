# FACTUUR_03 — Betaling: selectie, SEPA-generatie en upload

**Opdrachtgever:** René Vink · **Datum:** 7 augustus 2026 · **Uitvoerder:** Replit
**Systeem:** FPS Connect (`vinkrene-jpg/fps-one`, branch `main`)
**Volgorde:** ná `FACTUUR_01` én `FACTUUR_02`. Start niet eerder.

**Verplicht vooraf lezen:** `replit.md` · `docs/ontwikkelfilosofie.md` · `docs/kwaliteitskader.md` · `docs/PRODUCTION_RUNBOOK.md` · `.agents/memory/MEMORY.md`

---

## 0. Waarschuwing vooraf

Dit is het enige deel waar een fout **direct geld kost**. Bouw hier niets "vast optimistisch": bij twijfel gaat er niets weg. Elke regel in dit document die met *weiger* of *geen bestand* eindigt, is bewust zo geschreven.

**Deze opdracht gaat uitsluitend over leveranciersfacturen.** Lonen lopen anders en zitten in `LOON_01` — Connect genereert daar geen SEPA voor.

---

## 1. Ritme en selectie

**Wekelijkse batch.** Neem in elke batch alle goedgekeurde facturen op waarvan de **vervaldatum vóór de eerstvolgende batch valt**. Zo kan er nooit iets te laat zijn, terwijl er in de praktijk in dezelfde week of net ervoor betaald wordt. Betalen gebeurt binnen 30 dagen; ergens in de week van de vervaldatum is acceptabel.

**Vlak vóór het genereren komt een selectiescherm.** René loopt de lijst door en bepaalt per factuur of die daadwerkelijk meegaat.

**Een factuur uitsluiten:**
- vraagt om een reden (kort, uit een korte vaste lijst plus "anders, namelijk");
- de factuur **komt automatisch terug in de eerstvolgende batch**;
- en verschijnt als gebeurtenis op Jacquelines dashboard zolang hij uitgesloten blijft.

Een uitgesloten factuur mag nooit stil blijven staan. Dat is de manier waarop een factuur maanden blijft liggen zonder dat iemand het merkt.

---

## 2. Splitsing: nooit één batch

Een batch wordt altijd opgesplitst naar **BV × bank**:

| BV | Bank | Waarvoor |
|---|---|---|
| FPS Bouw BV | ING bankcourant | gewone leveranciersbetalingen |
| FPS Bouw BV | Rabobank G-rekening | G-deel van uitzend-/inlenersfacturen |
| FPS Brandpreventie BV | idem | idem |
| FPS Onderhoud BV | idem | idem |

Elke BV is in het SEPA-bestand een eigen opdrachtgever met eigen tegenrekening. Welke BV betaalt volgt uit de tenaamstelling op de factuur (bepaald in `FACTUUR_02`).

**Kan de BV niet met zekerheid worden bepaald, dan gaat de factuur niet mee** en wordt hij een gebeurtenis. Nooit gokken welke BV betaalt.

---

## 3. De G-splitsing

Bij een factuur van een leverancier met type `uitzendbureau` of `inlener` (uit `FACTUUR_01`):

- **loondeel** → naar de **G-rekening** van die leverancier
- **restbedrag** (totaal minus loondeel) → naar de **gewone rekening** van die leverancier

Eén factuur levert dus **twee betaalregels** op, in twee verschillende batches (Rabobank G en ING courant).

**Harde controles:**
- loondeel + restbedrag moet **exact** gelijk zijn aan het totaalbedrag van de factuur — anders gaat de factuur niet mee;
- het loondeel komt van de factuur zelf (uitgelezen in `FACTUUR_02`), niet uit een vast percentage;
- ontbreekt het loondeel of is het onwaarschijnlijk, dan is de factuur in `FACTUUR_02` al afgewezen en komt hij hier nooit;
- de G-rekening van de leverancier moet bekend zijn en beginnen met een geldig Nederlands IBAN — is die er niet, dan geen betaalregel maar een gebeurtenis.

---

## 4. De Belastingdienst

Belastingbetalingen lopen **niet** mee in de wekelijkse batch. Ze worden betaald wanneer nodig, vaak met een voorgeschreven betaaldatum.

- eigen betaalopdracht, eigen moment, vanaf de **G-rekening**;
- het **betalingskenmerk** moet ongewijzigd meegaan in de omschrijving — zonder kenmerk komt de betaling wel binnen maar wordt hij niet aan de juiste aanslag gekoppeld;
- een betaling met een lege of gewijzigde betalingskenmerk-regel wordt geweigerd.

---

## 5. Veiligheidscontroles vóór generatie

Deze controles draaien op de goedgekeurde selectie. **Faalt er één, dan wordt er geen bestand aangemaakt** — niet voor die regel, en niet voor de rest van de batch.

1. **IBAN vergeleken met eerdere facturen van dezelfde leverancier.** Is het gewijzigd → betaling gaat niet mee, gebeurtenis naar Jacqueline. Dit is de meest voorkomende vorm van factuurfraude en mag nooit stil doorgaan.
2. **IBAN vormcontrole** (lengte, landcode, controlegetal).
3. **Bedrag > 0** en niet hoger dan het goedgekeurde factuurbedrag.
4. **Geen dubbele betaalregel** voor dezelfde factuur binnen dezelfde of een eerdere batch.
5. **Bij een G-splitsing:** de sombalans uit §3.
6. **Bij Belastingdienst:** betalingskenmerk aanwezig.

---

## 6. Betaallijst en bestand moeten aantoonbaar hetzelfde zijn

René kijkt niet naar het SEPA-bestand zelf; hij loopt de **betaallijst** door. Het risico is dus dat hij lijst X goedkeurt en er bestand Y ontstaat, en dat pas blijkt nadat de bank het heeft uitgevoerd.

Daarom:

- het SEPA-bestand wordt gegenereerd **uít** de goedgekeurde selectie, niet uit een nieuwe database-bevraging;
- na generatie volgt een controle: **aantal betaalregels en totaalbedrag in het bestand moeten exact overeenkomen met de goedgekeurde lijst**;
- komt dat niet overeen, dan wordt het bestand **weggegooid en niet aangeboden**, met een duidelijke melding;
- de betaallijst wordt als PDF bij het bestand bewaard, zodat achteraf te zien is wat er precies is goedgekeurd.

---

## 7. Uitleveren en bijhouden

- Connect **genereert** het SEPA-bestand (PAIN.001); René **downloadt** het en uploadt het zelf bij de bank. Er komt in deze opdracht **geen directe bankkoppeling**.
- Hergebruik de bestaande statusreeks uit `salarisarchief.ts`: `klaar_voor_bank` → `gedownload` → `verwerkt`, inclusief de bestaande auditlog per statuswijziging. Bouw geen tweede statusmodel.
- Zolang een batch niet op `verwerkt` staat, blijven de bijbehorende facturen zichtbaar als "in betaling" — niet als betaald.

---

## 8. Acceptatie — in gewone taal

1. Elke week zie ik een lijst met wat er betaald gaat worden, vóórdat er een bestand bestaat.
2. Ik kan er een factuur uit halen, moet daar een reden bij geven, en hij staat de week erna vanzelf weer op de lijst.
3. Er zijn aparte bestanden per BV en per bank; nooit één bestand met alles erin.
4. Bij een uitzendbureaufactuur zie ik twee regels: het loondeel naar de G-rekening en de rest naar de gewone rekening, samen precies het factuurbedrag.
5. Is het rekeningnummer van een leverancier gewijzigd, dan gaat die betaling niet mee en staat er een melding.
6. Het aantal regels en het totaalbedrag op mijn lijst zijn exact gelijk aan wat er in het bestand zit — anders is er geen bestand.
7. Belastingbetalingen lopen apart, met hun eigen datum en met het betalingskenmerk erin.
8. Ik zie per batch of hij nog klaarstaat, gedownload is, of verwerkt.

**Bewijs bij oplevering:** een testbatch met minstens één G-splitsing, één gewijzigd IBAN dat correct is tegengehouden, en één uitgesloten factuur die de week erna terugkeert. Plus commit-SHA, GitHub main-SHA, actieve productie-SHA.

## 9. Wat niet mag

- Geen betaling die doorgaat bij twijfel. Twijfel betekent: niet mee, en een gebeurtenis.
- Geen tweede statusmodel naast dat van `salarisarchief.ts`.
- Geen directe bankkoppeling in deze opdracht.
- Geen SEPA-generatie voor lonen — die komen extern binnen (`LOON_01`).
- Geen bestand aanmaken dat niet exact overeenkomt met de goedgekeurde lijst.
- Niet melden dat het klaar is op grond van een geslaagde build of typecheck.
