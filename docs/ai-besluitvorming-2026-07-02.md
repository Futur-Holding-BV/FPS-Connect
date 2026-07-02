# AI Besluitvorming — Uniform model FPS Connect

**Status:** ontwerp, geen code gewijzigd  
**Datum:** 2026-07-02  
**Scope:** Uniforme besluitvormingsstructuur voor alle 7 AI-assistenten in Connect. Elke AI werkt langs dezelfde 8 stappen. De mens beslist altijd; de AI adviseert en motiveert.

---

## Het principe

Elke AI in Connect is een adviseur, nooit een beslisser.

De structuur is uniform — ongeacht of het gaat om een spot-herkenning, een offerte-tekst of een loonstrookcontrole. Wat verschilt is de inhoud per stap, niet de stappen zelf. Uniformiteit maakt het mogelijk om één logboek, één validatie-pipeline en één scherm voor alle AI-assistenten te bouwen.

```
Vraag
  ↓
Analyse
  ↓
Onderbouwing
  ↓
Confidence
  ↓
Advies
  ↓
Gebruiker beslist
  ↓
Logboek
  ↓
Workflow
```

---

## De 8 stappen uitgewerkt

### Stap 1 — Vraag

**Wat:** De aanleiding voor de AI-actie. Dit is altijd een combinatie van een trigger (een gebruikershandeling of een systeemgebeurtenis) en een context (welke entiteiten zijn betrokken).

**Vastgelegd in:**

| Veld | Inhoud |
|---|---|
| `module` | Welke AI-assistent (bijv. "spot-ai") |
| `functie` | Welke specifieke functie (bijv. "analyseerSpot") |
| `beschrijving` | Leesbare vraag-omschrijving voor het logboek |
| `trigger` | Gebruikershandeling, systeemevent of scheduler |
| Entiteiten | gebouw_id, document_id, voorziening_id, etc. (context) |

**Triggers — drie soorten:**

- **Expliciet** — gebruiker klikt op "Analyseer" of "Stel voor"
- **Contextgebonden** — AI start automatisch bij het openen van een formulier of na een upload
- **Gepland** — nachtelijke batch (bijv. certificaat-signalering, LMRA-controle)

**Regel:** de vraag is altijd leesbaar formuleerbaar als een enkelvoudige Nederlandse zin. Als dat niet kan, is het geen geldige vraag voor de AI.

---

### Stap 2 — Analyse

**Wat:** De AI haalt de relevante data op en bepaalt welke bronnen beschikbaar zijn.

**Structuur van de analyse:**

```
Entiteiten ophalen
  ├── Primaire entiteit (gebouw, spot, medewerker, factuur…)
  ├── Gerelateerde entiteiten (verdiepingen, toepassingen, klant…)
  └── Historische data (eerdere inspecties, eerder gebruikte producten…)

Documenten ophalen
  ├── Gekoppelde bibliotheekdocumenten
  └── Relevante documenten op basis van entiteitskenmerken

Kennisobjecten ophalen
  ├── Product, Norm, Prestatie, Certificaat
  └── Status-check (geldig / verlopen / ingetrokken)

Beperkingen vaststellen
  ├── Ontbrekende data (geen foto, geen testrapport)
  └── Onzekerheden (nieuwe klant, onbekend product)
```

**Vastgelegd in:**
- `gebruikte_documenten` (JSONB)
- `gebruikte_kennisobjecten` (JSONB)
- `prompt_samenvatting` (wat er is meegegeven aan het model)

---

### Stap 3 — Onderbouwing

**Wat:** De AI legt uit waarom het tot zijn advies is gekomen. Niet alleen het resultaat, maar de redenering.

**Vier onderdelen:**

1. **Redenering** — stap-voor-stap redenering (chain-of-thought). De AI schrijft dit expliciet in zijn antwoord; het wordt opgeslagen in `antwoord_samenvatting`.

2. **Bronvermeldingen** — welke documenten, normen of kennisobjecten zijn geciteerd? Dit zijn de `gebruikte_documenten` en `gebruikte_kennisobjecten`.

3. **Alternatieven** — wat heeft de AI overwogen en verworpen, en waarom? Alternatieven worden altijd meegeleverd als de confidence niet "hoog" is.

4. **Beperkingen** — wat weet de AI NIET? Expliciete vermelding van ontbrekende informatie die de gebruiker zelf moet controleren.

