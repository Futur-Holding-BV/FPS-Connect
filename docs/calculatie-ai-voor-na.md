# CALCULATIE_AI_01 — vóór/ná-vergelijking en bewijs

**Datum:** 7 augustus 2026 · **Status:** mechanisme gebouwd en bewezen; acceptatie op échte calculaties wacht op data (zie nulbevinding).

## Nulbevinding (belangrijk, voor René)

Op **zowel dev als productie** is er op 7 augustus 2026 géén prijsdata:
0 eenheidsprijzen, 0 calculatieregels, 0 factuurregels, 1 concept-calculatie (prod).
De opdracht ging ervan uit dat de eenheidsprijzenbibliotheek en calculatiehistorie gevuld zijn — dat is (nog) niet zo.
Conform §5 van de opdracht is dit een bevinding, geen reden voor een eigen tabel of nepdata.
**Gevolg:** de acceptatie op "drie echte, afgeronde calculaties" kan pas zodra er echte calculaties en eenheidsprijzen in het systeem staan. Het advies meldt tot die tijd expliciet dat de eigen norm/geschiedenis ontbreekt (bewezen gedrag, zie hieronder).

## Wat er gebouwd is

De senior-calculatoranalyse krijgt vier deterministische blokken eigen cijfers mee (`calculatieEigenCijfers.ts`):
- **A. Eigen norm per regel** — match op normtijd-code, anders omschrijving+eenheid; afwijking in € én %; geen match = expliciete melding.
- **B. Eigen prijsgeschiedenis per regelsoort** — mediaan/laagste/hoogste + aantal waarnemingen + periode; onder 5 waarnemingen: weggelaten mét melding.
- **C. Gecalculeerd vs. werkelijk betaald** — mediaan uit factuurregels (FACTUUR_02), alleen bij aantoonbare koppeling.
- **D. Eigen opslagenpraktijk** — medianen AK/ABK/risico/winst over eerdere calculaties; de vaste 30-45%-norm is uit de prompt verwijderd (prompt v2.0.0, aandachtspunten 13-15 toegevoegd + vaste cijferregel).

Gedragsbewijs: `scripts/src/bewijs-calculatie-eigen-cijfers.ts` — 9/9 checks groen, incl. determinisme (twee runs byte-identiek, acceptatiepunt 6).

## Vóór/ná op dezelfde calculatie

Zelfde calculatie (doorvoering €47/st, 12 st + 8 uur aftekenen; geseed met 6 historische calculaties, eenheidsprijs €38, inkoopmediaan €34):

**Vóór (prompt v1, zonder eigen cijfers):** algemene adviezen — EI-klassen opvragen, btw-verlegd, leveranciersstaffel "5-15%", opleverdossier. Geen enkel eigen cijfer; het advies van een buitenstaander.

**Ná (prompt v2 + eigen cijfers):** het advies opent met de eigen cijfers:
- *"Doorvoering €47/st is +€9 (+23,7%) t.o.v. eigen prijs"* — eigen eenheidsprijs €38,00 letterlijk genoemd (acceptatiepunt 1 ✅)
- *"€47 vs mediaan €39,50 (6x)"* — historische mediaan mét aantal waarnemingen (punt 2 ✅)
- *"Geen norm; 8 u voor 12 st = 0,67 u/st, verifieer"* — niet-koppelbare regel expliciet benoemd (punt 3 ✅)
- *"Opslagen boven eigen medians: AK 12,0% (nu 15%), ABK 8,0% (nu 10%)…"* — eigen praktijk, geen landelijk percentage (punt 4 ✅)
- Regelsoort met <5 waarnemingen kreeg géén historisch advies (punt 5 ✅)
- *"inkoop mediaan €34 (3 fact.)"* — werkelijk betaald vs. gecalculeerd

## Volledige AI-uitvoer

