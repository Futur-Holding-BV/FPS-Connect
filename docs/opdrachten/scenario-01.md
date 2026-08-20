# SCENARIO_01 — Spelen met de cijfers: wat-als op de jaarbegroting

**Opdrachtgever:** René Vink · **Datum:** 7 augustus 2026 · **Uitvoerder:** Replit
**Systeem:** FPS Connect (`vinkrene-jpg/fps-one`, branch `main`)
**Hangt samen met:** `FINANCIEEL_AI_01`. Deze opdracht maakt daar de vooruitkijkende kant van.

**Verplicht vooraf lezen:** `replit.md` · `docs/ontwikkelfilosofie.md` · `docs/kwaliteitskader.md` · `docs/PRODUCTION_RUNBOOK.md` · `.agents/memory/MEMORY.md`

---

## 1. De vraag

René wil met de cijfers kunnen spelen: *wat als er een monteur bijkomt · wat als Chantal weggaat · wat als we met vier monteurs draaien in plaats van zes.*

Dat is niet vrijblijvend. Het is precies de vraag die bepaalt of het doelbeeld van vier tot zes monteurs rekenkundig sluit — en die vraag is nu niet te beantwoorden zonder een spreadsheet die niemand bijhoudt.

---

## 2. Bouw geen nieuw model

**Gemeten op 7 augustus 2026:** `fie_jaarbegrotingen` bevat al alles wat een scenario nodig heeft — omzetdoel, directe kosten, doelmarge, **AK-bedrag per productief uur**, productieve uren, verdeelsleutel (uren of omzet). Daaronder `fie_ak_posten` per werkgever en categorie met een jaarbedrag. En er bestaat een jaarprognose, capaciteitsberekening en doelmargeberekening.

**Er is geen scenariofunctie** — gecontroleerd, `scenario` en `simulatie` komen in de FIE-module niet voor.

**Een scenario is dus niets anders dan een kopie van de jaarbegroting met een paar gewijzigde uitgangspunten.** De statuslijst is nu `concept | actief | gesloten`; daar komt **`scenario`** bij. Meer is er niet nodig. Hergebruik de bestaande berekeningen — een scenario dat anders rekent dan de werkelijkheid is waardeloos.

---

## 3. Waar je aan kunt draaien

| Knop | Wat er verandert |
|---|---|
| **Aantal monteurs** | productieve uren en personeelskosten |
| **Bezettingsgraad** | welk deel van die uren daadwerkelijk verkocht wordt |
| **Een AK-post weghalen of wijzigen** | bijvoorbeeld een functie of een verzekering |
| **Omzet / productie** | het niveau waarop je uitkomt |
| **Uurtarief** | wat je per uur rekent |
| **Wagenpark** | auto- en leasekosten |

Elk scenario toont dezelfde uitkomsten als de echte begroting: AK-bedrag, **AK-percentage over de productie** (niet over gefactureerde omzet — zie `FINANCIEEL_AI_01` §3.1a), dekkingsbijdrage, bedrijfsresultaat, en het benodigde AK-bedrag per productief uur.

---

## 4. De regel die deze opdracht bruikbaar maakt

**Een scenario met extra capaciteit vraagt verplicht om de aanname over bezetting.**

Zonder die vraag rekent het gereedschap voor dat een monteur erbij het AK-percentage verlaagt — meer uren om de vaste kosten over te spreiden. Dat klopt alleen als die uren ook verkocht worden. Zo niet, dan stijgen de kosten, blijft de productie gelijk, en gaat het AK-percentage per verkocht uur **omhoog**.

Dat is geen theoretisch bezwaar. **Het is precies wat er in 2024 gebeurde:** personeelskosten stegen 34% (€ 551.646 → € 741.517) terwijl de productie vlak bleef (€ 2,08 mln → € 2,11 mln). Een scenariotool zonder bezettingsvraag zou die beslissing destijds hebben aangemoedigd.

**Daarom:**

- bij elk scenario met meer of minder monteurs is de bezettingsgraad een verplicht in te vullen aanname;
- de uitkomst wordt niet als één getal getoond maar **bij meerdere bezettingsniveaus** — bijvoorbeeld 60%, 70%, 80% en 90%;
- en het gereedschap toont het **omslagpunt**: bij welke bezetting verdient deze monteur zichzelf terug.

Dat laatste is het bruikbare antwoord. Niet "een monteur kost € X", maar "hij betaalt zichzelf vanaf 68% billable".

---

## 5. Verdere regels

- **Een scenario raakt nooit de echte begroting.** Status `scenario`, apart zichtbaar, nooit meegerekend in de prognose of in adviezen.
- **Scenario's zijn naast elkaar te zetten** — minimaal drie tegelijk, met de actieve begroting als vertrekpunt in de eerste kolom.
- **Elk scenario legt zijn aannames vast en toont ze.** Een uitkomst zonder zichtbare aanname is niet te beoordelen en over een maand niet meer te reconstrueren.
- **Geen AI-oordeel over de uitkomst.** Het gereedschap rekent; de AI mag hoogstens benoemen welke aanname het meest bepalend is voor de uitkomst. De keuze is van René. Dit sluit aan op de regel uit `FINANCIEEL_AI_01` §4.3: niets automatisch bijstellen.
- **Geen tweede berekening naast `fie-service`.** Wijkt een scenario af van hoe de werkelijkheid wordt berekend, dan is het scenario waardeloos.

---

## 6. Acceptatie

1. Ik kan een scenario maken vanaf de actieve begroting, zonder die te wijzigen.
2. Ik kan het aantal monteurs wijzigen en moet dan verplicht een bezettingsgraad opgeven.
3. Ik zie de uitkomst bij vier bezettingsniveaus, niet bij één.
4. Ik zie bij welke bezetting een extra monteur zichzelf terugverdient.
5. Ik kan een AK-post weghalen — bijvoorbeeld een functie — en zie direct wat dat met het AK-percentage doet.
6. Ik kan drie scenario's naast elkaar leggen, met de huidige begroting ernaast.
7. Bij elk scenario staan de aannames zichtbaar erbij.
8. Het AK-percentage wordt berekend over de productie, niet over gefactureerde omzet.

**Bewijs bij oplevering:** drie werkelijke scenario's doorgerekend — **vier monteurs zonder de twee kantoorfuncties · zes monteurs met · de huidige situatie** — naast elkaar, met de aannames erbij. Dat is meteen het antwoord op de vraag of het doelbeeld sluit.

## 7. Wat niet mag

- Geen scenario zonder expliciete bezettingsaanname bij een capaciteitswijziging.
- Geen scenario dat de actieve begroting kan overschrijven.
- Geen tweede rekenmodel naast `fie-service`.
- Geen uitkomst zonder zichtbare aannames.
- Geen automatisch advies over welk scenario gekozen moet worden.
- Niet melden dat het klaar is op grond van een geslaagde build of typecheck.
