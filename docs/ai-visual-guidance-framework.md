# AI Visual Guidance Framework (VGF) — Architectuurontwerp

**Status:** Ontwerp — nog niet geïmplementeerd  
**Versie:** 1.0  
**Datum:** 2026-07-05  
**Afhankelijkheden bij implementatie:** Task #302 (PIM Fase G), Task #303 (KB Foundation), Task #300 (Uitvoering)

---

## 1. Visie en doelstelling

Het AI Visual Guidance Framework (VGF) is een centrale, modulaire voorziening die monteurs tijdens complexe uitvoeringswerkzaamheden visueel begeleidt. Het framework is géén losstaande module maar een generieke laag die door alle AI-modules (PIM, KB, Spotherkenning, Bibliotheekvalidatie) kan worden gebruikt.

**Centrale belofte:** Een monteur die een doorvoering afdicht of een brandklep monteert, krijgt op het juiste moment de juiste visuele instructie — niet meer informatie dan nodig, altijd gebaseerd op goedgekeurde bronnen.

**Drie kernfuncties:**

1. **Visual Library** — centrale opslag van goedgekeurde visuals (tekeningen, referentiefoto's, instructies, animaties) met verplichte brondocumentatie
2. **Visual Guidance Engine (VGE)** — deterministische selectie van maximaal 3 visuals per uitvoeringsstap op basis van spot-type, staptype en historische effectiviteit
3. **AI Fotoanalyse** — vergelijking van ingediende monteur-foto met referentie, waarbij annotaties altijd gescheiden van het origineel worden bewaard

**Niet in scope voor déze taak:** implementatie, DB-aanmaak, frontend-schermen. Dit document is het ontwerp dat implementatie mogelijk maakt.

---

## 2. Grondbeginselen

Het VGF werkt volgens vijf harde grondbeginselen die in alle implementaties onverkort gelden:

### 2.1 AI selecteert, verzint niet

AI mag uitsluitend:
- Selecteren uit bestaande, goedgekeurde visuals
- Vereenvoudigen (samenvatten wat er al staat)
- Markeren (aandachtspunten annoteren op bestaande foto's)
- Combineren (meerdere goedgekeurde visuals samenvoegen tot een set)

AI mag nooit:
- Technische specificaties genereren die niet in een brondocument staan
- Maten, brandwerendheidsklassen, producteisen of normen verzinnen
- Een visual toevoegen of tonen zonder een controleerbare `bron_type`

### 2.2 Originele foto's zijn onveranderlijk

Elke foto die een monteur uploadt, wordt in object storage bewaard op een pad dat nooit wordt overschreven. AI-annotaties worden als aparte laag bewaard op een ander pad. Het systeem dwingt dit af in code — de `fps_visual_annotaties`-tabel bevat twee expliciete paden: `originele_foto_path` en `annotatie_path`.

### 2.3 Bron is verplicht

Een visual zonder controleerbare `bron_type` (projecttekening / ETA / DoP / montagevoorschrift / fps_standaard / praktijkfoto / productblad) wordt nooit getoond, ongeacht of de AI hem aanbeveelt.

### 2.4 Leerlaag stuurt nooit technische eisen

De effectiviteitslog (`vge_effectiveness_log`) wordt uitsluitend gebruikt om de volgorde van visuele suggesties te verbeteren. Hij schrijft nooit naar productspecificaties, testnormen, of brandwerendheidsclassificaties.

### 2.5 Animaties zijn beheerder-geassembleerd

Animaties worden niet runtime door AI gegenereerd. Ze bestaan uit gecontroleerde, beheerder-goedgekeurde componenten (SVG-sequenties, Lottie JSON) en worden door de beheerder samengesteld. AI selecteert welke animatie past bij een stap.

---

## 3. Componentenkaart en interfaces

```
┌─────────────────────────────────────────────────────────────────┐
│                    PIM Uitvoering (Monteur App)                  │
│  StapContext: { spot_type, stap_type, toepassing_id, klant_id } │
└────────────────────────────┬────────────────────────────────────┘
                             │ vraagt guidance
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              Visual Guidance Engine (VGE)                        │
│  - selectVisuals(StapContext): VisualSet                         │
│  - scoreVisual(visual_id, StapContext): number                   │
│  - persistGuidanceContext(stap_id, VisualSet): void              │
└──────┬────────────────┬──────────────────┬───────────────────────┘
       │                │                  │
       ▼                ▼                  ▼
┌─────────────┐  ┌─────────────┐  ┌──────────────────┐
│Visual Library│  │ KB Service  │  │Effectiviteitslog  │
│fps_visuals   │  │(kbService)  │  │vge_effectiveness_ │
│             │  │bedrijfs-    │  │log               │
│             │  │standaarden  │  └──────────────────┘
└─────────────┘  └─────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────────┐
│                   AI Fotoanalyse Laag                            │
│  analyseStapFoto(foto, referentie, eisen): AnnotatieResultaat   │
│  Resultaat: fps_visual_annotaties (twee aparte paden)           │
└─────────────────────────────────────────────────────────────────┘
```

### TypeScript interfaces (implementatiereferentie)

```typescript
/** Context die per uitvoeringsstap beschikbaar is */
interface StapContext {
  stapId: number;
  spotType: string;
  stapType: 'voorbereiding' | 'montage' | 'controle' | 'foto';
  toepassingId?: number;
  klantId?: number;
  beschikbareVisualIds?: number[];
}

/** Een geselecteerde visual inclusief metadata */
interface VisualAsset {
  id: number;
  naam: string;
  visualType: VisualType;
  bronType: BronType;
  objectPath: string;
  thumbnailPath: string;
  effectiviteitsScore?: number;
}

/** Set van maximaal 3 visuals per stap */
interface VisualSet {
  watZieJeNu?: VisualAsset;
  watIsEindresultaat?: VisualAsset;
  hoeDoejeDit?: VisualAsset;
  aandachtspunten: string[];
  veiligheidsrisicos: string[];
  maxVisualsGetoond: number;
}

/** Resultaat van de AI fotoanalyse */
interface AnnotatieResultaat {
  origineleFotoPath: string;       // Ongewijzigd origineel
  annotatiePath: string;           // Aparte annotatie-laag
  afwijkingStatus: 'akkoord' | 'aandacht_vereist' | 'herstel_nodig';
  bevindingen: string[];
  context: 'kwaliteitscontrole' | 'afwijkingsmarkering' | 'instructie';
}

/** Enum-achtige union voor visual types */
type VisualType =
  | 'detailtekening'
  | 'projecttekening_uitsnede'
  | 'referentiefoto'
  | 'exploded_view'
  | 'animatie'
  | 'checklist'
  | 'productblad'
  | 'montagevoorschrift'
  | 'schema'
  | '3d_weergave';

/** Enum-achtige union voor brondocumenttypen */
type BronType =
  | 'projecttekening'
  | 'ETA'
  | 'DoP'
  | 'montagevoorschrift'
  | 'fps_standaard'
  | 'praktijkfoto'
  | 'productblad';

// ── Extensibiliteitshaken (NIET bouwen in Fase 1) ─────────────────

/** Toekomstige connectors voor externe visual-bronnen */
interface VisualProvider {
  type: 'document' | 'bim_ifc' | 'revit' | 'autocad' | '3d_gltf' | 'ar_marker';
  sourceId: string;
  resolveVisual(context: StapContext): Promise<VisualAsset>;
}

/** Toekomstige AI-analyse providers */
interface FotoAnalyseProvider {
  type: 'gpt4o_vision' | 'custom_vision' | 'ar_overlay';
  analyseStapFoto(
    foto: Buffer,
    referentie: VisualAsset,
    eisen: string[]
  ): Promise<AnnotatieResultaat>;
}
```

---

## 4. Datamodel

### 4.1 fps_visuals

Centrale opslag van alle goedgekeurde visuals.

| Kolom | Type | Nullable | Toelichting |
|---|---|---|---|
| id | serial PK | nee | |
| naam | text | nee | Leesbare naam voor beheerder |
| visual_type | text | nee | detailtekening / projecttekening_uitsnede / referentiefoto / exploded_view / animatie / checklist / productblad / montagevoorschrift / schema / 3d_weergave |
| bron_type | text | nee | **Verplicht** — projecttekening / ETA / DoP / montagevoorschrift / fps_standaard / praktijkfoto / productblad |
| bron_referentie | text | ja | Documentnummer, ETA-code, of interne verwijzing |
| object_path | text | nee | Object storage pad (GCS/S3) |
| thumbnail_path | text | ja | Verkleinde versie voor mobiel (max. 400px breed) |
| spot_type | text[] | nee | Toepasselijke spot-types, bijv. `['branddeur', 'doorvoering']` |
| artikel_id | integer FK artikelen | ja | Optionele productkoppeling |
| bedrijfsstandaard_id | integer FK fps_bedrijfsstandaarden | ja | Optionele KB-koppeling |
| taal | text | nee | Default `'nl'` |
| actief | boolean | nee | Default `false` — beheerder moet expliciet activeren |
| aangemaakt_op | timestamptz | nee | Default `now()` |
| bijgewerkt_op | timestamptz | ja | |

**Index:** `(spot_type GIN, visual_type, actief)` — voor efficiënte VGE-selectie.

**Constraint:** `CHECK (bron_type IN ('projecttekening','ETA','DoP','montagevoorschrift','fps_standaard','praktijkfoto','productblad'))` — systeem weigert een visual zonder geldige bron.

### 4.2 fps_visual_annotaties

AI-gegenereerde annotaties — altijd gescheiden van het origineel.

| Kolom | Type | Nullable | Toelichting |
|---|---|---|---|
| id | serial PK | nee | |
| originele_foto_path | text | nee | Object storage pad originele foto — NOOIT overschreven |
| annotatie_path | text | nee | Object storage pad annotatie-laag — apart bestand |
| context | text | nee | 'kwaliteitscontrole' / 'afwijkingsmarkering' / 'instructie' |
| afwijking_status | text | nee | 'akkoord' / 'aandacht_vereist' / 'herstel_nodig' |
| bevindingen | text[] | ja | Lijst van geconstateerde afwijkingen |
| pim_stap_id | integer FK pim_uitvoering_stappen | ja | Stap waarvoor gegenereerd |
| gegenereerd_door_model | text | ja | Bijv. 'gpt-4o' — voor audit |
| gegenereerd_op | timestamptz | nee | Default `now()` |

**Constraint:** `CHECK (originele_foto_path <> annotatie_path)` — expliciete afbakening dat de paden niet gelijk mogen zijn.

### 4.3 vge_effectiveness_log

Leerdatabank voor visuele effectiviteit — schrijft nooit naar productspecificaties.

| Kolom | Type | Nullable | Toelichting |
|---|---|---|---|
| id | serial PK | nee | |
| visual_id | integer FK fps_visuals | nee | Welke visual werd getoond |
| pim_stap_id | integer FK pim_uitvoering_stappen | nee | Bij welke stap |
| stap_type | text | nee | voorbereiding / montage / controle / foto |
| spot_type | text | nee | Spot-type ten tijde van stap |
| herstelwerk_nodig | boolean | nee | Moest stap herhaald worden? |
| stap_duur_seconden | integer | ja | Duur van de stap in seconden |
| monteur_vraag_gesteld | boolean | nee | Heeft monteur hulp gevraagd? |
| kwaliteit_resultaat | text | ja | 'akkoord' / 'aandacht' / 'herstel' |
| aangemaakt_op | timestamptz | nee | Default `now()` |

**Index:** `(visual_id, spot_type, stap_type)` — voor geaggregeerde effectiviteitsberekening.

**Harde regel:** Geen enkele route of service schrijft op basis van deze tabel naar `artikelen`, `labels`, `leveranciers`, `fps_bedrijfsstandaarden` of andere productspecificatietabellen.

### 4.4 JSONB: guidance_context op pim_uitvoering_stappen

Het JSONB-veld `guidance_context` wordt toegevoegd aan de bestaande `pim_uitvoering_stappen`-tabel bij implementatie. Schema:

```json
{
  "wat_zie_je_nu": {
    "visual_id": 12,
    "type": "referentiefoto",
    "thumbnail_url": "/api/storage/visuals/12/thumb"
  },
  "wat_is_eindresultaat": {
    "visual_id": 34,
    "type": "referentiefoto",
    "thumbnail_url": "/api/storage/visuals/34/thumb"
  },
  "hoe_doe_je_dit": {
    "visual_id": 56,
    "type": "detailtekening",
    "thumbnail_url": "/api/storage/visuals/56/thumb"
  },
  "aandachtspunten": [
    "Controleer afdichting rondom aansluitvlak",
    "Zorg dat kabel niet inklemd zit"
  ],
  "veiligheidsrisicos": [],
  "max_visuals_getoond": 3,
  "gegenereerd_op": "2026-07-05T10:00:00Z",
  "vge_versie": "1.0"
}
```

---

## 5. Visual Library ontwerp

### 5.1 Beheer

De Visual Library is een beheerder-gated module. Nieuwe visuals volgen een goedkeuringsflow:

```
Upload → Concept (actief=false) → Validatie beheerder → Actief (actief=true)
```

Een visual in `actief=false`-status is niet zichtbaar in de VGE en wordt nooit aan een monteur getoond.

### 5.2 Visual types en wanneer ze worden ingezet

| Visual type | Wanneer ingezet | Stap-types |
|---|---|---|
| detailtekening | Exacte montagepositie, maatvoering | montage, controle |
| projecttekening_uitsnede | Locatie in gebouw, relatie tot andere spots | voorbereiding |
| referentiefoto | Hoe ziet correct resultaat eruit | montage, controle |
| exploded_view | Onderdeel-voor-onderdeel opbouw product | voorbereiding, montage |
| animatie | Stap-voor-stap montagevolgorde (Lottie) | montage |
| checklist | Aftekenen tussentijdse controlepunten | controle |
| productblad | Productspecificaties, ETA-kenmerk | voorbereiding |
| montagevoorschrift | Fabrikantinstructies | montage |
| schema | Elektrisch/mechanisch aansluitschema | montage |
| 3d_weergave | Ruimtelijke oriëntatie (later, BIM-spoor) | voorbereiding |

### 5.3 Koppeling aan KB

Elke visual kan gekoppeld zijn aan:
- Een artikel (`artikel_id`) — voor productvideo/tekening van specifiek product
- Een bedrijfsstandaard (`bedrijfsstandaard_id`) — voor FPS-interne richtlijnen

Deze koppelingen zijn optioneel maar verrijken de VGE-selectie: als de KB-context een specifiek artikel aanbeveelt voor een spot, worden visuals met dat `artikel_id` hoger gerangschikt.

### 5.4 Meertaligheid

Het veld `taal` (default `'nl'`) maakt het mogelijk om later dezelfde visual in meerdere talen te bieden. De VGE kiest op basis van monteur-taalvoorkeur (later uit gebruikersprofiel).

---

## 6. Visual Guidance Engine — beslislogica per stap

### 6.1 Selectiepijplijn

De VGE werkt in vier stappen:

```
1. KANDIDATEN OPHALEN
   SELECT * FROM fps_visuals
   WHERE actief = true
     AND spot_type && ARRAY[stap.spot_type]   -- GIN-index
   ORDER BY bedrijfsstandaard_id DESC NULLS LAST, artikel_id DESC NULLS LAST

2. FILTEREN OP STAPTYPE
   visual_type_voor_staptype = {
     voorbereiding: [projecttekening_uitsnede, productblad, exploded_view, 3d_weergave],
     montage:       [detailtekening, animatie, montagevoorschrift, schema, referentiefoto],
     controle:      [checklist, referentiefoto, detailtekening],
     foto:          [referentiefoto]
   }

3. EFFECTIVITEITSSCORE BEREKENEN
   SELECT visual_id,
          AVG(CASE WHEN herstelwerk_nodig THEN 0 ELSE 1 END) AS score
   FROM vge_effectiveness_log
   WHERE spot_type = $spot_type AND stap_type = $stap_type
   GROUP BY visual_id

4. SORTEREN EN MAXIMAAL 3 KIEZEN
   Prioriteitsvolgorde: instructie-visual > referentiefoto > checklist
   Tiebreaker: effectiviteitsscore DESC, aangemaakt_op DESC
```

### 6.2 Guidance context persisteren

Na selectie wordt de `VisualSet` als JSONB opgeslagen op `pim_uitvoering_stappen.guidance_context`. Dit zorgt ervoor dat:
- De monteur-app de guidance ontvangen kan zonder nieuwe AI-aanroep
- Auditors kunnen reconstrueren welke guidance getoond was op het moment van uitvoering
- De effectiviteitslog achteraf kan worden gevuld met de juiste `visual_id`

### 6.3 Fallback bij lege Library

Als er geen actieve visuals zijn voor een spot-type/stap-type combinatie:
- `guidance_context.wat_zie_je_nu = null`
- Aandachtspunten uit `fps_bedrijfsstandaarden` worden als tekst-only getoond
- Geen foutmelding — de monteur ziet een lege sectie met tekst "Geen visuele instructie beschikbaar"

---

## 7. AI Fotoanalyse laag

### 7.1 Aanroepflow

```
Monteur uploadt foto
    │
    ▼
ObjectStorage.upload(foto) → originele_foto_path (onveranderlijk)
    │
    ▼
VGE haalt referentie-visual op uit guidance_context.wat_is_eindresultaat
    │
    ▼
KB haalt producteisen op (assembleKbContext({ klantId, artikelId }))
    │
    ▼
AI analyseert: foto vs. referentie vs. producteisen vs. fps_bedrijfsstandaarden
    │
    ▼
AI genereert annotatie-laag (apart bestand) → annotatie_path
    │
    ▼
fps_visual_annotaties INSERT (originele_foto_path ≠ annotatie_path — constraint)
    │
    ▼
pim_uitvoering_stappen.afwijking_status = 'akkoord' | 'aandacht_vereist' | 'herstel_nodig'
```

### 7.2 Annotatieopmaak

De annotatie-laag is een PNG met transparante achtergrond. Inhoud:
- Gekleurde markeringen (groen = akkoord, oranje = aandacht, rood = herstel)
- Pijlen naar afwijkende zones
- Korte tekstlabels (max. 40 tekens per label)

De monteur-app rendert beide lagen op elkaar (origineel als achtergrond, annotatie als overlay). Beheerder en auditor zien beide lagen afzonderlijk beschikbaar.

### 7.3 Beperkingen AI

De AI mag in de analyse:
- Vergelijken met referentie-visual
- Constateren of zichtbare afdichting aanwezig is
- Kleur, completering, positie beoordelen

De AI mag niet:
- Brandwerendheid bepalen op basis van foto
- ETA- of CE-conformiteit vaststellen
- Maten vaststellen zonder kalibratiepunt in de foto

---

## 8. Animatieframework

### 8.1 Geen runtime AI-video

Animaties worden door een beheerder samengesteld uit goedgekeurde componenten. AI selecteert uitsluitend welke bestaande animatie past bij een stap.

### 8.2 Technisch voertuig: Lottie JSON

Animaties worden opgeslagen als Lottie JSON-bestanden (`visual_type = 'animatie'`). Voordelen:
- Kleine bestandsgrootte (geschikt voor offline-first monteur-app)
- Frame-nauwkeurige controle door beheerder
- Speelt af in React Native via `lottie-react-native`
- Geen afhankelijkheid van externe video-platforms

Beheerder-workflow:
1. Designer maakt SVG-tekeningen per montagestap
2. Designer exporteert Lottie JSON uit Adobe After Effects of LottieFiles Studio
3. Beheerder uploadt Lottie JSON in Visual Library — `bron_type = 'fps_standaard'`
4. Beheerder zet `actief = true` na review

### 8.3 Toekomstig: 3D GLTF (BIM-spoor)

Als de BIM/IFC-connector beschikbaar is, kunnen 3D GLTF-componenten worden gebruikt als `visual_type = '3d_weergave'`. De `VisualProvider`-interface (sectie 3) biedt daarvoor de extensiehook. In Fase 1 worden GLTF-visuals nog niet ondersteund.

---

## 9. Leerlaag — effectiviteitsmeting na project

### 9.1 Wat wordt gemeten

Na afsluiting van een uitvoeringsstap schrijft het systeem automatisch een rij naar `vge_effectiveness_log`:

- Welke visual getoond (`visual_id`)
- Bij welke stap (`pim_stap_id`)
- Stap-type en spot-type (voor geaggregeerde analyse)
- Of herstelwerk nodig was (`herstelwerk_nodig`)
- Stap-duur in seconden
- Of monteur een vraag stelde
- Kwaliteitsresultaat uit de fotoanalyse

### 9.2 Hoe de leerlaag werkt

De VGE gebruikt de effectiviteitslog in stap 3 van de selectiepijplijn (sectie 6.1): visuals die historisch vaker leiden tot `herstelwerk_nodig = false` en kortere stap-duur, krijgen een hogere score en worden eerder gekozen.

De berekening is transparant en eenvoudig — geen black-box ML model. Een beheerder kan de effectiviteitsscores inzien per visual en per spot-type.

### 9.3 Wat de leerlaag nooit doet

- Schrijft nooit naar `artikelen`, `labels`, `leveranciers`, `fps_bedrijfsstandaarden`, of andere productspecificatietabellen
- Verwijdert of deactiveert nooit een visual op basis van score alleen (alleen beheerder kan `actief = false` zetten)
- Stuurt nooit een keuze voor een specifiek merk of product (commercieel neutrale evaluatie)

### 9.4 Privacy

`vge_effectiveness_log` bevat geen persoonsgegevens. `pim_stap_id` is een technische sleutel zonder directe koppeling aan `gebruiker_id`. Als de projectcontext later herleidbaar wordt tot een persoon, geldt de AVG-bewaarperiode van het project.

---

## 10. Extensibiliteitshaken: BIM/IFC, Revit/AutoCAD, AR, nieuwe AI-modellen

### 10.1 VisualProvider (toekomstige connectors)

De `VisualProvider`-interface (sectie 3) definieert hoe externe visual-bronnen worden gekoppeld. Elke provider implementeert `resolveVisual(context: StapContext): Promise<VisualAsset>` en retourneert een `VisualAsset` die compatibel is met de bestaande VGE-selectiepijplijn.

Geplande toekomstige providers:

| Provider type | Bron | Wanneer |
|---|---|---|
| `bim_ifc` | IFC-model uit BIM-software | Als projecten een BIM-model hebben |
| `revit` | Revit families en sheets | Bij Revit-integratie opdrachtgever |
| `autocad` | DWG/DXF tekeningen | Retrofitten van legacy projecttekeningen |
| `3d_gltf` | GLTF-bestanden uit 3D-modellering | Samen met BIM-spoor |
| `ar_marker` | AR-markeringen in ruimte | Augmented Reality monteur-app (ver toekomst) |

Activering van een provider: registreer een implementatie in de `VisualProviderRegistry` (nog te bouwen) zonder de VGE te wijzigen.

### 10.2 FotoAnalyseProvider (toekomstige AI-modellen)

De `FotoAnalyseProvider`-interface maakt het mogelijk om andere visie-modellen in te schakelen naast de huidige GPT-4o Vision. Nieuwe providers leveren altijd een `AnnotatieResultaat` terug — de verwerkingspijplijn is model-agnostisch.

Geplande uitbreidingen:
- `custom_vision` — fine-tuned model op FPS-specifieke brandpreventieafbeeldingen (nadat voldoende gelabelde data beschikbaar is)
- `ar_overlay` — real-time AR-overlay via mobiele camera (ver toekomst, afhankelijk van V2.0 monteur-app)

### 10.3 Nieuwe AI-modellen

De `aiGateway`-laag (bestaand in `artifacts/api-server/src/lib/aiGateway.ts`) isoleert de VGF-aanroepen al van de specifieke AI-provider. Overstap van GPT-4o naar een nieuw model vereist uitsluitend een wijziging in de gateway-configuratie.

---

## 11. Risicoanalyse

| # | Risico | Kans | Impact | Maatregel |
|---|---|---|---|---|
| R1 | AI verzint technische instructies | Middel | Hoog | Harde `bron_type` CHECK-constraint op `fps_visuals`; visual zonder geldige bron wordt nooit getoond — afdwingen in VGE-query (`WHERE actief = true AND bron_type IN (...)`) |
| R2 | Annotatie overschrijft originele foto | Laag | Hoog | `CHECK (originele_foto_path <> annotatie_path)` op DB-niveau; twee expliciete velden, nooit één pad hergebruiken; afgedwongen in object storage upload-logica |
| R3 | Visual Library groeit onbeheerst | Middel | Middel | `actief = false` als default; beheerder-goedkeuringsflow vereist; maandelijkse audit-query op ongebruikte visuals (lage effectiviteitsscore + nooit getoond) |
| R4 | Leermechanisme stuurt technische eisen | Laag | Hoog | `vge_effectiveness_log` heeft geen FK naar productspecificatietabellen; service schrijft uitsluitend naar de log-tabel; code review afdwingen bij elke wijziging van de leerlaag |
| R5 | Animaties technisch onbetrouwbaar | Middel | Hoog | Animaties bouwen uitsluitend uit beheerder-goedgekeurde Lottie-bestanden; géén runtime AI-generatie; `bron_type = 'fps_standaard'` vereist |
| R6 | Fotoanalyse geeft valse zekerheid | Middel | Hoog | Resultaat is altijd adviserend, nooit juridisch bepalend; UI toont expliciet "AI-beoordeling — menselijke controle vereist"; `herstel_nodig`-status blokkeert stap maar inspecteur beslist definitief |
| R7 | Offline beschikbaarheid visuele content | Middel | Middel | Thumbnail + Lottie JSON worden gecached op het apparaat bij stapstart (monteur-app offline-first patroon); grote bestanden (HD foto's, 3D) alleen bij connectiviteit |

---

## 12. Implementatievolgorde

### 12.1 Vereisten voor implementatie start

- [x] Task #302 (PIM Fase G — Oplevering) gemerged en productie stabiel
- [x] Task #303 (KB Foundation) gemerged — `fps_bedrijfsstandaarden` en `artikelen` KB-velden beschikbaar
- [ ] Task #300 (Uitvoering) — `pim_uitvoering_stappen` tabel aanwezig met `guidance_context` JSONB-veld

### 12.2 Faseplan

```
Fase 1 — Visual Library basis (2-3 dagen)
├── DB: CREATE TABLE fps_visuals (kolommen conform sectie 4.1)
├── DB: CREATE TABLE fps_visual_annotaties (kolommen conform sectie 4.2)
├── API: GET/POST/PATCH /visuals (beheerder-only)
├── API: GET /visuals?spot_type=&stap_type= (voor VGE-query)
└── Beheer-UI: upload + goedkeuring visuele library

Fase 2 — Visual Guidance Engine (1-2 dagen)
├── DB: ALTER pim_uitvoering_stappen ADD COLUMN guidance_context JSONB
├── Service: vgeService.selectVisuals(StapContext): VisualSet
├── Integratie: PIM-uitvoering endpoint roept VGE aan na stapstart
└── Monteur-app: guidance-sectie per stap (thumbnails + aandachtspunten)

Fase 3 — AI Fotoanalyse (1-2 dagen)
├── DB: CREATE TABLE vge_effectiveness_log (kolommen conform sectie 4.3)
├── Service: fotoAnalyseService.analyseStapFoto(...)
├── Integratie: PIM-foto-upload endpoint roept fotoanalyse aan
└── Monteur-app: annotatie-overlay weergave

Fase 4 — Leerlaag activeren (1 dag)
├── Service: na stapafronding INSERT INTO vge_effectiveness_log
└── VGE: effectiviteitsscore meewegen in selectiepijplijn (stap 3)

Fase 5+ — Extensies (nader te bepalen)
├── Animatieframework (Lottie upload + afspeelcomponent)
├── BIM/IFC connector (VisualProvider interface)
└── AR overlay (FotoAnalyseProvider interface)
```

### 12.3 Afhankelijkheidsgraph

```
[Fase 1: Visual Library] ──► [Fase 2: VGE] ──► [Fase 3: Fotoanalyse] ──► [Fase 4: Leerlaag]
        │                                                                          │
        └── vereist: #303 KB ──────────────────────────────────────────────────────┘
        └── vereist: #302 PIM stabiel
        └── vereist: #300 Uitvoering (pim_uitvoering_stappen)
```

### 12.4 Niet implementeren vóór

- Productieomgeving stabiel na Fase G (#302)
- Minstens 3 actieve projecten in uitvoering (voor zinvolle leerlaag-data)
- Beheerder heeft minimaal 10 visuals klaar staan in de Library (anders is VGE-selectie leeg)

---

*Document aangemaakt: 2026-07-05 | Eigenaar: FPS Connect ontwikkelteam | Volgende review: bij start Fase 1 implementatie*
