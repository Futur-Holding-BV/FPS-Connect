# KALENDER_01 — Jaarkalender: collectieve vrije dagen, keuringen en vakanties

**Opdracht voor Replit · 9 augustus 2026 · gemeten op `d3bf870` (`main`)**

---

## 1. Wat René wil

[stated] René, 9 augustus 2026:

> Ik wil de administratie de mogelijkheid geven om begin van het jaar collectief vrije dagen in de jaaragenda te zetten. Maar ook terugkerende afspraken, zoals APK, gereedschapskeuringen etcetera. Daarnaast in deze jaarkalender de vakanties.

En op de vraag of een collectieve vrije dag van het verlofsaldo af gaat: **ja, die gaat eraf.**

---

## 2. Gemeten uitgangssituatie

**Er is geen jaarkalender.** Nul agenda-, kalender- of eventtabellen in het hele schema.

**Maar bijna alle inhoud bestaat al:**

| Wat | Waar het al staat |
|---|---|
| Feestdagen | `feestdagen` (werkgeverId, jaar, datum, naam) met CRUD op `/feestdagen`, wijzigen alleen beheerder |
| APK | `voertuigen.apk_datum` |
| Gereedschapskeuring | `gereedschappen.keuringsplichtig · keuring_norm · keuring_verval_datum · laatste_keuring · volgende_keuring` |
| Periodiek onderhoud | `wagenpark_onderhoud` (type `periodiek | apk | bandenwissel | …`) |
| Inspecties | `inspecties` · `pbm_inspecties` · `veiligheidsmiddel_inspecties` |
| Vakanties | goedgekeurde `verlofaanvragen` |
| Verlofafboeking | bestaat: `services/workflow-configs.ts` r.57-61 werkt `opgenomen_uren` en `saldo_uren` bij |

**Wat níét bestaat:** een collectieve vrije dag als bedrijfsdatum, en een werkdagenpatroon per medewerker (zie §4.3).

---

## 3. Het dragende ontwerpbesluit

**De drie dingen uit de vraag zijn niet hetzelfde soort item.**

- **Collectieve vrije dagen** moeten worden **ingevoerd**. Dat is nieuw.
- **APK, keuringen, onderhoud en inspecties** bestaan al. Die worden **getoond**, niet ingevoerd.
- **Vakanties** bestaan al als goedgekeurde verlofaanvragen. Idem.

**De jaarkalender is dus vrijwel geheel een weergave over bestaande gegevens, met precies één nieuw invoerbaar item.**

Wordt dit een agenda waarin je APK-data overtikt, dan ontstaat een tweede waarheid naast het voertuigdossier. Die twee lopen binnen een jaar uit de pas en dan weet niemand welke klopt. **Afgeleide items worden nooit gekopieerd — ze worden gelezen uit hun bron.**

Klikt iemand op een keuringsdatum in de kalender, dan gaat hij naar het gereedschap of het voertuig zelf. Daar wordt de datum gewijzigd, niet in de kalender.

---

## 4. De collectieve vrije dag

### 4.1 Vastleggen

Een collectieve vrije dag wordt vastgelegd door de administratie (recht `personeel` niveau 2), met: werkgever, datum, naam, en de verlofsoort waartegen hij wordt afgeboekt — uit de bestaande `verlofsoorten` met `collectief = true`.

Meerdere dagen in één keer invoeren moet kunnen; dat is de aanleiding ("begin van het jaar").

### 4.2 Afboeken — hergebruik, niets nieuws

[stated] De dag gaat van het verlofsaldo af.

Bij het definitief maken wordt per actieve medewerker **een goedgekeurde verlofaanvraag** aangemaakt tegen die verlofsoort, en wordt het saldo afgeboekt **via de bestaande functie in `services/workflow-configs.ts`**. Geen tweede afboekmechanisme, geen directe muteringen op `verlof_saldi`.

Daarmee verschijnt de dag automatisch op de goede plekken: in `verlofVoorWeek()` in de weekstaat, in het verlofoverzicht van de medewerker, en in de weeknorm van de volledigheidscontrole uit `UREN_01`.

### 4.3 Hoeveel uren — hier zit een gat

Het aantal af te boeken uren volgt uit de contracturen van de medewerker. Maar:

**Er bestaat geen werkdagenpatroon per medewerker.** Gemeten: geen veld voor werkdagen, rooster, dagen per week of werkpatroon in het hele HRM-schema. Alleen `contracturen_per_week` en `deeltijd_percentage`.

Daardoor is voor een deeltijder niet vast te stellen of hij op die dag werkt. Iemand die 32 uur werkt op maandag tot en met donderdag hoort voor een collectieve vrijdag **nul** uur af te boeken; het systeem kan dat nu niet weten.

**Deze opdracht lost dat op de eenvoudigste manier op:** afboeken naar rato — `contracturen_per_week ÷ 5`. Voor een 32-urige is dat 6,4 uur in plaats van 8.