**Regel:** een onderbouwing zonder bronvermeldingen is ongeldig. Als de AI geen bronnen kan noemen, is de confidence automatisch "laag".

---

### Stap 4 — Confidence

**Wat:** Een gecombineerde maat voor de betrouwbaarheid van het advies.

**Drie niveaus:**

| Niveau | Percentage | Betekenis |
|---|---|---|
| Hoog | 80–100 % | Advies is direct bruikbaar; bronnen zijn compleet en actueel |
| Midden | 50–79 % | Advies is bruikbaar maar vereist aandacht voor de alternatieven |
| Laag | < 50 % | Advies is een startpunt, geen conclusie; menselijke verificatie verplicht |

**Factoren die de confidence verlagen:**

| Factor | Effect |
|---|---|
| Ontbrekende of onduidelijke foto | −30 pt |
| Geen geldig certificaat voor aanbevolen product | −25 pt |
| Norm herzien na testdatum document | −20 pt |
| Nieuwe klant of medewerker zonder historiek | −15 pt |
| Ambiguïteit in de invoer | −15 pt |
| Meer dan één even sterke kandidaat | −10 pt |
| AI heeft eerder een fout gemaakt op vergelijkbare vraag | −10 pt (via logboek-feedback) |

**Controle vereist:** als confidence "laag" is of als specifieke risico-triggers aanwezig zijn (zie per assistent), wordt de UI-presentatie aangepast: het advies staat in een geel kader met de melding "Controleer voor gebruik".

**Vastgelegd in:** `betrouwbaarheid` (laag/midden/hoog) + factoren in `antwoord_samenvatting`.

---

### Stap 5 — Advies

**Wat:** Het concrete voorstel dat de gebruiker te zien krijgt.

**Structuur van een advies:**

```
Primair voorstel
  ├── Wat de AI aanbeveelt (één duidelijke actie)
  ├── Motivatie in één zin
  └── Eventuele condities ("mits certificaat verlengd")

Alternatieven (bij confidence midden of laag)
  ├── Alternatief 1: naam + reden waarom dit alternatief is
  └── Alternatief 2 (optioneel)

Waarschuwingen
  └── Risico's die de gebruiker moet kennen
      (verlopen certificaat, norm-conflict, ontbrekende data)

Niet-adviseerbaar (zeldzaam)
  └── Als de AI geen verantwoord advies kan geven,
      zegt het dat expliciet — nooit een gok als definitief advies
```

**Presentatieregels in de UI:**

- Confidence "hoog": primair voorstel direct zichtbaar, alternatieven ingeklapt
- Confidence "midden": primair voorstel + alternatieven naast elkaar
- Confidence "laag": geel kader, waarschuwingstekst, alternatieven prominent
- Niet-adviseerbaar: rood kader, geen voorstel, uitleg wat de gebruiker handmatig moet doen

---

### Stap 6 — Gebruiker beslist

**Wat:** De mens maakt de keuze. Drie opties:

| Keuze | Actie_gekozen | UI-element |
|---|---|---|
| Bevestigd | `bevestigd` | Groene bevestigknop; primair voorstel wordt overgenomen |
| Gecorrigeerd | `gecorrigeerd` | Gebruiker past het voorstel aan; wijziging wordt opgeslagen |
| Afgewezen | `afgewezen` | Voorstel wordt verworpen; gebruiker vult handmatig in |

**Bij "gecorrigeerd":**
De afwijking van het AI-voorstel wordt opgeslagen in `correctie_omschrijving`. Dit is leerzame data: als meerdere gebruikers hetzelfde voorstel corrigeren op dezelfde manier, is dat een signaal dat het model of de prompt verbeterd moet worden.

**Tijdslimiet:** adviezen verlopen na 24 uur als er geen beslissing is genomen. Het systeem signaleert dit als "open advies" in het AI-logboek.

**Blocked state:** sommige workflows kunnen niet worden voortgezet zonder een AI-beslissing. De UI blokkeert dan de volgende stap totdat de gebruiker heeft beslist (of het advies heeft afgewezen).

---

### Stap 7 — Logboek

**Wat:** Volledige vastlegging in `ai_logboek` (zie het AI Logboek-ontwerp van vandaag).

Alle 16 vereiste velden worden gevuld:

- gebruiker, AI-assistent, project, gebouw, document
- prompt (samenvatting + hash), antwoord, confidence
- gekozen actie, bevestiging, vervolgactie
- gebruikte documenten, kennisobjecten, modellen
- kosten, tokens, duur

