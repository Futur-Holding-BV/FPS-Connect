# KETEN_01 — eindrapport ketenmeting (11 augustus 2026)

**Opdracht:** de hoofdlijn van proces 1 t/m 11 klikkend doorlopen en elk keuzepunt als korte aftakking meten. Dit rapport is de bouwlijst: alles wat vastloopt of schijnbaar lukt, is werk. Er is conform de opdracht **niets gerepareerd**.

- Meetscripts: `scripts/e2e/web-keten-hoofdlijn.spec.ts` (fase 1) en `scripts/e2e/web-keten-varianten.spec.ts` (fase 2)
- Einddoelen: `docs/metingen/KETEN_01_einddoelen.md` (fase 0, goedgekeurd)
- Ruwe uitkomsten + schermafdrukken: `scripts/e2e-resultaten/keten01/` (rapport.json/md, varianten-rapport.json/md, genummerde schermafdrukken vóór/na per stap)

---

## 1. Samenvatting

De **rug van de keten staat**: van mail-aanvraag tot en met uren op een geakkordeerde opdracht is bijna alles klikkend te doorlopen en aantoonbaar in de gegevens terug te vinden. Er zijn **drie plekken waar de keten echt breekt**:

1. **Digitaal ondertekenen in het klantportaal kan nooit slagen** (de belangrijkste bevinding).
2. **Een verkoopfactuur samenstellen en versturen kan niet via de UI** (alleen een bestaand PDF uploaden).
3. **Een opdracht afsluiten kan niet via de UI** (de API kent de status, de knop ontbreekt).

Daarnaast valt op dat de **weigeringen goed staan**: uren zonder akkoord, akkoord zonder document en akkoord boven de bedragband worden allemaal netjes en fail-closed geweigerd. Er is in de gemeten varianten **geen lek** gevonden waar iets lukte dat niet mocht.

---

## 2. Hoofdlijn (fase 1) — uitkomst per proces

| # | Proces | Uitkomst | Kern |
|---|---|---|---|
| 1a | Mail-binnenkomst aanvraag | gesimuleerd | geen mailbox in de testomgeving (vooraf gemeld); geseed in `aanvraag_voorstellen` |
| 1b | Aanvraag accepteren → klant + gebouw | **doorlopen** | voorstel geaccepteerd; klant, gebouw en projectkans ontstaan |
| 2 | Opname definitief op gebouw | **doorlopen** | opname met nummer, definitief op het gebouw |
| 3 | Calculatie aan opname + regels | **doorlopen** | calculatie met kenmerk en regel(s) aan de opname |
| 4a | Offerte uit calculatie + verzenden | **doorlopen** | offerte verzonden, bezorgd-event vastgelegd, geldige portaallink |
| 4b | Klant opent portaal | schijnbaar gelukt | portaal_status wordt `bekeken`, maar… |
| 4b/5 | Klant tekent → opdracht | **VASTGELOPEN** | **ondertekenen kan nooit slagen** — zie bevinding B1 |
| 5b | Vangnet-opdracht | gesimuleerd | **afwijking, hierbij gemeld**: opdracht + concept-werkbegroting DB-geseed zodat 6–11 meetbaar bleven |
| 6 | Werkbegroting vaststellen + planning | **doorlopen** | werkbegroting vastgesteld; AI-uitvoeringsplanning maakt taken aan. Losse planning-items lopen via de aparte Planning-module (bewust zo gebouwd, zie B4) |
| 7a | Monteur vraagt materiaal aan | gesimuleerd | mobiele-app-handeling (vooraf gemeld); geseed in `materiaal_aanvragen` |
| 7b | Goedkeuring → concept-inkoopbon | **doorlopen** | aanvraag goedgekeurd, concept-inkoopbon gekoppeld |
| 8 | Uren op opdracht mét akkoord | **doorlopen** | POST /uren → 201, rij aantoonbaar in `uren_registraties`. **Afwijking, hierbij gemeld**: het medewerkersprofiel voor het testaccount is in de test-setup geseed (zonder profiel weigert de urenmodule terecht) |
| 9a | Leveranciersfactuur binnen | gesimuleerd | binnenkomst is mailbox-only (vooraf gemeld); geseed in `facturen` |
| 9b | Beoordeling + prijscontrole | **doorlopen** | status na beoordeling `te_beoordelen_wvb`; volledige prijscontrole vergt factuurregels uit de mailintake |
| 10 | Verkoopfactuur naar klant | **VASTGELOPEN** | samenstellen/definitief maken niet klikbaar aanwezig — zie B2 |
| 11 | Opdracht afsluiten | **VASTGELOPEN** | geen afrond-knop in de UI — zie B3 |

