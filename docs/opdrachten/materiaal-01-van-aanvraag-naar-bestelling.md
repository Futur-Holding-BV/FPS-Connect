# MATERIAAL_01 — Van goedgekeurde aanvraag naar een echte bestelling

**Opdracht voor Replit · 10 augustus 2026 · gemeten op `0e1e91c1` (`main`, 09-08 22:08)**

---

## 1. De bevinding

De monteur kan vanaf de telefoon materiaal aanvragen. Die voorkant is goed gebouwd: AI-verrijking (`aiArtikelNaam`, `aiLeverancier`, `aiPrijsIndicatie`, `aiScopeCheck`, `aiAdvies`), foto, en de verplichte vraag **"is dit volgens de opdracht?"** (`ja | wijkt_af | weet_niet`, uit `BOUW_01` §5).

**Maar de keten eindigt nergens.** Vier bevindingen, alle vier gemeten op gedrag:

**1.1 — Behandelen schrijft alleen een status weg.**
`routes/materiaal-aanvragen.ts`, `PATCH /materiaal-aanvragen/:id` zet uitsluitend `status`, `behandelNotitie` en `behandeldDoorId`. Statussen: `nieuw | in_behandeling | goedgekeurd | afgewezen`. Het bestand bevat **nul** verwijzingen naar `inkoopbonnen`, `magazijn_inkooporders` of `reserveringen`. Een goedgekeurde aanvraag wordt dus **geen bestelling**. Iemand typt hem elders over, of vergeet hem.

**1.2 — Het werkbaksignaal wordt nooit gesloten.**
Bij aanmaken gaat er een melding naar de werkvoorbereider via `meldAanWerkvoorbereiderMetCcProjectleider({ herkomstType: "materiaal_aanvraag", herkomstId })`. **Buiten `routes/materiaal-aanvragen.ts` komt de term `materiaal_aanvraag` nergens anders in de codebasis voor** — geen voeder die opnieuw evalueert, geen sluiting bij behandelen. Een afgehandelde aanvraag houdt daarmee een levend signaal in de werkbak. Dat ondermijnt precies waar `WERKBAK_01` voor bedoeld is.

**1.3 — De rechten staan omgekeerd.**
`const lezen = requireBevoegdheid("projecten", 2)` en `const schrijven = requireBevoegdheid("projecten", 3)` (r.27-28). Het **besluit** (`PATCH`, behandelen) hangt aan `lezen` (niveau 2); het **opnieuw draaien van de AI-analyse** (`POST /:id/heranalyseer`) aan `schrijven` (niveau 3). De knop die niets beslist is dus zwaarder beveiligd dan het goedkeuren. Bovendien heet de constante `lezen` terwijl het een schrijfniveau is — misleidend voor iedereen die dit later leest.

**1.4 — De toebehoren-tak is wél compleet.**
`POST /toebehoren-aanvragen` (BOUW_01 §6, bewust zonder `opdracht_id`) landt op de rubriek `gereedschap_toebehoren`, en die is op 09-08 doorgetrokken tot een eigen kostenpost in het magazijn mét retoursaldering en CSV-export. **Het verbruiksspoor is af; het projectmateriaalspoor niet.** Dat verschil is de hele opdracht.

---

## 2. Fase 0 — EERST TELLEN. Niets bouwen vóór deze tabel er ligt.

`NUMMER_01` §4.5 en het statusrapport van 08-08 schrijven allebei voor: **eerst tellen welk inkoopmodel in productie werkelijk gebruikt wordt, dán kiezen.** Het statusrapport zet "nu alvast consolideren" expliciet onder *wat ik juist niet zou doen*. Die regel geldt hier onverkort.

Lever op in **`docs/metingen/MATERIAAL_01_gebruik.md`**, gemeten op **productie** (`connect.fps-one.nl`), met de meetdatum en de commit-SHA erbij:

| # | Wat tellen | Uitsplitsing |
|---|---|---|
| T1 | `inkoopbonnen` | per status, per maand, laatste 12 maanden |
| T2 | `magazijn_inkooporders` | idem |
| T3 | `inkoopplannen` | totaal, en hoeveel daarvan tot een inkoopbon leidden (via `inkoopbon_regels.inkoopplan_regel_id`) |
| T4 | `reserveringen` | per status |
| T5 | `materiaal_aanvragen` | per status **én** per `soort` (materiaal/toebehoren), plus per `volgens_opdracht` |
| T6 | `materiaal_aanvragen` op `goedgekeurd` | hoe oud is de oudste, en hoeveel staan er langer dan 30 dagen op die status |
| T7 | `mod_calc_inkoop_items` | totaal en hoeveel met `offerte_ontvangen = true` |
| T8 | `onderaannemer_orders` | per status |
| T9 | `algemene_inkopen` | per `soort` |
| T10 | **wie maakt ze aan** — per tabel T1/T2/T4 de `aangemaakt_door_id` herleid naar profiel/functie | aantal per profiel |

**Regels bij deze telling:**
- **Een uitkomst van nul is een antwoord, geen reden om de regel weg te laten.** Een tabel die in productie leeg is, is de belangrijkste bevinding die er kan zijn.
- **Niets afronden of interpreteren.** Zet de getallen neer; de duiding is aan René.
- **T10 beantwoordt de vraag "wie beslist dat".** Als blijkt dat één profiel alle inkoopbonnen aanmaakt en een ander alle magazijnorders, dan is het onderscheid organisatorisch en niet technisch.

**Deze telling deblokkeert drie dingen tegelijk:** `MATERIAAL_01` fase 3, `INKOOP_01` (nu stilgezet) en `NUMMER_01` §4.5. Doe hem één keer en laat alle drie hem gebruiken — het statusrapport signaleert zelf dat NUMMER_01 en INKOOP_01 nu onafhankelijk hetzelfde onderzoek doen.

---

## 3. Fase 1 — Werkbaksignaal sluiten (mag direct, geen besluit nodig)

1. Zodra een aanvraag naar `goedgekeurd` of `afgewezen` gaat, wordt het bijbehorende werkbakitem **afgehandeld** — gevonden via `herkomstType = "materiaal_aanvraag"` + `herkomstId`.
2. Bij `in_behandeling` blijft het item open; dat is nog geen afronding.
3. **Herstelronde voor het bestaande bestand:** sluit de werkbakitems waarvan de aanvraag al is afgehandeld. Meld in `docs/antwoorden/MATERIAAL_01.md` hoeveel items dat waren — dat getal is meteen de nulmeting van hoe lang dit al meeloopt.
4. Gebruik het bestaande afhandelmechanisme (`/werkbak/:id/afhandelen`). **Geen tweede sluitroute bouwen.**

---

## 4. Fase 2 — Rechten rechtzetten (mag direct)

**Het principe: een besluit mag nooit lichter beveiligd zijn dan een handeling die niets beslist.**

- Zet `POST /:id/heranalyseer` **omlaag** naar hetzelfde niveau als behandelen (`projecten:2`), **niet** behandelen omhoog. Reden: omhoog zetten kan een werkvoorbereider die vandaag op niveau 2 zit uit zijn eigen werk sluiten — dat is een gedragswijziging die niemand gevraagd heeft.
- Hernoem de constanten zodat ze hun niveau beschrijven in plaats van te suggereren wat ze niet zijn. `lezen`/`schrijven` op niveau 2/3 is misleidend.
- **Meld in het antwoorddocument welke profielen vandaag `projecten:2` en `projecten:3` hebben**, zodat vaststaat dat er niemand toegang wint of verliest.

---

## 5. Fase 3 — De ontbrekende schakel (PAS NA BESLUIT VAN RENÉ)

Voorkant en achterkant bestaan allebei al. Er zit alleen niets tussen. De keuze wélke achterkant, is aan René en volgt uit fase 0. Drie mogelijkheden:

- **A — projectinkoop.** Goedgekeurd → concept-**inkoopbon** op de opdracht, met de aanvraag als bron. Bestellen loopt zoals nu bij de werkvoorbereider.
- **B — voorraad.** Goedgekeurd → **reservering** op het magazijn tegen de opdracht; ontbreekt de voorraad, dan volgt het bestaande magazijn-inkooporderpad.
- **C — de behandelaar kiest per aanvraag** tussen A en B, met een voorstel van het systeem.

**Kandidaat-regel voor C, ter beoordeling — niet zelf invoeren:** staat het gevraagde artikel in `artikelen` mét voorraad, dan B; staat het er niet in, dan A. Dat is een regel die de gegevens kunnen dragen. **Of hij klopt met de werkwijze van FPS weet ik niet — dat is precies de vraag die fase 0 en René samen beantwoorden.**