De log-regel is na schrijven niet meer te verwijderen. Correcties worden als nieuwe log-regels toegevoegd, niet als overschrijving.

---

### Stap 8 — Workflow

**Wat:** De beslissing activeert een vervolgstap in het platform. Welke vervolgstap afhankelijk van de keuze:

| Keuze | Workflow |
|---|---|
| Bevestigd | Primaire workflow: entiteit aanmaken/bijwerken, signalering activeren |
| Gecorrigeerd | Primaire workflow met gecorrigeerde waarden |
| Afgewezen | Gebruiker voert handmatig in; geen AI-gestuurde workflow |
| Open (verlopen) | Herinnering in werk-inbox; escalatie naar beheerder na 48 uur |

De workflow-stap wordt vastgelegd in `vervolgactie` en `vervolgactie_entiteit_id`.

---

## Uniforme data-interface

Elke AI-assistent levert zijn besluit in hetzelfde formaat. Dit formaat koppelt de 8 stappen aan het logboek en de UI.

```typescript
interface AiBesluit {
  // Stap 1 — Vraag
  vraag:              string;               // leesbare omschrijving
  trigger:            AiTrigger;            // "gebruiker" | "systeem" | "batch"
  context:            Record<string, unknown>; // entiteit-IDs

  // Stap 2 — Analyse
  gebruikteDocumenten:      DocumentRef[];
  gebruikteKennisobjecten:  KennisObjectRef[];
  analyseBeperkingen:       string[];        // wat ontbrak

  // Stap 3 — Onderbouwing
  redenering:         string;               // chain-of-thought
  bronvermeldingen:   string[];
  alternatieven:      AiAlternatief[];
  beperkingen:        string[];

  // Stap 4 — Confidence
  confidence: {
    score:              "hoog" | "midden" | "laag";
    percentage:         number;
    factoren:           string[];
    controleVereist:    boolean;
  };

  // Stap 5 — Advies
  advies: {
    primair:            string;             // het concrete voorstel
    motivatie:          string;             // één zin
    alternatieven:      AiAlternatief[];
    waarschuwingen:     string[];
    nietAdviseerbaar:   boolean;
  };

  // Stap 6–8 worden gevuld na de menselijke beslissing
  actieGekozen?:      "bevestigd" | "gecorrigeerd" | "afgewezen";
  bevestigdDoorId?:   number;
  bevestigdOp?:       string;
  correctie?:         string;
  logboekId?:         number;
  vervolgactie?:      string;
}
```

---

## Grenzen — wat de AI nooit zelf beslist

Ongeacht confidence-niveau zijn de volgende beslissingen altijd voorbehouden aan de mens:

| Domein | Wat de AI nooit beslист |
|---|---|
| Veiligheid | LMRA als veilig markeren |
| Juridisch | Contract ondertekenen of goedkeuren |
| Financieel | Factuur goedkeuren of betaling autoriseren |
| HR | Medewerker aannemen, ontslaan of beoordelen |
| Kwaliteit | Spot of gebouw als opgeleverd markeren |
| Compliance | ETA of certificaat als geldig verklaren |
| Incidenten | Ernst of aansprakelijkheid bepalen |

De AI mag deze beslissingen voorbereiden, onderbouwen en aanbevelen — maar nooit afronden.

---

## Escalatieprotocol

Als de gebruiker het niet eens is met het advies en de correctie significant is, wordt het geëscaleerd:

| Situatie | Actie |
|---|---|
| Confidence was "hoog", gebruiker corrrigeert | Correctie wordt opgeslagen; na 3 gelijke correcties door verschillende gebruikers → model-review signalering |
| Confidence was "laag", gebruiker bevestigt | Extra bevestigingsstap: "Weet u zeker dat u dit advies met lage betrouwbaarheid wilt bevestigen?" |
| AI geeft "niet-adviseerbaar" | Handmatige invoer; beheerder ontvangt melding als het een compliance-kritische actie betreft |
| Open advies na 48 uur | Werk-inbox notificatie + escalatie naar beheerder |

---

## Per AI-assistent

---

### AI Uitvoerder

**Domein:** Spotregistratie, spot-herkenning, toepassingsselectie, installatie-validatie

**Gebruiker:** Monteur (veld), uitvoerder, beheerder