## 3. Varianten (fase 2) — uitkomst per keuzepunt

| Keuzepunt | Variant | Uitkomst | Kern |
|---|---|---|---|
| Offerte-afloop | getekend | **VASTGELOPEN** | zelfde breuk als hoofdlijn (B1) |
| | afgewezen | **doorlopen** | portaal_status `afgewezen`, reden en event vastgelegd |
| | ingetrokken | **doorlopen** | status `ingetrokken` met verplichte reden (audittrail) |
| | verlopen zonder reactie | **doorlopen** | verstreken link toont "Uitnodiging verlopen" (410); lijststatus `vervallen` is afgeleid van de vervaldatum |
| Akkoordgrond | A ondertekende offerte | **VASTGELOPEN** | zelfde breuk als hoofdlijn (B1) |
| | B opdrachtbevestiging zonder document | **doorlopen (weigering zoals bedoeld)** | knop blijft uit zonder echt document — geen lek |
| | C vrijgave projectleider | **VASTGELOPEN** | goedkeuringsbeleid grijpt in: opdracht **zonder bekend bedrag** valt fail-closed boven de band → 422 GOEDKEURING_VEREIST. De flow zelf werkt, maar komt zonder ingerichte goedkeuringsronde niet door de poort (zie B5) |
| Bedrag | boven tien mille | **doorlopen (poort dicht)** | apart gemeten met een gekoppelde offerte van €12.000: akkoord-vastleggen geeft 422 GOEDKEURING_VEREIST en er ontstaat géén akkoord. De volledige ronde met tweede beoordelaar is niet doorlopen (vergt ingericht beleid + tweede account) |
| | onbekend bedrag | **doorlopen (poort dicht)** | opdracht zonder gekoppelde offerte wordt fail-closed als "boven de band" behandeld — zelfde 422, geen akkoord |
| Akkoord zonder offerte | alleen calculatie | **VASTGELOPEN** | geen UI-flow die akkoord op een kale calculatie vastlegt en alsnog een offerte met prijsafspraak laat ontstaan (zie B6) |
| Uren | zonder akkoord | **doorlopen (weigering zoals bedoeld)** | 422 AKKOORD_ONTBREEKT, geen rij — geen lek |
| | zonder opdracht | **doorlopen** | wordt geaccepteerd (201), conform beleid "alleen meten" |
| Terugzetten | als hoofdbeheerder | **doorlopen** | akkoord intrekken met verplichte reden werkt |
| | als gewone gebruiker | niet gemeten | vergt een tweede (niet-hoofdbeheerder) websessie; de server-side check bestaat (403) |
| Materiaal | afwijkend van opdracht | niet gemeten | de keuze ontstaat in de mobiele monteur-intake; hoort in een mobiele meetronde |
| Bestelweg | uit voorraad | niet gemeten | de inkoopplanning kent "Uit voorraad" al; volledige afboeking vergt een gevuld magazijn |
| Prijscontrole | factuurprijs hoger | niet gemeten | vergt prijsafspraak + factuurregels via de mailintake; seeden zou de controle zelf simuleren |

---

## 4. Bevindingen (de bouwlijst)