### Vóór
```json
[
  {
    "type": "waarschuwing",
    "prioriteit": "hoog",
    "titel": "Geen installatie-uren voor afdichten 12 st opgenomen",
    "uitleg": "Materiaalregel heeft MU=0 en er is alleen 8 uur ‘controleren/aftekenen’. Uren voor het daadwerkelijk afdichten ontbreken. Voeg normuren per type sparing toe (richtwaarde klein werk 0,5–1,5 u/st incl. opruimen) om onderdekking te voorkomen."
  },
  {
    "type": "waarschuwing",
    "prioriteit": "hoog",
    "titel": "Bouwplaats- en staartkosten ontbreken",
    "uitleg": "Geen posten voor mobilisatie, rijtijd/parkeren, afval/stort, afplakken/stofwering, klein materieel, keuring/opleverdossier. Neem concrete posten of stelposten op (of verlaag ABK als dit elders gedekt is) om verrassingen te voorkomen."
  },
  {
    "type": "waarschuwing",
    "prioriteit": "hoog",
    "titel": "Sloop/voorbewerking niet begroot",
    "uitleg": "Bijwerken sparingen, verwijderen oude afdichtingen, boren/kernen en herstel afwerking ontbreken. Neem uren of onderaanneming/stelpost op voor deze werkzaamheden met randvoorwaarden en hoeveelheden."
  },
  {
    "type": "aandachtspunt",
    "prioriteit": "middel",
    "titel": "Materiaalkost €47/st lijkt laag en is ongespecificeerd",
    "uitleg": "Zonder type/diameter (kabelbundel, kunststof buis, geïsoleerde buis) kan €47/st te laag zijn; manchetten/wraps kosten vaak €60–€150/st. Specificeer per type/maat en koppel aan goedgekeurd systeem (ETA/DoP) om meerwerk te voorkomen."
  },
  {
    "type": "aandachtspunt",
    "prioriteit": "middel",
    "titel": "Arbeidsregel fout ingericht (materiaalveld, MU=0)",
    "uitleg": "Uurtarief staat in ‘materiaal’-veld en MU=0. Gebruik arbeidsuurtarief en registreer MU/normtijd per stuk. Dit verbetert nacalculatie, planning en productiviteitsturing."
  },
  {
    "type": "aandachtspunt",
    "prioriteit": "middel",
    "titel": "Marges/opslagen: AK+ABK mogelijk dubbeltelling",
    "uitleg": "Totaal AK+ABK+risico+winst=40% (binnen 30–45%). Bevestig dat ABK niet én als % én als posten wordt toegepast. Leg dekkingsbasis vast (op welke sommen worden opslagen berekend) om miscalculatie te vermijden."
  },
  {
    "type": "vraag",
    "prioriteit": "middel",
    "titel": "BTW-instelling: 21% of btw-verlegd?",
    "uitleg": "Werken voor hoofdaannemer zijn vaak btw-verlegd. Graag bevestigen, zodat offerte/factuur juist worden ingericht."
  },
  {
    "type": "ontbrekende_info",
    "prioriteit": "hoog",
    "titel": "Eisen EI/RW/RS ontbreken",
    "uitleg": "Benodigde brandwerendheid (EI30/60/90/120) en rookwerendheid (NEN 6075: RS/RW) per sparing ontbreken. Zonder dit is systeemkeuze en prijs niet betrouwbaar."
  },
  {
    "type": "ontbrekende_info",
    "prioriteit": "middel",
    "titel": "Ondergrond, locatie en werkhoogte onbekend",
    "uitleg": "Wand/vloer type (beton, gips, kalkzand), werkhoogte, toegankelijkheid en werktijden in kantoorpand zijn nodig voor keuze systeem, hulpmiddelen (steiger/hoogwerker) en tijdsbesteding."
  },
  {
    "type": "vraag",
    "prioriteit": "middel",
    "titel": "Type/diameter doorvoeringen per stuk?",
    "uitleg": "Graag per sparing: kabel(bundel)dikte, kunststof/metalen buis (Ø), geïsoleerd of niet en aantallen per type. Dit bepaalt materiaalkeuze (kit, mortel, manchetten, wraps) en normuren."
  },
  {
    "type": "aandachtspunt",
    "prioriteit": "middel",
    "titel": "Opleverdossier/labels niet begroot",
    "uitleg": "Veel opdrachtgevers eisen registraties met foto’s, labels en rapportage. Reserveer uren/kosten of stelpost voor dossieropbouw en oplevering."
  },
  {
    "type": "kans_op_besparing",
    "prioriteit": "middel",
    "titel": "Leveranciersstaffel en systeemoptimalisatie",
    "uitleg": "Vraag 2–3 leveranciers om offerte en bundel bestellingen. Kies één systeem dat meerdere situaties dekt om restmateriaal te beperken. Mogelijke besparing 5–15%."
  },
  {
    "type": "aandachtspunt",
    "prioriteit": "laag",
    "titel": "Inkoopadministratie leeg, geen prijsbron",
    "uitleg": "Leg prijsbron vast (offerte/prijsboek) en check levertijden en ETA/DoP. Dit borgt conformiteit en voorkomt prijsafwijkingen bij inkoop."
  },
  {
    "type": "aandachtspunt",
    "prioriteit": "middel",
    "titel": "Onbalans uren: 8 u controle, 0 u installatie",
    "uitleg": "Herverdeel: opname/uitzet ca. 1–2 u totaal en installatie ca. 0,5–1,5 u per kleine doorvoering. Pas normering aan voor realistische planning en dekking."
  },
  {
    "type": "aandachtspunt",
    "prioriteit": "middel",
    "titel": "Hulpmiddelen/overlastbeperking niet opgenomen",
    "uitleg": "Hoogwerker/steiger, stofafzuiging, boorapparatuur, vloerbescherming/afscherming en PBM kunnen nodig zijn, zeker in kantoorpand. Neem huur/stelpost op of bevestig dat dit niet vereist is."
  }
]
```