**Trigger:** Foto-upload bij spot-aanmaak, handmatige "Analyseer"-knop, na spot-locatie invullen

---

**Vraag**

De AI Uitvoerder beantwoordt drie soorten vragen:

1. "Welk product/toepassing zie ik op deze foto?"
2. "Welke toepassing is geschikt voor deze installatiesituatie?"
3. "Wijkt deze spot af van de gekoppelde toepassing?"

Voorbeeld-vraag: "Foto van een oranje manchet op een flexibele kabel ø63 mm, wand, verdieping 2, gebouw Piet Heinstraat 12. Welke toepassing is dit?"

---

**Analyse**

- Foto(s) omzetten naar data-URL
- Gebouw en verdieping ophalen (scheidings-context)
- Reeds gebruikte toepassingen in dit gebouw ophalen (leerhistorie)
- Bibliotheek-query: toepassingen op type + conditie + diameter
- Certificaatstatus van kandidaten controleren
- Testrapport-documenten bij top-3 kandidaten ophalen

---

**Onderbouwing**

Voorbeeld:
"De foto toont een oranje manchet met kenmerkende ribbelrand — dit zijn herkenbaarheidskenmerken van Mulcol International. De diameter van de kabel is geschat op 55–65 mm op basis van de verhouding met de wandopening. Gecombineerd met de scheidingsconditie (flexibele wand) komt dit overeen met de toepassing 'Mulcol Multicollar Slim ø63 EI120 wand/plafond'. Testrapport ETA-11/0429 onderbouwt de EI120-prestatie voor deze configuratie. Alternatief overwogen: Rockwool BlazeSeal ø63 — dit product is in dit gebouw niet eerder gebruikt en het certificaat verloopt over 4 maanden."

---

**Confidence-factoren specifiek voor AI Uitvoerder**

| Factor | Effect |
|---|---|
| Foto scherp en goed belicht | +20 pt |
| Product eerder herkend in dit gebouw | +15 pt |
| Certificaat huidig geldig | +10 pt |
| Foto onduidelijk / gedeeltelijk zichtbaar | −30 pt |
| Geen testrapport beschikbaar | −25 pt |
| Meerdere vergelijkbare producten mogelijk | −15 pt |
| Diameter geschat (niet gemeten) | −10 pt |

---

**Advies**

```
Primair:        Mulcol Multicollar Slim ø63, EI120, wand/plafond
Motivatie:      Productkenmerken herkend op foto; eerder gebruikt in dit gebouw;
                certificaat geldig t/m 2028-06
Alternatief 1:  Hilti CFS-C P ø63 — vergelijkbare prestatie maar niet eerder
                in dit gebouw gebruikt
Alternatief 2:  Rockwool BlazeSeal ø63 — certificaat verloopt in 4 maanden
Waarschuwing:   Controleer de geschatte diameter (ø63) voor definitieve koppeling
```

---

**Gebruiker beslist**

Monteur: bevestigt de toepassing, past de diameter aan, of selecteert een ander product.

Als bevestigd: spot-status gaat van "concept" naar "geplaatst"; toepassing gekoppeld; foto bewaard.

---

**Logboek**

Module: spot-ai | Functie: analyseerSpot | Model: gpt-5 | Bronnen: ETA-11/0429, Mulcol-productblad | Kennisobjecten: Product Mulcol Slim, Norm EN 1366-3, Prestatie EI120 wand

---

**Workflow**

- Bevestigd → spot.status = "geplaatst"; toepassing gekoppeld; QR-code aangemaakt
- Gecorrigeerd → aangepaste toepassing gekoppeld; correctie opgeslagen in logboek
- Afgewezen → handmatige toepassingsselectie; spot blijft "concept"

---

### AI Werkvoorbereider

**Domein:** Inkoopplanning, uitvoeringsplanning, materiaaloverzichten, fasering

**Gebruiker:** Werkvoorbereider, projectleider, beheerder

**Trigger:** Werkbon aangemaakt, "Genereer planning"-knop, spotregistratie compleet voor een gebouw

---

**Vraag**

1. "Welke materialen zijn nodig voor dit project en in welke hoeveelheden?"
2. "In welke volgorde moeten de werkzaamheden worden uitgevoerd?"
3. "Welke inkopen moeten wanneer worden geplaatst om de planning te halen?"

---

**Analyse**

