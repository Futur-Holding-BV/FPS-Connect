# AI-architectuuranalyse — FPS Connect

**Status:** analyse, geen code gewijzigd  
**Datum:** 2026-07-02  
**Methode:** codebase-inspectie (routes, services, frontend-componenten, lib)

---

## Samenvatting

FPS Connect heeft op dit moment **19 actieve AI-functionaliteiten** verspreid over het platform. De infrastructuur heeft een goede basis (centrale client-factory, vijf service-bestanden), maar de meerderheid van de AI-logica is **inline** in route-handlers geschreven. Dit leidt tot minstens **zes concrete dupliceringspatronen** en een inconsistent modelgebruik (vier verschillende modellen zonder gedocumenteerde selectiecriteria).

De mobiele app (FPS Monteur) heeft geen AI-functionaliteit.

Het voorstel aan het einde van dit document beschrijft een centrale AI-service die alle bestaande functionaliteit behoudt, de duplicaten wegwerkt en een consistente structuur biedt voor toekomstige AI-uitbreidingen.

---

## Deel 1 — Huidige infrastructuur

### 1.1 OpenAI-client (`lib/openai.ts`)

Het platform heeft één gedeelde client-factory — dit is al goed geregeld:

```
maakOpenAiClient()
  ├── Replit proxy (voorkeur):
  │     AI_INTEGRATIONS_OPENAI_BASE_URL + AI_INTEGRATIONS_OPENAI_API_KEY
  └── Directe sleutel (fallback):
        OPENAI_API_KEY

heeftOpenAi() → boolean  (beschikbaarheidscheck)
```

**Status:** goed — enkelvoudige client-aanmaak, twee configuratiekanalen, beschikbaarheidscheck beschikbaar.  
**Probleem:** `maakOpenAiClient()` wordt in elke route/service opnieuw aangeroepen; er is geen singleton-instantie, geen retry-logica en geen token-logging op dit niveau.

---

### 1.2 AI-service bestanden (`services/`)

Vijf gestructureerde service-bestanden, elk verantwoordelijk voor één AI-domein:

| Bestand | Functie | Model | Uitvoer |
|---|---|---|---|
| `services/gebouw-ai.ts` | Gebouwanalyse: geocoding, satellite/street view vision, plattegrond-extractie | gpt-5 | Gebouwvelden (bouwjaar, type, eigenaar, etc.) |
| `services/document-ai.ts` | PDF-metadata extractie uit technische documentatie | gpt-5 | fabrikant, productType, enNorm, revisieDatum |
| `services/email-ai.ts` | E-mailclassificatie + NAW-extractie | gpt-5 | type, projectNummer, samenvatting, NAW-data |
| `services/spot-ai.ts` | Vision-analyse van spotfoto's (voor/na vergelijking) | gpt-5 | Spottype, conditie, afwijkingen |
| `services/opleiding-ai.ts` | Opleidingsvoorstel per functie | gpt-5 | Lijst aanbevolen opleidingen/cursussen |

**Status:** goede structuur, consistent modelgebruik (allemaal gpt-5), proper gescheiden van routing.

---

### 1.3 AI-marktscout (`lib/scoutService.ts`)

Een aparte achtergrondservice die niet past in de service-/routes-indeling:

- **Functie:** dagelijkse marktintelligentie — haalt RSS-artikelen op voor regio Overijssel & Achterhoek, filtert met AI op relevantie voor brandpreventie, slaat op in `crm_marktintelligentie` (bron_type = 'scout')
- **Model:** gpt-4o-mini (kostenbewust voor hoog volume)
- **Trigger:** dagelijkse cron via `planDagelijkseScout()` geregistreerd in `index.ts`; ook handmatig te starten via `POST /crm/scout/start` (beheerder)
- **Status:** `GET /crm/scout/status`

**Ligging:** `lib/scoutService.ts` — niet in `services/`, wat de vinding verhult bij zoeken naar AI-services.

---

## Deel 2 — AI-routes inventory

### 2.1 Gecentraliseerde `/ai/` namespace

De volgende endpoints zijn bewust onder het `/ai/`-prefix gegroepeerd:

| Endpoint | Methode | Service | Functie |
|---|---|---|---|
| `/ai/gebouw-extractie` | POST | `gebouw-ai.ts` | Gebouwdata extraheren uit vrije tekst + vision |
| `/ai/document-analyse` | POST | `document-ai.ts` | PDF technisch document analyseren |
| `/ai/spot-herkenning` | POST | `spot-ai.ts` | Spottype herkennen uit foto |
| `/ai/opleidingen-voorstel` | POST | `opleiding-ai.ts` | Opleidingen voorstellen per functie |
| `/ai/centraal-invullen` | POST | (inline) | Formuliervelden aanvullen voor 9 entiteitstypen |

De centrale endpoint `/ai/centraal-invullen` is de meest volwassen AI-integratie: één route bedient 9 entiteitstypen (`crm_organisatie`, `crm_contactpersoon`, `gebouw`, `leverancier`, `werkmaatschappij`, `concurrent`, `wagenpark_voertuig`, `medewerker`, `magazijn_artikel`) en wordt aangesproken via de gedeelde `AiInvullenKnop`-component.

---

### 2.2 Inline AI in module-routes (niet gecentraliseerd)

De volgende AI-logica zit **inline in route-handlers**, buiten de service-bestanden en buiten het `/ai/`-prefix:

| Route | Bestand | Model | Functie | Duplicaat-patroon |
|---|---|---|---|---|
| `POST /facturen/:id/ai-uitlezen` | `facturen.ts` | onbekend | Invoice OCR: kvk, btw, iban, totaal, factuurnummer | JSON-strip |
| `POST /snagstream/rapporten/:id/ai-uitlezen` | `snagstream.ts` | gpt-4o | Snagstream PDF-rapport uitlezen | JSON-strip |
| `POST /modules/calculaties/:id/ai-regels` | `mod-calculatie.ts` | onbekend | AI-calculatieregels voorstellen | JSON-strip |
| `POST /modules/calculaties/:id/ai-chat` | `mod-calculatie.ts` | gpt-5.4 | Interactieve AI-chat voor calculatie | Chat-patroon |
| `POST /veiligheid/toolboxen/:id/ai-analyse` | `veiligheid.ts` | gpt-4o | Toolbox-bijeenkomst samenvatten/classificeren | JSON-strip (4x) |
| `POST /veiligheid/lmra/ai-*` | `veiligheid.ts` | gpt-4o | LMRA-risicoanalyse | JSON-strip |
| `POST /veiligheid/incidenten/ai-*` | `veiligheid.ts` | gpt-4o | Incident classificeren/samenvatten | JSON-strip |
| `POST /wagenpark/meldingen/ai-analyse` | `wagenpark-meldingen.ts` | gpt-4o | Voertuigproblem diagnose uit foto+tekst | Vision-bouw |
| `POST /slim-upload/scan` | `slim-upload.ts` | gpt-4o-mini | Geüpload bestand classificeren op type | Vision-bouw |
| `POST /offertes/:id/ai-email` | `offertes.ts` | onbekend | E-mail genereren voor offerte | — |
| `POST /offertes/klant-contracten/:id/ai-advies` | `offertes.ts` | onbekend | Juridisch/contractadvies | — |
| `POST /crm/ai-coach` | `crm.ts` | gpt-4o | CRM-coaching per scherm/klant | — |
| `POST /crm/scout/start` | `crm.ts` | (scoutService) | Handmatige scout-trigger | — |
| `POST /opdrachten/:id/ai-chat` | `opdrachten.ts` | gpt-5.4 | Interactieve AI-chat voor opdrachten | Chat-patroon |
| `POST /werkvoorbereiding/ai-inkoop` | `werkvoorbereiding.ts` | onbekend | AI-inkoopplanning suggestie | JSON-strip |
| `POST /werkvoorbereiding/ai-bons` | `werkvoorbereiding.ts` | onbekend | AI-inkoopbonnen groeperen per leverancier | JSON-strip |
| `POST /werkvoorbereiding/ai-uitvoering` | `werkvoorbereiding.ts` | onbekend | AI-uitvoeringsplanning | JSON-strip |
| `POST /pbm/ai-*` | `pbm.ts` | onbekend | PBM-controle/analyse | Vision-bouw |
| `POST /salaris-mutaties/ai-*` | `salaris-mutaties.ts` | onbekend | Salaris-mutatieverwerking | JSON-strip |
| `POST /werk-inbox/:id/ai-logboek` | `werk-inbox.ts` | onbekend | Mail-logboek AI-samenvatting | JSON-strip |
| `POST /organisatie/studio/ai-*` | `studio.ts` | onbekend | Document-studio template-generatie | JSON-strip (2x) |
| `POST /hrm/functies/:id/opleidingen-voorstel` | `hrm.ts` | (opleiding-ai.ts service) | Opleidingen voorstellen (roept service aan) | — |