**En het meldt de beperking expliciet aan de administratie** bij het invoeren: "voor deeltijders wordt naar rato afgeboekt; werkt iemand op deze dag niet, corrigeer dat dan met de hand." Een werkdagenpatroon toevoegen is een aparte opdracht en valt hier buiten — **maar het moet gemeld worden, niet stil opgelost met een aanname.**

### 4.4 Vier gevallen die geregeld moeten zijn

1. **Onvoldoende saldo.** De afboeking gaat door en het saldo mag negatief worden, maar de administratie krijgt een overzicht van wie negatief staat. Niet stil weigeren, niet stil afkappen.
2. **Later in dienst.** Komt iemand na de collectieve dag in dienst, dan wordt er niets afgeboekt. Komt iemand ervóór in dienst maar ná het vastleggen, dan wordt de dag alsnog aangemaakt bij indiensttreding.
3. **Uit dienst.** Een collectieve dag na de uitdiensttredingsdatum wordt niet aangemaakt.
4. **Terugdraaien.** Wordt een collectieve dag verwijderd of verplaatst, dan worden de bijbehorende verlofaanvragen ingetrokken en de saldi teruggeboekt — via hetzelfde mechanisme, in één handeling, met een overzicht van wat er is teruggedraaid.

### 4.5 Wat de dag verder doet

- **Niet inplanbaar.** De planning toont die dag als collectief vrij en staat er geen inzet op.
- **De weeknorm van `UREN_01` gaat omlaag.** Dat volgt vanzelf als de dag als verlof is geboekt (§4.2) — controleer dat en toon het.

---

## 5. De kalenderweergave

E�n scherm per jaar, met de maanden onder elkaar en per dag wat er speelt. Vier soorten items, elk herkenbaar:

1. **Feestdagen** — uit `feestdagen`
2. **Collectieve vrije dagen** — het nieuwe item
3. **Keuringen en onderhoud** — uit `voertuigen.apk_datum`, `gereedschappen.volgende_keuring`, `wagenpark_onderhoud`, `inspecties`, `pbm_inspecties`, `veiligheidsmiddel_inspecties`
4. **Vakanties** — goedgekeurde verlofaanvragen

Filter op soort, en filter op werkgever (BV).

**Zichtbaarheid:**
- Wie **welke** vakanties ziet volgt de bestaande rechten. Een monteur ziet zijn eigen verlof en niet dat van collega's, tenzij hij daar al recht op heeft. Verzin daar geen nieuwe regel voor — sluit aan op wat `verlofaanvragen` nu al afdwingt, en **meld hoe dat werkt** in plaats van het aan te nemen.
- Keuringen en onderhoud: zichtbaar vanaf `wagenpark` respectievelijk `gereedschappen` niveau 1.
- Feestdagen en collectieve vrije dagen: voor iedereen.

### 5.0 Verjaardagen -- bestaat al, en is al goed geregeld

[stated] Rene: kan deze agenda ook verjaardagen bevatten?

**Gemeten: ja, en het bestaat al -- maar in een andere vorm dan een agenda.**

- `medewerkers.geboortedatum` bestaat.
- `medewerkers.verjaardag_zichtbaar` is een **opt-in per medewerker, standaard uit**, met in de code de aantekening: *naam en foto, geen leeftijd of geboortejaar*.
- `services/moments/verjaardag.ts` matcht **uitsluitend op maand en dag**, met in het commentaar de reden: zodat het geboortejaar nooit in de query terechtkomt.
- De telefoon-app heeft al `components/BirthdayCelebration.tsx` en toont dit via het menu, eenmaal per dag.

Dit is dus geen agenda-item maar een viering op de dag zelf.

**Verjaardagen komen als vijfde soort in de kalender, met deze regels ongewijzigd overgenomen:**

- alleen medewerkers met `verjaardag_zichtbaar = true`;
- **alleen dag en maand, nooit het jaar en nooit de leeftijd**;
- geen enkele afgeleide waarde waaruit het geboortejaar te herleiden is ("wordt 40" mag dus niet).

**Waarom dit strenger moet dan het lijkt.** Een viering op de dag zelf toont een verjaardag. Een jaarkalender toont ze allemaal tegelijk, en dat is precies wat de opt-in wilde voorkomen. De opt-in geldt daarom onverkort in de kalender: staat hij uit, dan verschijnt die medewerker nergens -- ook niet als naamloze markering.

### 5.1 Eigen terugkerende afspraken

Naast de afgeleide items komt ruimte voor een klein aantal **eigen terugkerende afspraken** die nergens anders vandaan komen — bijvoorbeeld een jaarlijkse BHV-herhaling of een kalibratie. Met een herhaalpatroon (jaarlijks, halfjaarlijks, per kwartaal) en een einddatum of aantal herhalingen.

**Wat hier níét in mag:** iets dat al een bron heeft. Een APK hoort niet als eigen afspraak ingevoerd te worden omdat dat sneller leek.

---