- Alle spots van het gebouw/project ophalen (type, toepassing, status)
- Toepassingen → fabrikant → levertijden (indien beschikbaar)
- Reeds bestelde materialen ophalen (voorkomen van dubbele inkoop)
- Capaciteitsplanning: beschikbare monteurs, openstaande werkbonnen
- Deadlines en inspectiedatums ophalen

---

**Onderbouwing**

"47 spots vereisen 12 verschillende toepassingen. Mulcol-producten zijn aanwezig in 34 spots en hebben een standaardlevertijd van 3–5 werkdagen. Hilti-producten (6 spots) zijn direct leverbaar. Kritisch pad: de manchetten voor de leidingdoorvoeren op verdieping 3 zijn geblokkeerd totdat de aannemer het leidingwerk afrondt (geplande datum: 14-07). Aanbeveling: bestel Mulcol-producten vóór 07-07 om de opleverdatum van 21-07 te halen."

---

**Confidence-factoren specifiek voor AI Werkvoorbereider**

| Factor | Effect |
|---|---|
| Alle spots zijn volledig geregistreerd | +25 pt |
| Levertijden beschikbaar in systeem | +15 pt |
| Monteur-capaciteit bekend | +15 pt |
| Incomplete spotregistratie (> 20 % concept) | −30 pt |
| Levertijden niet beschikbaar | −20 pt |
| Geen opleverdatum vastgelegd | −15 pt |

---

**Advies**

```
Primair:        Inkooplijst: 34× Mulcol Slim ø63, 6× Hilti CFS-C P ø90,
                8× Rockwool BlazeSeal (diversen) — bestellen vóór 07-07
Motivatie:      Levertijd Mulcol 3–5 werkdagen; oplevering 21-07
Waarschuwing:   12 spots zijn nog "concept" — definitieve hoeveelheden
                kunnen na voltooiing van de spotregistratie afwijken
```

---

**Workflow**

- Bevestigd → inkoopbon aangemaakt; werkbon gefaseerd; monteur-toewijzingen gesuggereerd
- Gecorrigeerd → aangepaste hoeveelheden of volgorde; correctie opgeslagen
- Afgewezen → handmatige planning; logboek registreert dat AI-planning niet gebruikt

---

### AI Calculator

**Domein:** Kostprijsberekening, tarieventoepassing, margeanalyse, nacalculatie

**Gebruiker:** Calculator, projectleider, directeur

**Status:** Module geparkeerd (zie roadmap). Besluitvormingsstructuur is hier alvast ontworpen zodat bouw direct kan starten zodra de module actief wordt.

---

**Vraag**

1. "Wat is de kostprijs van dit project op basis van de huidige registraties?"
2. "Welke marge hanteert de AI op basis van klantprofiel en risico?"
3. "Wat is het verschil tussen begroting en werkelijke kosten?"

---

**Analyse**

- Uurstaten ophalen (geboekte uren per medewerker per activiteit)
- Materiaalprijzen ophalen uit de calculatiemodule
- Opslagen (overhead, risico, winst) ophalen uit de tariefstructuur
- Klanthistorie: eerdere projecten met marge-realisatie
- Marktconforme tarieven (indien benchmarkdata beschikbaar)

---

**Onderbouwing**

"Geboekte uren: 312 uur à gemiddeld €55,40 kostprijs = €17.285. Materialen: €4.620. Opslagen (18 %): €3.942. Kostprijs totaal: €25.847. Aanbevolen verkoopprijs met marge 22 %: €31.521. Ter vergelijking: het vorige project voor deze klant had een gerealiseerde marge van 19 %; de 22 %-aanname is conservatief gegeven de hogere complexiteit."

---

**Confidence-factoren specifiek voor AI Calculator**

| Factor | Effect |
|---|---|
| Volledige uurstaten beschikbaar | +25 pt |
| Actuele materiaalprijzen in systeem | +20 pt |
| Klant heeft 3+ eerdere projecten | +15 pt |
| Uurstaten deels geschat | −30 pt |
| Materialen niet in systeem (handmatig aangeleverd) | −20 pt |
| Eerste project voor deze klant | −15 pt |

---

**Grenzen**

De AI Calculator stelt een prijs voor; een mens autoriseert de offerte altijd. De calculator mag nooit een offerte versturen.

---

**Workflow**

- Bevestigd → calculatie vastgelegd; offerteprijs bijgewerkt; versie aangemaakt
- Gecorrigeerd → aangepaste prijs vastgelegd met motivatie
- Afgewezen → handmatige calculatie; logboek registreert niet-gebruik