### B1 — Digitaal ondertekenen in het klantportaal kan nooit slagen ⛔ (zwaarste bevinding)
De klant doorloopt het tekenen ogenschijnlijk netjes (canvas → naam → "Definitief akkoord geven"), maar de laatste knop doet stilzwijgend niets: op stap 2 is het handtekening-canvas al uit beeld (ontkoppeld), waardoor de handtekening-gegevens niet meer uitgelezen kunnen worden en het verzoek naar de server **nooit vertrekt**. In de serverlog staat geen enkele POST naar `/portaal/:token/ondertekenen`. Gevolg: **grond A (ondertekende offerte) is in de praktijk onbereikbaar**, en daarmee de hele nette route offerte → opdracht. Dit is ook een schoolvoorbeeld van "schijnbaar gelukt": de klant krijgt géén foutmelding.
*Technische vindplaats: `artifacts/firevault/src/pages/portaal/index.tsx` — canvas wordt alleen gerenderd bij de teken-stap; `bevestigHandtekening()` retourneert stil bij ontbrekend canvas.*

### B2 — Verkoopfactuur samenstellen ontbreekt in de UI ⛔
Op de opdracht is alleen "Verkoopfactuur uploaden" (bestaand PDF) aanwezig. Een verkoopfactuur **samenstellen** vanuit opdracht/offerte en definitief maken (fiscaal nummer) is niet klikbaar. Proces 10 is daarmee niet af te ronden.

### B3 — Opdracht afsluiten ontbreekt in de UI ⛔
De API kent `PATCH status=afgerond`, maar de opdrachtpagina biedt geen "Afronden/Afsluiten"-knop. Proces 11 is daarmee niet af te ronden.

### B4 — Planning-items vs. AI-uitvoeringsplanning (ter kennisname)
De opdrachtpagina genereert een AI-uitvoeringsplanning (taken); losse planning-items lopen via de aparte Planning-module ("Naar planning"). Dat werkt, maar het is twee werelden — de meting kon het einddoel "planning-items op de opdracht" alleen via de AI-route halen.

### B5 — Akkoord vastleggen botst op de goedkeuringsband (gedrag klopt, inrichting ontbreekt)
Grond C (vrijgave projectleider) wordt bij een opdracht zonder bekend bedrag terecht tegengehouden (boven de band → formele goedkeuring vereist). De poort staat dus goed dicht. Maar zolang er geen goedkeuringsronde is ingericht, kan een akkoord op zo'n opdracht **nergens** vastgelegd worden. Dat verdient een bewuste keuze: beleid inrichten of de band configureren.

### B6 — "Akkoord op alleen een calculatie" bestaat niet
Het scenario uit de opdracht (klant akkoordeert een kale calculatie, waarna alsnog een offerte met prijsafspraak ontstaat) heeft geen UI-flow. Als dit in de praktijk voorkomt, is dit een gat.

### B7 — Kleinere waarnemingen uit de meting
- Na acceptatie van een aanvraag in de inbox wordt de opnamelijst niet direct ververst (stale cache tot herlaad).
- Uren boeken vereist een gekoppeld medewerkersprofiel; de foutmelding (400) is correct maar het verband "gebruiker zonder HRM-profiel kan geen uren boeken" moet bij onboarding geborgd zijn.

## 5. Afwijkingen van de meetopdracht (gemeld)

Naast de drie vooraf afgesproken simulaties (mail-aanvraag, monteur-materiaalaanvraag, inkoopfactuur-binnenkomst) zijn er tijdens de meting **twee extra afwijkingen** nodig geweest:
1. **Vangnet-opdracht (5b):** omdat portaal-ondertekenen vastloopt (B1) is de opdracht + concept-werkbegroting in de database geseed, zodat proces 6–11 toch gemeten kon worden.
2. **Medewerkersprofiel-seed (test-setup):** het e2e-testaccount kreeg in de setup een medewerkersprofiel, omdat de urenmodule (terecht) weigert zonder profiel.

Beide zijn in de rapporten als "gesimuleerd" gemarkeerd en veranderen niets aan de bevindingen.

## 6. Wat dit betekent

**De bouwlijst voor de komende weken, in volgorde van zwaarte:** B1 (ondertekenen), B2 (verkoopfactuur), B3 (afsluiten), daarna B5/B6 als beleidskeuzes en B4/B7 als kleinere verbeteringen. De weigeringen en poorten (akkoord, goedkeuringsband, documenten-eis) staan er goed bij — daar is geen werk gevonden.