**Totaal:** 5 gecentraliseerde routes + ~22 module-interne AI-routes.

---

## Deel 3 — AI in de frontend

### 3.1 Gedeelde AI-componenten

**`AiInvullenKnop`** (`components/ai-invullen-knop.tsx`) — meest volwassen frontend-AI-patroon:
- Eén component voor 9 entiteitstypen
- Gebruikt `useAiCentraalInvullen` (gegenereerde React Query-hook)
- Toont voorstel in amber-kleurgeving, gebruiker neemt over of negeert
- Correct geïmplementeerd: via gegenereerde API-client, niet via raw fetch

**`CrmCoachPanel`** (`components/crm-coach-panel.tsx`) — afwijkend patroon:
- Direct `fetch("/api/crm/ai-coach", ...)` — bypasses de gegenereerde API-client
- Autolaadt na 1200ms vertraging bij elke schermwissel
- Geen gebruik van React Query (geen caching, geen deduplificatie)
- Elke schermwissel triggert een nieuwe AI-aanroep

**`SlimUploadBalk`** (`components/slim-upload-balk.tsx`) — document-classificatiecomponent:
- Gebruikt vermoedelijk de gegenereerde hook voor `/slim-upload/scan`

### 3.2 Verspreide AI-aanroepen in pagina's

AI-patronen zijn aangetroffen in 55+ frontend-bestanden. Gegroepeerd per use case:

| Use case | Pagina-bestanden | Aanroep-patroon |
|---|---|---|
| Formulier AI-invullen | 9+ formulierpagina's (gebouwen, crm, leveranciers, etc.) | Via `AiInvullenKnop`-component |
| Gebouw AI-analyse | `gebouwen/gebouw-aanmaken-dialog.tsx`, `gebouwen/gebouw-bewerken-dialog.tsx` | Via hooks → `/ai/gebouw-extractie` |
| Spot AI-herkenning | `voorzieningen/detail.tsx`, `voorzieningen/index.tsx` | Via hooks → `/ai/spot-herkenning` |
| Calculatie AI-chat | `modules/calculatie/detail.tsx` | Via hook → `/modules/calculaties/:id/ai-chat` |
| Opdracht AI-chat | `opdrachten/detail.tsx` | Via hook → `/opdrachten/:id/ai-chat` |
| Snagstream AI-uitlezen | `snagstream/detail.tsx` | Via hook |
| Factuur AI-uitlezen | `facturen/detail.tsx` | Via hook |
| Crediteuren-inbox | `financieel/crediteuren/index.tsx` | Via hook (email-ai) |
| Toolbox AI-analyse | `veiligheid/toolboxen.tsx` | Via hook |
| Wagenpark-melding AI | `wagenpark/detail.tsx` | Via hook |
| CRM AI-coach | `crm/detail.tsx` (en andere CRM-schermen) | Via `CrmCoachPanel` → raw fetch |
| Slim Uploadpunt | `inbox/index.tsx`, `inbox/detail.tsx` | Via `SlimUploadBalk` |
| Offerte AI-e-mail | `offertes/studio.tsx` | Via hook |
| Opleidingen AI-voorstel | `personeel/detail.tsx` | Via hook → `/ai/opleidingen-voorstel` |
| Werkvoorbereiding AI-inkoop | `opdrachten/inkoopplanning-tab.tsx` | Via hook |
| Document Studio AI | `organisatie/studio` (indirect) | Via pagina |
| Magazijn stellingscans | `magazijn/stellingscans.tsx` | Via hook |
| Brandstof-import AI | `wagenpark/brandstof-import.tsx` | Via hook |