---

### AI HRM

**Domein:** Opleidingen voorstellen, contract-analyse, bekwaamheidsmatrix, verlofadvies

**Gebruiker:** HR-beheerder, directeur, medewerker (beperkt)

**Trigger:** Functie gekoppeld aan medewerker, contract geüpload, bekwaamheidsmatrix geopend, verlofaanvraag ingediend

---

**Vraag**

1. "Welke opleidingen/certificaten zijn vereist of aanbevolen voor deze functie?"
2. "Wat zijn de risico's en kernbedingen van dit arbeidscontract?"
3. "Is er voldoende bezetting voor de aangevraagde verlofperiode?"
4. "Welke medewerkers missen een verplicht certificaat?"

---

**Analyse voor opleiding-voorstel:**

- Functieprofiel ophalen (functietitel, niveau, taken)
- Bestaande koppelingen opleidingen → functie ophalen
- CAO-vereisten voor het functietype ophalen
- Wettelijke vereisten (BHV, VCA, producttrainingen) raadplegen
- Medewerker-specifieke leemten: welke vereiste opleidingen ontbreken?

---

**Onderbouwing voor opleiding-voorstel:**

"Voor de functie 'Monteur Brandpreventie niveau 3' zijn op basis van de CAO Metaal en de wettelijke brandveiligheidseisen de volgende opleidingen vereist: VCA basis (wettelijk), BHV (cao-verplichting), producttypeopleiding doorvoeringen (intern vereist). De medewerker beschikt over VCA basis maar mist de BHV-opleiding en de Mulcol productopleiding. De Mulcol productopleiding is aanbevolen, niet verplicht, maar verhoogt de spot-herkenningsnauwkeurigheid in de AI Uitvoerder."

---

**Confidence-factoren specifiek voor AI HRM**

| Factor | Effect |
|---|---|
| Volledig functieprofiel beschikbaar | +20 pt |
| CAO-koppeling actief | +15 pt |
| Medewerker heeft 12+ maanden historiek | +15 pt |
| Nieuwe functie zonder precedent | −25 pt |
| Contract in niet-standaard format | −20 pt |
| Ontbrekende CAO-koppeling | −20 pt |

---

**Grenzen**

- AI adviseert over opleidingen; HR-beheerder koppelt ze aan medewerker
- AI signaleert contract-risico's; jurist of directeur neemt beslissing over arbeidsvoorwaarden
- AI adviseert over verlofbezetting; leidinggevende beslist over goedkeuring

---

**Workflow**

- Opleiding-voorstel bevestigd → opleiding gekoppeld aan medewerker; vervaldatum-signalering actief
- Contract-analyse bevestigd → risicovlaggen opgeslagen bij contract-document; HR-notitie
- Verlofadvies bevestigd of afgewezen → verlofaanvraag bijgewerkt met beslissing

---

### AI Veiligheid

**Domein:** LMRA-voorstel, toolbox-vraagset genereren, incident-analyse, risicoclassificatie

**Gebruiker:** Monteur (veld), uitvoerder, veiligheidscoördinator

**Trigger:** LMRA-formulier openen, toolbox aanmaken, incident registreren

---

**Vraag**

1. "Welke risico's zijn aanwezig bij dit werktype op deze locatie?"
2. "Welke vragen en maatregelen horen bij deze toolbox?"
3. "Hoe ernstig is dit incident en welke acties zijn vereist?"

---

**Analyse voor LMRA-voorstel:**

- Werktype ophalen (uit LMRA-formulier: hoogte, elektra, brandgevaar, etc.)
- Locatie-context: gebouw, verdieping, ruimte, bijzonderheden
- Eerdere LMRA's op vergelijkbare locaties en werktypes ophalen
- Eerdere incidenten op dit gebouw of bij dit werktype ophalen
- PBM-vereisten per risicotype raadplegen

---

**Onderbouwing voor LMRA:**

"Werktype 'Boorkern doorvoering leidingkoker' bevat vier risicofactoren: stof/asbest (oud gebouw 1975), hoogte boven 2m (steiger vereist), elektra (nabij kabelgoot), brandgevaar (zaagstof). Op basis van 8 eerdere LMRA's in dit gebouw is de asbest-vraag het vaakst aangevuld door uitvoerders. Aanbevolen maatregel 1: asbest-quickscan vóór aanvang. Aanbevolen maatregel 2: P3-masker bij elke boorkern."