### Ná
```json
[
  {
    "type": "waarschuwing",
    "prioriteit": "hoog",
    "titel": "Arbeid voor doorvoeringen ontbreekt (norm 0,40 u/st)",
    "uitleg": "EIGEN NORM PER REGEL voor \"brandwerende doorvoering afdichten\": normtijd 0,40 u en arbeid €26,00 per st. In de calculatie staat arb MU 0 bij 12 st. Voeg ca. 4,8 uur en €312 arbeid toe of onderbouw waarom arbeid elders zit."
  },
  {
    "type": "kans_op_besparing",
    "prioriteit": "hoog",
    "titel": "Doorvoering €47/st is +€9 (+23,7%) t.o.v. eigen prijs",
    "uitleg": "EIGEN NORM PER REGEL: calculatie €47,00/st vs eigen eenheidsprijs €38,00 → afwijking €9,00 (+23,7%). Overweeg bij te stellen naar €38,00/st of motiveer de opslag (bijv. moeilijke bereikbaarheid)."
  },
  {
    "type": "kans_op_besparing",
    "prioriteit": "middel",
    "titel": "Doorvoering boven historiek: €47 vs mediaan €39,50 (6x)",
    "uitleg": "EIGEN PRIJSGESCHIEDENIS: mediaan €39,50 (laagste €36,00, hoogste €44,00) over 6 waarnemingen. Huidig €47,00/st zit daarboven. Aligneren met historiek kan €3–€11/st besparen."
  },
  {
    "type": "aandachtspunt",
    "prioriteit": "middel",
    "titel": "Matprijs doorvoering €47 vs inkoop mediaan €34 (3 fact.)",
    "uitleg": "WERKELIJK BETAALDE INKOOPPRIJZEN: mediaan €34,00/st (3 factuurregels). De calculatie ligt €13,00/st hoger. Check actuele leverancierofferte en splits mat/lab conform norm om vertekening te voorkomen."
  },
  {
    "type": "kans_op_besparing",
    "prioriteit": "middel",
    "titel": "Opslagen boven eigen medians (AK/ABK/Risico/Winst)",
    "uitleg": "EIGEN OPSLAGENPRAKTIJK: AK 12,0% (nu 15%), ABK 8,0% (nu 10%), Risico 4,0% (nu 5%), Winst 9,0% (nu 10%). Overweeg terug te zetten naar eigen medians tenzij projectrisico hoger is."
  },
  {
    "type": "waarschuwing",
    "prioriteit": "hoog",
    "titel": "Bouwplaats- en staartkosten ontbreken",
    "uitleg": "Geen posten voor mobilisatie, parkeren/voorrijden, klein materieel, opruim/afval, hoogwerker/steiger, rapportage/opleverdossier. Voeg hoofdstuk Bouwplaatskosten/Staartkosten toe om nacalculatieverlies te voorkomen."
  },
  {
    "type": "aandachtspunt",
    "prioriteit": "middel",
    "titel": "Sloop/boren en herstel niet opgenomen",
    "uitleg": "Voor doorvoeringen is vaak boren/uitkappen en later herstel (afwerking) nodig. Deze hoofdstukken ontbreken. Neem sloop, afwerking en eventuele schilder/stuc op of bevestig dat anderen dit doen."
  },
  {
    "type": "vraag",
    "prioriteit": "middel",
    "titel": "BTW-instelling niet gespecificeerd",
    "uitleg": "Geef aan of 21% BTW wordt toegepast of BTW verlegd (B2B bouw). Dit beïnvloedt aanbieding en facturatie."
  },
  {
    "type": "waarschuwing",
    "prioriteit": "middel",
    "titel": "Uurtarief als materiaal ingevoerd (€65/eenh.)",
    "uitleg": "Regel \"sparingen controleren en aftekenen\" (8 uur) heeft mat €65/eenheid en arb MU 0. Dit kan opslagen/doorbelasting verstoren. Zet €65 als uurtarief bij arbeid en vul manuren correct."
  },
  {
    "type": "vraag",
    "prioriteit": "middel",
    "titel": "Geen norm; 8 u voor 12 st = 0,67 u/st, verifieer",
    "uitleg": "EIGEN NORM PER REGEL: geen eenheidsprijs gevonden. Huidige hoeveelheid is 8 u voor 12 st (0,67 u/st). Bevestig dat dit klopt (locatie, verdiepingen, toegangen) of pas bij."
  },
  {
    "type": "aandachtspunt",
    "prioriteit": "laag",
    "titel": "Klein materiaal en PBM’s niet opgenomen",
    "uitleg": "Bij “sparingen controleren en aftekenen” ontbreken verbruiken (markeermateriaal, boormallen, PBM’s). Voeg kleine materialen/algemene kostenpost toe of motiveer opname elders."
  },
  {
    "type": "ontbrekende_info",
    "prioriteit": "middel",
    "titel": "Geen inkoopregels of leveranciersoffertes",
    "uitleg": "INKOOPADMINISTRATIE: (geen inkoopregels). Vraag offertes/prijsbevestiging op voor gekozen brandwerende systemen (ETA), manchetten/kitten/band en verwerk condities (levertijd, transport)."
  },
  {
    "type": "ontbrekende_info",
    "prioriteit": "middel",
    "titel": "Kies en benoem gecertificeerd systeem (ETA)",
    "uitleg": "Leg vast welk merk/type brandwerend systeem wordt toegepast en de ETA/klassering (wand/vloer, kabel/buis). Zonder dit is prijs/hoeveelheid lastig te toetsen en inkoop niet te borgen."
  },
  {
    "type": "aandachtspunt",
    "prioriteit": "laag",
    "titel": "Opleverdossier en labelen niet begroot",
    "uitleg": "Veel opdrachtgevers eisen fotolog, locatielabels en testrapporten. Voeg post voor rapportage/labeling toe om uren en materialen te dekken."
  }
]
```