## 5b. De kalender in de telefoon-app

[stated] Rene: en zichtbaar in de telefoon-app?

Ja -- maar met minder erin dan op de computer, want een monteur heeft een andere vraag dan de administratie.

**Wat een monteur in de app ziet:**

- feestdagen en **collectieve vrije dagen** -- voor hem het belangrijkste: wanneer ben ik vrij
- **zijn eigen verlof**, aangevraagd en goedgekeurd
- **verjaardagen** van collega's die dat hebben aangezet, dag en maand
- **de APK van zijn eigen auto**, aansluitend op het bestaande `mijn-auto`-scherm
- keuringen van gereedschap **dat aan hem uitgegeven is**, uit `bruikleen_overeenkomsten`

**Wat een monteur niet ziet:** het verlof van collega's, keuringen van het hele wagenpark of magazijn, en de kalender van andere werkgevers. Dat volgt de bestaande rechten; er komt geen aparte regel voor.

Uitvoerder, werkvoorbereider en projectleider zien meer naarmate hun rechten dat toelaten -- dezelfde weergave, andere inhoud, **bepaald op de server**. Niet in de app verbergen.

Plaats: maandweergave, bereikbaar vanuit het bestaande menu. **Geen nieuw hoofdstuk** en geen tweede planningscherm naast `app/planning.tsx` -- overlappen die twee, meld dat dan voor het bouwen.

---

## 6. Bewaking

Aansluiten op de **bestaande** `lib/bewakingsloop.ts`. De voeder `voedVerloopdatums()` verwerkt APK, verzekering en lease al met een venster van 30 dagen.

Toevoegen: **gereedschapskeuringen** en **inspecties**, met dezelfde aanpak. **Geen eigen planner, geen nieuwe meldingentabel.**

De kalender zelf waarschuwt niet — hij toont. Waarschuwen doet de werkbak.

---

## 7. Verboden

- Geen kopie van APK-, keurings- of onderhoudsdata in een kalendertabel. Afgeleide items worden gelezen uit hun bron.
- Geen tweede afboekmechanisme voor verlof; `services/workflow-configs.ts` gebruiken.
- Geen directe mutatie op `verlof_saldi` buiten dat mechanisme om.
- Geen aanname over of een deeltijder op een bepaalde dag werkt; de beperking wordt gemeld (§4.3).
- Geen eigen planner voor de bewaking.
- Geen nieuwe zichtbaarheidsregels voor vakanties; de bestaande gelden.

---

## 8. Twee vaste eisen

**Toets elke aanname en meld afwijkingen.** Controleer per onderdeel welke module en welk niveau de bijbehorende backendroute werkelijk eist, en meld elk verschil met wat hier staat — **pas niets stilzwijgend aan**.

**Wijk je af van de scope van deze opdracht, meld dat dan vóór je bouwt.**

---

## 9. Acceptatie

Met vermelding van commit-SHA, GitHub `main`-SHA en productie-SHA:

1. De administratie legt drie collectieve vrije dagen voor 2027 in één handeling vast. Toon het scherm.
2. **Het saldo is afgeboekt** bij elke actieve medewerker, via het bestaande mechanisme. Toon het saldo van twee medewerkers vóór en na.
3. **Een deeltijder van 32 uur krijgt 6,4 uur afgeboekt**, geen 8. Toon de berekening en de melding over de beperking uit §4.3.
4. **De dag verschijnt in de weekstaat** als verlof, en **de weeknorm van de volledigheidscontrole is met die uren verlaagd**. Toon beide.
5. **Terugdraaien werkt.** Verwijder één collectieve dag: de verlofaanvragen zijn ingetrokken en de saldi teruggeboekt. Toon het overzicht.
6. **De kalender toont een APK-datum die uit het voertuig komt**, niet uit een kopie. Wijzig de datum op het voertuig en toon dat de kalender meebeweegt zonder dat er iets in de kalender is aangepast.
7. **Een monteur ziet in de kalender niet het verlof van een collega**, tenzij hij daar al recht op had. Meld welke bestaande regel dat afdwingt.
8. **Een gereedschapskeuring binnen 30 dagen levert een werkbak-item op** via de bestaande bewakingsloop. Toon de regel uit `bewaking_draaien`.
9. Meld hoeveel actieve medewerkers er bij stap 2 zijn verwerkt, en of iemand daardoor negatief staat.
10. **Verjaardag zonder opt-in is onzichtbaar.** Zet `verjaardag_zichtbaar` uit bij een medewerker en toon dat hij nergens in de kalender voorkomt, ook niet als lege markering.
11. **Geen leeftijd of geboortejaar** in het antwoord van de kalenderroute. Toon de ruwe JSON.
12. **De app toont de kalender**: een monteur ziet de collectieve vrije dagen, zijn eigen verlof en de APK van zijn eigen auto -- en niet het verlof van een collega of de keuringen van het hele wagenpark. Toon het serverantwoord voor die monteur.