---

**Confidence-factoren specifiek voor AI Veiligheid**

| Factor | Effect |
|---|---|
| Werktype volledig ingevuld | +20 pt |
| Eerdere LMRA's beschikbaar voor dit type | +20 pt |
| Gebouw-asbest-status bekend | +15 pt |
| Werktype vaag of "overig" | −30 pt |
| Eerste keer dit werktype in dit gebouw | −20 pt |

---

**Bijzondere regel voor AI Veiligheid**

Als de AI confidence "laag" geeft, mag de LMRA niet worden afgerond zonder handtekening van een uitvoerder of veiligheidscoördinator. Dit is de enige module waar de confidence-drempel een directe blokkering in de workflow veroorzaakt.

De AI mag nooit adviseren dat een situatie veilig is. De AI signaleert risico's; de mens beoordeelt of en hoe er gewerkt wordt.

---

**Workflow**

- LMRA bevestigd → LMRA afgerond; toolbox-koppeling; werk mag starten
- Gecorrigeerd → gecorrigeerde LMRA opgeslagen; uitvoerder handtekening verplicht
- Incident-analyse bevestigd → incident opgeslagen; ernst-classificatie vastgelegd; bij "hoog" → directe melding beheerder

---

### AI Financieel

**Domein:** Factuurcontrole, salaris-mutatie validatie, kostenanalyse, debiteurenbewaking

**Gebruiker:** Financieel medewerker, directeur, controller

**Trigger:** Factuur ontvangen, salaris-mutatie ingediend, AccountView-synchronisatie

---

**Vraag**

1. "Klopt deze factuur met de werkbon en de contractafspraken?"
2. "Is deze salaris-mutatie correct op basis van de uurstaten en de CAO?"
3. "Welke debiteuren overschrijden de betalingstermijn?"

---

**Analyse voor factuurcontrole:**

- Factuur-data ophalen (bedrag, regels, btw, referentie)
- Werkbon ophalen op basis van factuur-referentie
- Contractafspraken klant ophalen (tarieven, betalingsconditie, meerwerk-protocol)
- Eerdere facturen van dezelfde leverancier/klant ophalen
- AccountView-status raadplegen (al geboekt?)

---

**Onderbouwing voor factuurcontrole:**

"Factuur €8.400 vs. werkbon €7.200: verschil €1.200. Analyse: werkbon bevat 2 meerwerkposten (post 3 en 4); post 3 (steigerkosten €400) ontbreekt in de werkbon maar is schriftelijk overeengekomen per e-mail 14-06. Post 4 (extra materiaal €800) is niet gedocumenteerd. Advies: akkoord voor post 3 (€400); post 4 (€800) vereist aanvullend bewijs."

---

**Confidence-factoren specifiek voor AI Financieel**

| Factor | Effect |
|---|---|
| Werkbon volledig en afgerond | +25 pt |
| Eerdere facturen van zelfde partij beschikbaar | +15 pt |
| Meerwerk schriftelijk vastgelegd | +15 pt |
| Werkbon nog "concept" | −30 pt |
| Meerwerk mondeling afgesproken | −25 pt |
| Eerste factuur van deze partij | −15 pt |

---

**Grenzen**

- AI adviseert goedkeuring of bezwaar; bevoegd persoon autoriseert de factuur altijd
- AI signaleert salaris-afwijkingen; HR-beheerder of salarisadministrateur beslist
- AI mag nooit een betaling initiëren of creditnota aanmaken

---

**Workflow**

- Bevestigd (goedkeuring) → factuur-status = goedgekeurd; AccountView-koppeling klaargezet
- Gecorrigeerd → gedeeltelijke goedkeuring vastgelegd; bezwaarpost opgeslagen
- Afgewezen → bezwaar-procedure; leverancier wordt genotificeerd via e-mail-workflow

---

### AI Commercie

**Domein:** Offerte-secties schrijven, e-mail-inzicht extraheren, CRM-coaching, klantcontract-analyse

**Gebruiker:** Commercieel medewerker, projectleider, directeur

**Trigger:** Offerte-sectie aangemaakt, e-mail ontvangen in inbox, CRM-klantkaart geopend, contract geüpload

---

**Vraag**