### 3.3 Mobiele app (FPS Monteur)

De monteur-app heeft **geen AI-functionaliteit**. Er zijn geen OpenAI-aanroepen, geen AI-hooks en geen AI-schermen aangetroffen in de Expo-app.

---

## Deel 4 — Duplicaten en inconsistenties

### 4.1 JSON-parsing met markdown-strip (meest wijdverbreid)

Elk route-bestand dat AI-JSON-output verwerkt, implementeert zijn eigen variant van markdown-strip + JSON.parse. Aangetroffen in minstens 11 bestanden, met elk een licht verschillende regex:

```
mod-calculatie.ts:  raw.replace(/```json?\n?/g, "").replace(/```/g, "")
veiligheid.ts (1):  raw.replace(/^```json\s*/, "").replace(/\s*```$/, "")
veiligheid.ts (2):  raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
werk-inbox.ts:      raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "")
hrm.ts:             raw.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim()
studio.ts (2x):     tekst.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim()
salaris-mutaties:   raw.replace(/^```json\n?/i, "").replace(/\n?```$/i, "").trim()
werkvoorbereiding (3x): JSON.parse(aiJson.choices[0]?.message?.content ?? "{}")
```

Elke regex is subtiel anders en heeft eigen blindehoeken (trailing newlines, mixed case, andere talen).

### 4.2 Vision-afbeelding constructie

Drie route-bestanden bouwen handmatig een `ChatCompletionContentPart[]`-array op voor vision-aanroepen:
- `pbm.ts`
- `wagenpark-meldingen.ts`
- `slim-upload.ts`

De hulpfunctie `bereidVisionAfbeeldingVoor()` in `slim-upload.ts` bestaat al — maar wordt niet geëxporteerd of gedeeld.

### 4.3 AI-chat patroon

`mod-calculatie.ts` en `opdrachten.ts` implementeren beide een interactieve AI-chat (streaming of niet-streaming completions) met vergelijkbare signaleringsdetectie-logica. Dit is twee keer dezelfde code.

### 4.4 Model-selectie zonder beleid

Vier modellen worden gebruikt zonder gedocumenteerde selectiecriteria:

| Model | Gebruikt in | Vermoedelijk criterium |
|---|---|---|
| `gpt-5` | gebouw-ai, spot-ai, email-ai, document-ai | Beste kwaliteit voor kritische extractie |
| `gpt-5.4` | mod-calculatie (chat), opdrachten (chat) | Grotere redeneerruimte voor chat |
| `gpt-4o` | wagenpark, scab-mail, veiligheid, crm-coach, snagstream | Legacy of onbekend |
| `gpt-4o-mini` | slim-upload, scoutService | Kosten-optimum voor hoog volume |

Het ontbreekt aan een modelregister. Wanneer een model wordt vervangen (bijv. gpt-4o → gpt-5), moeten alle aanroepen handmatig worden bijgewerkt.

### 4.5 `heeftOpenAi()`-bewaking inconsistent toegepast

De beschikbaarheidscheck `heeftOpenAi()` is beschikbaar in `lib/openai.ts` maar wordt niet in alle routes gecontroleerd. Routes die inline AI hebben, controleren de beschikbaarheid wisselend: sommige geven een duidelijke 503-fout terug, andere gooien een ongecatched runtime-fout.

### 4.6 CRM-coach bypast gegenereerde client

`CrmCoachPanel` gebruikt `fetch("/api/crm/ai-coach")` direct in plaats van een gegenereerde API-hook. Dit betekent:
- Geen TypeScript-typering op het antwoord (handmatig `CoachAntwoord`-interface)
- Geen React Query caching (elke schermwissel = nieuwe AI-aanroep)
- Niet meegenomen in OpenAPI-contract

---

## Deel 5 — Volledige AI-functionaliteitsinventaris

| # | Naam | Type | Ligging backend | Ligging frontend | Model |
|---|---|---|---|---|---|
| 1 | Gebouw AI-invullen | Form fill | `services/gebouw-ai.ts` → `/ai/gebouw-extractie` | `AiInvullenKnop` + `gebouw-aanmaken-dialog` | gpt-5 |
| 2 | Centraal formulier AI-invullen | Form fill | `/ai/centraal-invullen` (inline) | `AiInvullenKnop` (9 typen) | onbekend |
| 3 | Document-analyse | PDF extractie | `services/document-ai.ts` → `/ai/document-analyse` | `beheer/documenten-tab` | gpt-5 |
| 4 | Spot-herkenning | Vision | `services/spot-ai.ts` → `/ai/spot-herkenning` | `voorzieningen/detail` | gpt-5 |
| 5 | Opleidingen voorstel | Advies | `services/opleiding-ai.ts` → `/ai/opleidingen-voorstel` | `personeel/detail` | gpt-5 |
| 6 | E-mail analyse | Classificatie | `services/email-ai.ts` | `financieel/crediteuren` | gpt-5 |
| 7 | Dagelijkse marktscout | Achtergrond-cron | `lib/scoutService.ts` → cron | `crm/marktintelligentie` (leest resultaat) | gpt-4o-mini |
| 8 | Factuur AI-uitlezen | OCR | `routes/facturen.ts` (inline) | `facturen/detail` | onbekend |
| 9 | Snagstream PDF uitlezen | Document parse | `routes/snagstream.ts` (inline) | `snagstream/detail` | gpt-4o |
| 10 | Calculatie AI-regels | Voorstel | `routes/mod-calculatie.ts` (inline) | `modules/calculatie/detail` | onbekend |
| 11 | Calculatie AI-chat | Interactieve chat | `routes/mod-calculatie.ts` (inline) | `modules/calculatie/detail` | gpt-5.4 |
| 12 | Opdracht AI-chat | Interactieve chat | `routes/opdrachten.ts` (inline) | `opdrachten/detail` | gpt-5.4 |
| 13 | Toolbox/LMRA/incident AI | Veiligheid analyse | `routes/veiligheid.ts` (inline, 3+ calls) | `veiligheid/toolboxen`, `lmra`, `incidenten` | gpt-4o |
| 14 | Wagenpark melding diagnose | Vision + tekst | `routes/wagenpark-meldingen.ts` (inline) | `wagenpark/detail` | gpt-4o |
| 15 | Slim Upload classificatie | Vision + bestandsnaam | `routes/slim-upload.ts` (inline) | `SlimUploadBalk` | gpt-4o-mini |
| 16 | Offerte AI-e-mail | E-mail generatie | `routes/offertes.ts` (inline) | `offertes/studio` | onbekend |
| 17 | CRM AI-coach | Coaching | `routes/crm.ts` (inline) | `CrmCoachPanel` (raw fetch) | gpt-4o |
| 18 | Werkvoorbereiding AI-inkoop | Planning voorstel | `routes/werkvoorbereiding.ts` (inline, 3x) | `opdrachten/inkoopplanning-tab` | onbekend |
| 19 | Salaris-mutaties AI | Verwerking | `routes/salaris-mutaties.ts` (inline) | `salaris-mutaties/index` | onbekend |

**Totaal:** 19 AI-functionaliteiten. 6 via service-bestanden, 13 inline in route-handlers.

---

## Deel 6 — Voorstel: centrale AI-service

### Uitgangspunt

Alle 19 bestaande AI-functionaliteiten blijven **ongewijzigd** in gedrag. Het voorstel gaat over hoe de code georganiseerd is, niet over wat de AI doet.

### Voorgestelde lagenstructuur

```
lib/openai.ts              [Laag 1 — al goed, kleine uitbreidingen]
lib/ai-utils.ts            [Laag 2 — NIEUW, gedeelde hulpfuncties]
services/                  [Laag 3 — uitbreiden met nieuwe service-bestanden]
  ├── document-ai.ts       (bestaand)
  ├── email-ai.ts          (bestaand)
  ├── gebouw-ai.ts         (bestaand)
  ├── spot-ai.ts           (bestaand)
  ├── opleiding-ai.ts      (bestaand)
  ├── factuur-ai.ts        (NIEUW — haal uit facturen.ts)
  ├── veiligheid-ai.ts     (NIEUW — haal uit veiligheid.ts)
  ├── calculatie-ai.ts     (NIEUW — haal uit mod-calculatie.ts + opdrachten.ts)
  ├── inkoop-ai.ts          (NIEUW — haal uit werkvoorbereiding.ts)
  ├── upload-ai.ts          (NIEUW — haal uit slim-upload.ts)
  ├── crm-ai.ts             (NIEUW — haal uit crm.ts + scoutService)
  └── salaris-ai.ts         (NIEUW — haal uit salaris-mutaties.ts)
routes/ai.ts               [Laag 4 — uitbreiden /ai/ namespace]
  ├── POST /ai/gebouw-extractie       (bestaand)
  ├── POST /ai/document-analyse       (bestaand)
  ├── POST /ai/spot-herkenning        (bestaand)
  ├── POST /ai/opleidingen-voorstel   (bestaand)
  ├── POST /ai/centraal-invullen      (bestaand)
  ├── POST /ai/factuur-uitlezen       (NIEUW — was /facturen/:id/ai-uitlezen)
  ├── POST /ai/veiligheid-analyse     (NIEUW — was /veiligheid/toolboxen/:id/ai-analyse)
  ├── POST /ai/calculatie-chat        (NIEUW — was /modules/calculaties/:id/ai-chat)
  ├── POST /ai/inkoop-planning        (NIEUW — was inline in werkvoorbereiding)
  └── POST /ai/crm-coach              (NIEUW — was /crm/ai-coach)
lib/ai-model-registry.ts   [Laag 5 — NIEUW, modelregister]
```

---

### Laag 1 — `lib/openai.ts` (kleine uitbreidingen)

Huidige toestand is goed. Toevoegen zonder bestaand te wijzigen:

```
Toevoegen:
- AI_MODELLEN constante (zie Laag 5)
- Singleton client-instantie (één object, niet per aanroep nieuw)
- logAiAanroep(functienaam, model, tokenVerbruik, duurMs) → req.log
```

---

### Laag 2 — `lib/ai-utils.ts` (NIEUW)

Eén bestand dat alle herhaalde patronen centraliseert:

| Functie | Vervangt | Wat het doet |
|---|---|---|
| `parseerAiJson<T>(raw: string): T` | 10+ regex-varianten | Strikt markdown-strip + JSON.parse + type-cast |
| `bereidVisionAfbeelding(url: string): ContentPart` | 3x handmatige constructie | Bouwt `ChatCompletionContentPart` voor vision |
| `bouwVisionBerichten(prompt, urls): Messages` | Herhaald patroon | Bouwt volledig vision-berichtenarray |
| `heeftAiOfGooi(): void` | Wisselende guards | Gooit 503 als `heeftOpenAi()` false is |

---

### Laag 3 — service-bestanden (uitbreiden)

De vijf bestaande service-bestanden blijven ongewijzigd. Nieuwe service-bestanden worden aangemaakt voor inline AI-logica die nu in route-handlers zit:

| Nieuw service-bestand | Logica verplaatsen uit | Bevat |
|---|---|---|
| `services/factuur-ai.ts` | `routes/facturen.ts` | Invoice OCR (kvk, btw, iban, totaal) |
| `services/veiligheid-ai.ts` | `routes/veiligheid.ts` | Toolbox-samenvatting, LMRA-analyse, incident-classificatie |
| `services/calculatie-ai.ts` | `routes/mod-calculatie.ts`, `routes/opdrachten.ts` | AI-regels voorstel, AI-chat (gedeeld patroon voor 2 modules) |
| `services/inkoop-ai.ts` | `routes/werkvoorbereiding.ts` | Inkoopplanning, bon-groepering per leverancier, uitvoeringsplanning |
| `services/upload-ai.ts` | `routes/slim-upload.ts` | Bestandsclassificatie + vision-contentbouw (inclusief exporteren van `bereidVisionAfbeeldingVoor`) |
| `services/crm-ai.ts` | `routes/crm.ts`, `lib/scoutService.ts` | CRM-coach, marktscout (scout behoudt dagelijkse-cron-registratie in index.ts) |
| `services/salaris-ai.ts` | `routes/salaris-mutaties.ts` | Salaris-mutatieverwerking |

---

### Laag 4 — AI-gateway routes (uitbreiden)

De bestaande `/ai/`-namespace uitbreiden zodat alle AI bereikbaar is via één prefix. Module-interne routes die louter AI-logica bevatten, verhuizen naar `/api/ai/*`.

**Aandachtspunt:** module-specifieke AI-routes die sterke toegang tot module-data nodig hebben (bijv. `/fakturen/:id/ai-uitlezen` dat de factuur uit de DB leest) kunnen beter in de module-route blijven, maar de AI-logica zelf wordt verplaatst naar het service-bestand. De URL-structuur is daarmee secundair; de primaire winst is de service-laagscheiding.

---

### Laag 5 — `lib/ai-model-registry.ts` (NIEUW)

Centraal modelregister zodat modelwijzigingen op één plek plaatsvinden:

```
AI_MODELLEN = {
  standaard:  "gpt-5"        // tekst-extractie, documentanalyse
  vision:     "gpt-5"        // vision-taken (foto-analyse)
  chat:       "gpt-5.4"      // interactieve chat (grotere redeneerruimte)
  licht:      "gpt-4o-mini"  // hoog volume, lage inzet (scout, classificatie)
  compat:     "gpt-4o"       // tijdelijk: routes die gpt-4o nodig hebben
}
```

Wanneer een model wordt vervangen, wordt alleen dit bestand bijgewerkt.

---

### Aanvullende correcties buiten de lagenstructuur

**`CrmCoachPanel` — raw fetch vervangen:**  
De directe `fetch("/api/crm/ai-coach")` vervangen door een gegenereerde React Query-hook. Dit levert: TypeScript-typering, caching (geen dubbele aanroep bij schermwissel), en OpenAPI-contract-conformiteit.

**`scoutService.ts` verplaatsen:**  
Van `lib/scoutService.ts` naar `services/crm-ai.ts` (met behoud van de cron-registratie in `index.ts`). Het is een AI-service, geen algemene lib.

---

## Deel 7 — Implementatievolgorde (wanneer gebouwd)

Het voorstel is in stappen implementeerbaar; elke stap is afzonderlijk terugrolbaar:

| Stap | Wat | Risico | Winst |
|---|---|---|---|
| A | `lib/ai-utils.ts` aanmaken met `parseerAiJson`, `bereidVisionAfbeelding`, `heeftAiOfGooi` | Laag (nieuwe code, niets wijzigt) | Fundament voor alle vervolgstappen |
| B | `lib/ai-model-registry.ts` aanmaken, bestaande services bijwerken naar registry | Laag | Consistent modelgebruik |
| C | `services/veiligheid-ai.ts` — grootste dupe-probleem (4+ JSON-strips in één bestand) | Laag | Meeste winst per effort |
| D | `services/calculatie-ai.ts` — chat-patroon dedupliceren (mod-calculatie + opdrachten) | Laag | Één chat-implementatie |
| E | `services/upload-ai.ts` — exporteer `bereidVisionAfbeeldingVoor` als gedeelde util | Laag | Vision-deduplicatie |
| F | `services/factuur-ai.ts`, `services/inkoop-ai.ts`, `services/salaris-ai.ts` | Laag | Resterende inline-logica |
| G | `CrmCoachPanel` omzetten naar gegenereerde hook | Laag-middel | TypeScript-safety + caching |
| H | `scoutService.ts` → `services/crm-ai.ts` | Laag | Consistente ligging |

**Niet in scope van dit voorstel** (bewust geparkeerd):
- Streaming AI-responses via websockets of SSE
- AI-logging dashboard
- Promptversie-beheer
- Mobiele AI-functies (FPS Monteur)

---

*Analyse gebaseerd op: `artifacts/api-server/src/lib/`, `artifacts/api-server/src/services/`, `artifacts/api-server/src/routes/`, `artifacts/firevault/src/components/`, `artifacts/firevault/src/pages/`. Geen code gewijzigd.*
