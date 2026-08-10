# ADVIES_01 — koppelgraad adviesrapport → artikelen/normtijden (nulmeting)

**Gemeten: 9 augustus 2026**, via de échte route
`POST /modules/calculaties/:id/adviesrapport-analyse` met echte AI, tegen de
**huidige, ongewijzigde bibliotheek** (15 normtijden, **0 artikelen**). Meetscript:
`scripts/src/meting-advies01-koppelgraad.ts`.

**Waarom een gecontroleerde nulmeting** (zelfde precedent als
`CALC_INVOER_01_koppelgraad.md`): in dev- én productiedatabase stonden nog géén
adviesrapport-documenten en géén analyses met `invoer_soort='adviesrapport'`.
Daarom zijn zes realistische FPS-adviesrapporten opgesteld naar de stijl van de
echte stukken uit ADVIES_01 (Grundel/Cityflat: genummerde punten per hoofdstuk,
tekortkoming + geadviseerd herstel, punten bij derden, vage punten, een
stelpost). De meting met échte aangeleverde rapporten kan dit document later
aanvullen — de analyses staan in `calc_plak_analyses` en zijn daaruit te lezen.

## Totalen (6 rapporten, 36 punten)

| Uitkomst | Aantal | Aandeel |
|---|---|---|
| Punten totaal | 36 | 100% |
| → Werkzaamheden-voorstel | 21 | 58% |
| → Geen werkzaamheden aannemer | 8 | 22% |
| → Niet te beoordelen (vraag aan calculator) | 7 | 19% |
| Artikel én normtijd (**volledig**) | **0** | **0% van werkzaamheden** |
| Alleen artikel | 0 | 0% |
| Alleen normtijd | **21** | **100% van werkzaamheden** |
| Ongekoppeld | 0 | 0% |

Per rapport (calculaties `ADVIES01-METING 1…6`, calc #196–#201, naspeurbaar in
`calc_plak_analyses` met `invoer_soort='adviesrapport'`):

| Rapport | Punten | Werkz. | Volledig | Alleen normtijd | Geen werkz. | Niet te beoordelen |
|---|---|---|---|---|---|---|
| VvE Parkflat Zuidzicht (woongebouw) | 7 | 5 | 0 | 5 | 1 | 1 |
| Zorgcentrum De Wieken | 6 | 3 | 0 | 3 | 1 | 2 |
| Kantoorgebouw Twentepoort | 7 | 4 | 0 | 4 | 3 | 0 |
| Woontoren Botermarkt (doorvoeringen) | 5 | 3 | 0 | 3 | 1 | 1 |
| Sporthal/zwembad De Vijverberg | 5 | 3 | 0 | 3 | 1 | 1 |
| Basisschool De Regenboog (herinspectie) | 6 | 3 | 0 | 3 | 1 | 2 |

## Wat de meting laat zien

**1. De normtijdenbibliotheek dekt het FPS-kernwerk goed.** Alle 21
werkzaamheden-voorstellen kregen een passende normtijd, en de koppelingen zijn
inhoudelijk raak: manchetten → BA-01/BA-02, mineraalwol/coating-afdichtingen →
BA-03, spuitmortel → BA-04, brandkleppen plaatsen/onderhoud → BA-05/BA-06,
branddeur compleet → BD-01, deurdrangers → BD-04, kolom-/vlakcoating →
BC-02/BC-01, droge blusleiding en brandslangkasten → BL-01/BL-02. Samengestelde
nummers ("2.9/2.10-stijl") en punten bij derden (BMI, lift, blustoestellen,
noodverlichting) werden correct als "geen werkzaamheden aannemer" vastgelegd.

**2. De artikelenbibliotheek is leeg — daardoor 0% volledig gekoppeld.**
`mod_calc_artikelen` bevat 0 rijen; élk werkzaamheden-voorstel mist dus zijn
materiaalkant (manchetten, steenwol/coating, spuitmortel, kit, branddeuren,
drangers, haspelkasten). **Dit is de grootste beperking voordat monteurs op de
adviesrapport-flow bouwen.** Oplossing is niet betere herkenning maar het vullen
van de artikelenbibliotheek (`ENK_IMPORT_01` / import prijslijsten).

**3. Ontbrekende normtijden — de 7 "niet te beoordelen"-punten.** Fail-closed
werkte zoals bedoeld (geen enkel punt stil overgeslagen, niets geraden), maar
deze werksoorten uit de rapporten hebben nu geen normtijd:

- **brandwerend afkitten van voegen/naden** (De Wieken 2.2)
- **brandwerende beglazing vervangen (EW30)** (De Wieken 2.3/2.4, De Regenboog 2.1)
- **brandwerende pads/omhulling achter inbouwdozen** (Botermarkt 2.1)
- **vluchtwegaanduiding aanbrengen** (Twentepoort 3.2 → herkend als derden-werk)
- bewust vage punten en de stelpost kwamen terecht bij "niet te beoordelen" —
  correct gedrag, geen bibliotheekgat.

## Conclusie & vervolg

| # | Actie | Effect op koppelgraad |
|---|---|---|
| 1 | **Artikelenbibliotheek vullen** (manchetten, steenwol, coating, spuitmortel, kit, branddeuren, drangers) | 0% → verwacht merendeel "volledig" |
| 2 | Normtijden toevoegen: **brandwerend kitten (per m¹), brandwerend glas vervangen (per st/m²), inbouwdozen brandwerend bekleden (per st)** | minder "niet te beoordelen" |
| 3 | Herhaalmeting met **écht aangeleverde FPS-rapporten** zodra die via Slim Upload binnenkomen (lezen uit `calc_plak_analyses`, `invoer_soort='adviesrapport'`) | echte-praktijkcijfer |

De punt-uitlezing en de soortkeuze (werkzaamheden / geen werkzaamheden / niet te
beoordelen) presteren in deze nulmeting foutloos; het knelpunt zit volledig in
de **dekking van de bibliotheek**, niet in de herkenning.