1. "Schrijf de sectie 'Aanpak en methode' voor deze offerte."
2. "Wat zijn de actiepunten uit deze klant-e-mail?"
3. "Hoe kan ik dit verkoopgesprek het best aanpakken?"
4. "Wat zijn de risico's in dit klantcontract?"

---

**Analyse voor offerte-sectie:**

- Projectgegevens ophalen (adres, gebouwtype, spot-types, hoeveelheden)
- Klantprofiel ophalen (sector, eerder werk, voorkeur voor toon)
- Eerdere gewonnen offertes voor vergelijkbare projecten ophalen
- Productinformatie voor gebruikte toepassingen ophalen
- Sectie-sjabloon ophalen uit de Document Design System (Studio)

---

**Onderbouwing voor offerte-sectie:**

"De vorige twee gewonnen offertes voor deze klant (Bouwbedrijf Hendriksen) zijn beide gekenmerkt door een technische, detailrijke aanpak-sectie. De klant heeft in het gespreksverslag van 24-06 expliciet gevraagd naar certificeringsdocumentatie per spot-type. De offerte verwijst naar 3 spot-types; de aanpak-sectie beschrijft per type de installatiewijze, de gehanteerde norm en de beschikbare ETA. Toon: zakelijk-technisch, geen marketingtaal."

---

**Confidence-factoren specifiek voor AI Commercie**

| Factor | Effect |
|---|---|
| Klant heeft 3+ eerdere projecten in systeem | +20 pt |
| Sectie-sjabloon beschikbaar in DDS | +15 pt |
| Gespreksverslagen beschikbaar | +15 pt |
| Nieuwe klant zonder historiek | −25 pt |
| Offerte in vroeg conceptstadium (weinig data) | −20 pt |
| RFP-tekst vaag of generiek | −15 pt |

---

**Grenzen**

- AI schrijft tekst-voorstellen; commercieel medewerker redigeert en goedkeurt altijd
- AI analyseert contractrisico's; juridisch verantwoordelijke neemt de beslissing
- AI mag nooit een offerte versturen of een contract ondertekenen

---

**Workflow**

- Sectie bevestigd → offerte-sectie opgeslagen; versie aangemaakt; offerte-status bijgewerkt
- Gecorrigeerd → bewerkte sectie opgeslagen; correctie-delta opgeslagen in logboek
- E-mail-inzicht bevestigd → actiepunten aangemaakt in werk-inbox; CRM-notitie toegevoegd
- Contract-analyse bevestigd → risicovlaggen opgeslagen bij contract; notificatie naar directeur

---

## Samenvatting per assistent

| Assistent | Primaire vraag | Confidence-grens voor blokkering | Beslissing nooit door AI |
|---|---|---|---|
| Uitvoerder | Welke toepassing is dit? | Laag → UI-waarschuwing | Spot als opgeleverd markeren |
| Werkvoorbereider | Welke inkopen wanneer? | Laag → handmatige planning | Bestelling plaatsen |
| Calculator | Wat is de kostprijs/marge? | Laag → handmatige calculatie | Offerte versturen |
| HRM | Welke opleidingen/risico's? | Laag → jurist/HR vereist | Medewerker aannemen of ontslaan |
| Veiligheid | Welke risico's aanwezig? | Laag → handtekening uitvoerder vereist | LMRA als veilig markeren |
| Financieel | Klopt deze factuur? | Laag → bevoegde medewerker vereist | Factuur betalen of creditnota |
| Commercie | Schrijf/analyseer dit? | Laag → geen voorstel, handmatig | Offerte versturen of contract tekenen |

---

## Kwaliteitsmeting

De besluitvormingsstructuur is alleen goed als de AI het ook goed doet. De kwaliteit wordt gemeten via het AI Logboek (zie het logboek-ontwerp van vandaag):

| Meting | Berekeningswijze | Streefwaarde |
|---|---|---|
| Bevestigingsratio | Bevestigd / (Bevestigd + Gecorrigeerd + Afgewezen) | > 85 % per module |
| Correctieratio | Gecorrigeerd / totaal | < 10 % per module |
| Afwijzingsratio | Afgewezen / totaal | < 5 % per module |
| Confidentie-accuratesse | Hoog-confidence-adviezen die worden bevestigd | > 90 % |
| Doorlooptijd beslissing | Tijdstip voorstel → tijdstip bevestiging | < 5 minuten (veld), < 24 uur (kantoor) |

Als een module structureel onder de streefwaarden zit, is dat een signaal voor prompt-verbetering of model-update.