**Harde randvoorwaarden voor fase 3, ongeacht de keuze:**
1. **Er komt géén vierde manier om te bestellen bij.** Hergebruik de bestaande routes en tabellen. Een nieuw eigen bestelpad is een afwijzingsgrond voor deze opdracht.
2. **De aanvraag houdt een verwijzing naar wat eruit voortkwam**, zodat de monteur kan zien wat er met zijn aanvraag gebeurd is en de keten later te volgen is.
3. **Wat er ontstaat is een concept, geen verstuurde bestelling.** Goedkeuren van een aanvraag is niet hetzelfde als geld uitgeven; de bestaande goedkeur- en verstuurstappen blijven ongemoeid.
4. **`volgens_opdracht = wijkt_af` blijft zichtbaar meelopen** tot in wat eruit voortkomt. Dat is precies het signaal dat later meerwerk of een tegenvaller verklaart.

---

## 6. Wat je in deze opdracht NIET doet

- **De inkooptabellen samenvoegen.** `inkoopbonnen` en `magazijn_inkooporders` delen al `seq_nummer_i` en hetzelfde herzieningsmechanisme (`inkoop_versies.bron_tabel`). Consolideren is een eigen opdracht, ná de telling.
- **`mod_calc_leveranciers` opruimen.** Dat tweede leveranciersregister is een reëel probleem, maar het hoort bij `LEVERANCIER_01`, niet hier.
- **De toebehoren-tak aanpassen.** Die is af en werkt.
- **De AI-verrijking uitbreiden.** De voorkant is niet het probleem.

---

## 7. Acceptatie — op gedrag, niet op een groene build

1. Een aanvraag goedkeuren op de ontwikkelomgeving laat het werkbakitem verdwijnen; afwijzen ook; `in_behandeling` niet.
2. Het aantal gesloten items uit de herstelronde staat in het antwoorddocument.
3. Een gebruiker met `projecten:2` kan zowel behandelen als heranalyseren; er is geen profiel dat toegang verliest — aangetoond met de profielentabel uit §4.
4. Fase 0 ligt er als tabel, met nulwaarden ingevuld, gemeten op productie.
5. Fase 3 is **niet** gebouwd tenzij René een letter heeft gekozen. Is er geen keuze, dan is dat de correcte uitkomst — schrijf dat op en stop.

---

## 8. Twee losse opruimtaken (apart houden van het bovenstaande)

**8.1 — `docs/technische-schuld.md` klopt niet meer.** De samenvattingstabel meldt nog `P1 = 17 items, Opgelost = 2`, terwijl losse punten wél als opgelost gemarkeerd zijn en er aantoonbaar meer gedaan is (centrale foutafhandelaar, rate-limiting op auth, back-upalarm). Herbereken de tabel uit de markeringen. **En structureel: neem het bijwerken van dit document op in de vaste slotparagraaf**, zodat elke opdracht die een schuldpunt oplost de tabel meteen herrekent. Anders loopt hij binnen een week weer achter.

**8.2 — Er moet een nieuw statusrapport komen.** `docs/status/STATUS_2026-08-08.md` is gemeten op `ce243109`; main staat 108 commits verder. Dat rapport is het beste instrument dat er ligt, maar alleen zolang het bijblijft. Lever `docs/status/STATUS_2026-08-10.md` in dezelfde opzet, met per opdracht de stand en de drie SHA's (lokaal, GitHub main, actieve productie).

---

## Antwoorden en bevindingen in de repo

Antwoorden op vragen uit deze opdracht komen **niet alleen in de chat** maar worden vastgelegd in de repo:
- **vragen en bevindingen** → `docs/antwoorden/MATERIAAL_01.md`
- **metingen, tellingen en inventarisaties** → `docs/metingen/MATERIAAL_01_gebruik.md`

Elk antwoord vermeldt: datum · commit-SHA waarop gemeten is · de vraag · het antwoord · en expliciet wat **gemeten** is en wat **aangenomen**.
Is er een besluit van René nodig, schrijf dat als zodanig op — niet zelf invullen en doorbouwen.
Deze bestanden worden bijgewerkt, niet overschreven; oudere bevindingen blijven met hun datum staan.
