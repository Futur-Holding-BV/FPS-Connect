# AI Logboek — Ontwerp FPS Connect

**Status:** ontwerp, geen code gewijzigd  
**Datum:** 2026-07-02  
**Scope:** Volledig AI-logboek voor alle AI-acties in Connect. Elke actie is volledig herleidbaar — van prompt tot gebruikersbevestiging tot vervolgactie. Inclusief schermontwerp.

---

## Het probleem dat dit oplost

Connect heeft op dit moment geen centraal AI-logboek. Acties worden niet bewaard:

- 6 AI-services (document-ai, spot-ai, gebouw-ai, email-ai, opleiding-ai, werkInboxGraph)
- 30+ routes die OpenAI direct aanroepen
- Modellen: gpt-5, gpt-5-mini
- Geen token-tellingen, geen kostenoverzicht, geen audittrail

Enkele routes slaan een partial logboek op als JSON in een databasekolom (`aiLogboekJson`). Dat is een noodoplossing, geen architectuur.

**Wat er ontbreekt:** als een AI-voorstel later wordt betwist — juridisch, technisch of door een klant — is er nu geen antwoord op "wat heeft de AI precies voorgesteld, op basis van welke documenten, en wat heeft de gebruiker ermee gedaan?"

---

## Ontwerpdoelen

1. **Volledig herleidbaar** — elke AI-actie is achteraf reconstrueerbaar: context, model, input-samenvatting, output, menselijke beslissing
2. **Niet-blokkerend** — logging schrijft asynchroon; een logging-fout onderbreekt de AI-flow niet
3. **Privacybewust** — prompttekst wordt niet integraal opgeslagen (AVG); in plaats daarvan: samenvatting + hash
4. **Kosten-inzichtelijk** — per module, per gebruiker, per periode
5. **Centraal** — één tabel, één UI, alle modules

---

## Inventory van AI-acties in Connect

De volgende AI-acties worden gelogd. De kolom "Module" correspondeert met de `module`-waarde in de logboektabel.

| Module | Functie | Trigger | AI-model |
|---|---|---|---|
| document-ai | Metadata-extractie uit PDF | Upload bibliotheek-document | gpt-5-mini |
| document-ai | Toepassing-suggesties | Spot koppelen aan toepassing | Regel-gebaseerd + score |
| spot-ai | Spot-herkenning (foto) | Foto-upload bij spot-aanmaak | gpt-5 |
| spot-ai | Spot-validatie bibliotheek | Spot-afwijking controleren | gpt-5-mini |
| gebouw-ai | Gebouw-analyse (beeld + tekst) | Gebouw invullen via AI | gpt-5 |
| gebouw-ai | Tekening-analyse | Plattegrond-PDF analyseren | gpt-5-mini |
| gebouw-ai | Gebouw-samenvatting | Samenvatting genereren/bewerken | gpt-5-mini |
| email-ai | E-mail-parsing | E-mail ontvangen in inbox | gpt-5-mini |
| email-ai | Project-samenvatting genereren | E-mail → project-voorstel | gpt-5-mini |
| email-ai | E-mail-inzicht extraheren | Actiepunten + contacten | gpt-5-mini |
| opleiding-ai | Opleidingen voorstellen | Functie gekoppeld/aangemaakt | gpt-5 |
| crm-ai | CRM-coaching | CRM-klantkaart geopend | gpt-5-mini |
| offerte-ai | Sectie schrijven | "Schrijf sectie" knop | gpt-5-mini |
| contract-ai | Contract-analyse | Contract geüpload | gpt-5-mini |
| werkvoorbereiding-ai | Inkoopplanning genereren | Werkbon aangemaakt | gpt-5-mini |
| werkvoorbereiding-ai | Inkoopbon-suggesties | Inkoop-tab geopend | gpt-5-mini |
| werkvoorbereiding-ai | Uitvoeringsplanning genereren | Werkbon aangemaakt | gpt-5-mini |
| gereedschap-ai | Gereedschap-analyse | Gereedschap toegevoegd | gpt-5-mini |
| toolbox-ai | Vragen genereren uit PDF | Toolbox aangemaakt | gpt-5-mini |
| slim-upload | Document classificatie | Slim upload gestart | gpt-5-mini |

---

## Datamodel

### Tabel `ai_logboek`

```sql
CREATE TABLE ai_logboek (
  -- Identiteit
  id                       SERIAL PRIMARY KEY,
  tijdstip                 TIMESTAMP NOT NULL DEFAULT NOW(),
  duur_ms                  INTEGER,                         -- duur van de AI-aanroep in ms

  -- Wie
  gebruiker_id             INTEGER REFERENCES gebruikers(id) ON DELETE SET NULL,
  gebruiker_naam           TEXT NOT NULL,                   -- gedenormaliseerd
  sessie_hash              TEXT,                            -- hash van sessie-ID (niet de ID zelf)

  -- Context: welke entiteiten waren betrokken
  gebouw_id                INTEGER REFERENCES gebouwen(id) ON DELETE SET NULL,
  gebouw_naam              TEXT,                            -- gedenormaliseerd
  project_id               INTEGER,                         -- losse integer, geen FK (projecten zijn dossiers/offertes)
  document_id              INTEGER REFERENCES documenten(id) ON DELETE SET NULL,
  document_naam            TEXT,                            -- gedenormaliseerd
  voorziening_id           INTEGER REFERENCES voorzieningen(id) ON DELETE SET NULL,

  -- Welke AI-actie
  module                   TEXT NOT NULL,                   -- zie inventory hierboven
  functie                  TEXT NOT NULL,                   -- camelCase naam van de service-functie
  beschrijving             TEXT NOT NULL,                   -- leesbare omschrijving voor UI

  -- Model & kosten
  model                    TEXT NOT NULL,                   -- bijv. "gpt-5-mini", "gpt-5"
  prompt_tokens            INTEGER,
  completion_tokens        INTEGER,
  total_tokens             INTEGER,
  kosten_eurocent          INTEGER,                         -- berekend: zie prijstabel hieronder

  -- Input/Output (privacybewust)
  prompt_samenvatting      TEXT,                            -- leesbare samenvatting van de prompt (<500 tekens)
  prompt_hash              TEXT,                            -- SHA-256 van de volledige prompt
  antwoord_samenvatting    TEXT,                            -- leesbare samenvatting van het antwoord (<1000 tekens)

  -- Betrouwbaarheid
  betrouwbaarheid          TEXT,                            -- "laag" | "midden" | "hoog" | null

  -- Bronmateriaal dat de AI gebruikte
  gebruikte_documenten     JSONB NOT NULL DEFAULT '[]',     -- [{id, naam, revisie_nummer}]
  gebruikte_kennisobjecten JSONB NOT NULL DEFAULT '[]',     -- [{type, id, naam}]

  -- Wat de AI heeft voorgesteld
  actie_voorgesteld        TEXT,                            -- leesbare samenvatting van het voorstel

  -- Menselijke beslissing
  actie_gekozen            TEXT,                            -- "bevestigd" | "gecorrigeerd" | "afgewezen" | null (nog open)
  bevestigd_door_id        INTEGER REFERENCES gebruikers(id) ON DELETE SET NULL,
  bevestigd_op             TIMESTAMP,
  correctie_omschrijving   TEXT,                            -- gevuld als actie_gekozen = "gecorrigeerd"

  -- Gevolg
  vervolgactie             TEXT,                            -- bijv. "spot_aangemaakt", "document_goedgekeurd", "geen_actie"
  vervolgactie_entiteit_id INTEGER,                         -- ID van het resulterende object

  -- Status
  status                   TEXT NOT NULL DEFAULT 'geslaagd', -- "geslaagd" | "mislukt" | "timeout" | "geannuleerd"
  foutmelding              TEXT                             -- gevuld als status = "mislukt"
);

CREATE INDEX ai_logboek_tijdstip_idx ON ai_logboek (tijdstip DESC);
CREATE INDEX ai_logboek_gebruiker_idx ON ai_logboek (gebruiker_id);
CREATE INDEX ai_logboek_module_idx ON ai_logboek (module);
CREATE INDEX ai_logboek_gebouw_idx ON ai_logboek (gebouw_id);
CREATE INDEX ai_logboek_status_idx ON ai_logboek (status);
```

### Velden per vereiste uit de opdracht

| Vereiste | Veld(en) |
|---|---|
| Gebruiker | `gebruiker_id`, `gebruiker_naam` |
| AI-assistent | `module`, `functie`, `beschrijving` |
| Project | `project_id` (flexibel: dossier-id of offerte-id) |
| Gebouw | `gebouw_id`, `gebouw_naam` |
| Document | `document_id`, `document_naam` |
| Prompt | `prompt_samenvatting` + `prompt_hash` (privacybewust) |
| Antwoord | `antwoord_samenvatting` |
| Confidence | `betrouwbaarheid` |
| Gekozen actie | `actie_gekozen` |
| Gebruiker bevestiging | `bevestigd_door_id`, `bevestigd_op` |
| Vervolgactie | `vervolgactie`, `vervolgactie_entiteit_id` |
| Gebruikte documenten | `gebruikte_documenten` (JSONB) |
| Gebruikte kennisobjecten | `gebruikte_kennisobjecten` (JSONB) |
| Gebruikte modellen | `model` |
| Kosten | `kosten_eurocent` |
| Tokens | `prompt_tokens`, `completion_tokens`, `total_tokens` |
| Duur | `duur_ms` |

---

## Privacyontwerp

### Wat niet wordt opgeslagen

De volledige prompttekst wordt niet bewaard. Redenen:

- E-mails die worden geanalyseerd kunnen persoonsgegevens bevatten (naam, adres, telefoonnummer)
- Contracten en loonstroken bevatten AVG-gevoelige informatie
- Gebouw-foto's bevatten mogelijk gezichten (Street View)

### Wat wel wordt opgeslagen

- `prompt_samenvatting`: leesbare omschrijving van wat er werd gevraagd, maximaal 500 tekens, handmatig opgesteld door de logging-code (niet door AI). Geen persoonsgegevens.
  - Voorbeeld: "Spot-herkenning op foto van doorvoering, gebouw Amsterdam Noord, verdieping 2"
  - Voorbeeld: "E-mail-analyse: onderwerp 'Offerte branddoorvoeren', 3 bijlagen"

- `prompt_hash`: SHA-256 van de exacte prompt. Dient alleen voor technische verificatie ("was de prompt identiek aan eerdere runs?"). Niet omkeerbaar.

- `antwoord_samenvatting`: samenvatting van wat de AI heeft voorgesteld, maximaal 1000 tekens.
  - Voorbeeld: "Voorstel: Toepassing 'Mulcol Slim ø63 EI120 wand', betrouwbaarheid hoog, alternatief: Hilti CFS-C"

### Bewaarperiode

| Categorie | Bewaarperiode | Reden |
|---|---|---|
| Operationele logs (gebouw-analyse, offerte-sectie) | 2 jaar | Normale bedrijfsvoering |
| Compliance-kritische logs (spot-herkenning, document-validatie) | 7 jaar | Brandveiligheidsregelgeving |
| HRM-gerelateerde logs (contract-analyse, opleiding-voorstel) | 7 jaar na dienstverband | AVG art. 5 lid 1 sub e |
| Mislukte aanroepen | 1 jaar | Technisch debuggen |

Bewaarperiode wordt bepaald door de `module`-waarde. Een nachtelijk opschoonscript zet de `status` van vervallen logs op `gearchiveerd` en wist `prompt_samenvatting` en `antwoord_samenvatting` (de hash blijft bewaard).

---

## Kostencalculatie

Kosten worden berekend op het moment van logging, op basis van tokengebruik en modelprijs. De prijstabel is configureerbaar (tabel `ai_model_prijzen`).

### Referentieprijzen (indicatief, 2026)

| Model | Input $/1M tokens | Output $/1M tokens |
|---|---|---|
| gpt-5-mini | $0.15 | $0.60 |
| gpt-5 | $5.00 | $20.00 |

Omrekening: `kosten_eurocent = ROUND((prompt_tokens * input_prijs + completion_tokens * output_prijs) / 1_000_000 * wisselkoers * 100)`

De wisselkoers wordt dagelijks bijgewerkt. Historische logs behouden de kosten op het moment van berekening.

### Kostenrapportage-queries (voorbeelden)

```sql
-- Kosten per module deze maand
SELECT module, SUM(kosten_eurocent) / 100.0 AS euro
FROM ai_logboek
WHERE tijdstip >= date_trunc('month', NOW())
GROUP BY module ORDER BY euro DESC;

-- Kosten per gebruiker, afgelopen 30 dagen
SELECT gebruiker_naam, COUNT(*) AS aanroepen, SUM(kosten_eurocent) / 100.0 AS euro
FROM ai_logboek
WHERE tijdstip >= NOW() - INTERVAL '30 days'
GROUP BY gebruiker_naam ORDER BY euro DESC;

-- Bevestigingspercentage per module
SELECT module,
  COUNT(*) FILTER (WHERE actie_gekozen = 'bevestigd') * 100.0 / COUNT(*) AS pct_bevestigd,
  COUNT(*) FILTER (WHERE actie_gekozen = 'afgewezen') * 100.0 / COUNT(*) AS pct_afgewezen
FROM ai_logboek
WHERE actie_gekozen IS NOT NULL
GROUP BY module;
```

---

## Logboek-service (architectuur)

De logging wordt geïmplementeerd als een centrale service `services/ai-logboek.ts` die door alle AI-services wordt aangeroepen. De flow is altijd hetzelfde:

```
AI-service aanroep (bijv. analyseerSpot)
  │
  1. Start logregel: tijdstip = NOW(), status = 'geslaagd'
  │
  2. Roep OpenAI aan
  │
  3. Ontvang response (usage.prompt_tokens, usage.completion_tokens)
  │
  4. Bereken kosten
  │
  5. Schrijf logregel (asynchroon, niet-blokkerend)
  │      bij fout: logger.error() — NIET naar gebruiker propageren
  │
  6. Retourneer resultaat aan de route-handler
```

De logging-aanroep heeft de vorm:

```typescript
await logAiActie({
  // Context
  gebruikerId:    req.session.gebruikerId,
  gebouwId:       gebouw?.id ?? null,
  documentId:     document?.id ?? null,
  voorzieningId:  voorziening?.id ?? null,

  // Functie
  module:         "spot-ai",
  functie:        "analyseerSpot",
  beschrijving:   `Spot-herkenning op foto, gebouw ${gebouw.naam}`,

  // Model & tokens (uit OpenAI response.usage)
  model:          response.model,
  promptTokens:   response.usage.prompt_tokens,
  completionTokens: response.usage.completion_tokens,

  // Input/output (door de aanroepende code opgesteld)
  promptSamenvatting: `Spot type ${type}, wand ${wandOfPlafond}, verdieping ${verdieping}`,
  promptHash:     sha256(volledigPromptString),
  antwoordSamenvatting: `Voorstel: ${voorstel.toepassing_naam}, betrouwbaarheid ${voorstel.betrouwbaarheid}`,

  // Betrouwbaarheid
  betrouwbaarheid: voorstel.betrouwbaarheid,

  // Bronnen
  gebruikteDocumenten: gebruikteDocIds.map(id => ({ id, naam: ..., revisieNummer: ... })),
  gebruikteKennisobjecten: [],

  // Voorstel
  actieVoorgesteld: `Toepassing ${voorstel.toepassing_naam} koppelen aan spot`,

  // Timing
  duurMs: Date.now() - startTijd,
  status: "geslaagd",
});
```

De bevestiging door de gebruiker wordt later geschreven via een aparte update-aanroep:

```typescript
await bevestigAiActie({
  logId:                  logboekId,
  actieGekozen:           "bevestigd",         // of "gecorrigeerd" | "afgewezen"
  bevestigdDoorId:        req.session.gebruikerId,
  correctieOmschrijving:  null,
  vervolgactie:           "spot_toepassing_gekoppeld",
  vervolgactieEntiteitId: spot.id,
});
```

---

## Schermontwerp — AI Logboek

Het AI Logboek is een beheerdersfunctie en wordt toegevoegd onder **Beheer > AI Logboek** (bevoegdheid: `systeem` niveau 1 voor lezen, niveau 2 voor exporteren).

---

### Pagina-structuur

```
╔══════════════════════════════════════════════════════════════════════════════════╗
║  FPS Connect                              [zoekbalk]        Rene Dekker  [menu] ║
╠══════════════════════════════════════════════════════════════════════════════════╣
║  Beheer >  AI Logboek                                                           ║
╚══════════════════════════════════════════════════════════════════════════════════╝

┌─ Statistieken (deze maand) ────────────────────────────────────────────────────┐
│                                                                                 │
│  Totale kosten     Aanroepen       Slagingspercentage   Gem. duur               │
│  € 12,40          1.847           97,3 %               1,2 s                   │
│                                                                                 │
│  Duurste module: spot-ai  € 5,20  |  Meest gebruikt: document-ai  643×          │
│                                                                                 │
│  [Vorige maand: € 9,80  ▲ +27%]                                                │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─ Filters ──────────────────────────────────────────────────────────────────────┐
│  Module      [Alle  v]    Status    [Alle  v]    Betrouwbaarheid  [Alle  v]    │
│  Gebruiker   [Alle  v]    Gebouw    [Alle  v]    Model           [Alle  v]     │
│  Periode     [01-07-2026]  t/m  [02-07-2026]                    [Toepassen]   │
│                                                          [Exporteer CSV]       │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─ Logboek ──────────────────────────────────────────────────────────────────────┐
│  Tijdstip          Gebruiker    Module          Beschrijving                   │
│  Model             Tokens       Kosten          Betrouwb.  Actie   Status  Duur│
│ ─────────────────────────────────────────────────────────────────────────────  │
│                                                                                 │
│  02-07 14:31:07    R. Dekker    spot-ai         Spot-herkenning branddeur A302  │
│  gpt-5             3.204 tok    € 0,03          Hoog       Bevestigd  OK  1,1s  │
│  [>]                                                                            │
│ ─────────────────────────────────────────────────────────────────────────────  │
│  02-07 14:29:44    M. Jansen    document-ai     Metadata uit ETA Mulcol Slim    │
│  gpt-5-mini        1.847 tok    € 0,001         Hoog       Bevestigd  OK  0,8s  │
│  [>]                                                                            │
│ ─────────────────────────────────────────────────────────────────────────────  │
│  02-07 14:28:11    R. Dekker    gebouw-ai       Gebouw-analyse Piet Heinstr 12  │
│  gpt-5             5.102 tok    € 0,05          Midden     Open       OK  2,3s  │
│  [>]                                                                            │
│ ─────────────────────────────────────────────────────────────────────────────  │
│  02-07 14:15:03    Systeem      email-ai        E-mail Vanderveen Bouw verwerkt │
│  gpt-5-mini        2.341 tok    € 0,002         —          Bevestigd  OK  1,0s  │
│  [>]                                                                            │
│ ─────────────────────────────────────────────────────────────────────────────  │
│  02-07 13:44:59    M. Jansen    spot-ai         Spot-herkenning doorvoering B04 │
│  gpt-5             3.891 tok    € 0,04          Laag       Gecorrigeerd  OK  1,4s│
│  [>]                                                                            │
│ ─────────────────────────────────────────────────────────────────────────────  │
│  02-07 13:12:07    K. Bakker    werkvoorbereiding Inkoopplanning werkbon #2041  │
│  gpt-5-mini        4.210 tok    € 0,003         —          Bevestigd  OK  1,7s  │
│  [>]                                                                            │
│                                                                                 │
│  ← Vorige  Pagina 1 van 48  Volgende →                    Rijen per pagina: 25 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

### Detail-panel (slide-in bij klik op [>])

Het detail-panel schuift in van rechts en toont de volledige logregel.

```
╔══════════════════════════════════════════════════════╗
║  AI-actie detail                            [Sluiten]║
╠══════════════════════════════════════════════════════╣
║                                                      ║
║  Spot-herkenning branddeur A302                      ║
║  02-07-2026 om 14:31:07 — 1,1 seconden               ║
║                                                      ║
║  ─── Context ─────────────────────────────────────── ║
║  Gebruiker     R. Dekker                             ║
║  Module        spot-ai / analyseerSpot               ║
║  Gebouw        Piet Heinstraat 12, Amsterdam          ║
║  Verdieping    2e verdieping                         ║
║  Spot          A302 (doorvoering)                    ║
║                                                      ║
║  ─── Model & Kosten ──────────────────────────────── ║
║  Model         gpt-5                                 ║
║  Prompt        2.541 tokens                          ║
║  Antwoord        663 tokens                          ║
║  Totaal        3.204 tokens                          ║
║  Kosten        € 0,0264 (berekend op 02-07-2026)     ║
║  Duur          1.143 ms                              ║
║                                                      ║
║  ─── Wat de AI heeft gedaan ──────────────────────── ║
║  Prompt        Spot-herkenning op foto van een       ║
║                branddoor op verdieping 2, gebouw     ║
║                Piet Heinstr. 12. Type: branddeur,    ║
║                wand, 3 foto's meegestuurd.           ║
║                                                      ║
║  Antwoord      Voorstel: Toepassing 'Hilti CF-B      ║
║                FP', betrouwbaarheid hoog.            ║
║                Alternatief: 'Rockwool BlazeSeal'.    ║
║                Afwijking: geen.                      ║
║                                                      ║
║  Betrouwbaarheid  [Hoog]                             ║
║                                                      ║
║  ─── Gebruikte bronnen ───────────────────────────── ║
║  Documenten    Testrapport Hilti CF-B FP rev. 2      ║
║                ETA-11/0483 Hilti CF-B FP             ║
║                                                      ║
║  Kennisobjecten  Product: Hilti CF-B FP              ║
║                  Norm: EN 13501-2                    ║
║                  Prestatie: EI 60, wand, rigide      ║
║                                                      ║
║  ─── Beslissing ──────────────────────────────────── ║
║  Voorstel      Toepassing CF-B FP koppelen aan A302  ║
║                                                      ║
║  Actie         [Bevestigd]                           ║
║  Door          R. Dekker                             ║
║  Op            02-07-2026 om 14:31:44 (37 seconden   ║
║                na het voorstel)                      ║
║                                                      ║
║  Vervolgactie  Toepassing gekoppeld aan spot A302    ║
║  Object-ID     Spot #4821                            ║
║                                                      ║
║  ─── Status ──────────────────────────────────────── ║
║  Status        [Geslaagd]                            ║
║                                                      ║
║  Prompt-hash   a3f9b2...c741 (SHA-256)               ║
╚══════════════════════════════════════════════════════╝
```

---

### Kostengrafiek (tab op de statistiekenpagina)

```
┌─ Kosten per module — juli 2026 ─────────────────────┐
│                                                      │
│  spot-ai          ██████████████████████  € 5,20    │
│  gebouw-ai        ████████████            € 3,10    │
│  offerte-ai       ████████                € 2,00    │
│  document-ai      ████                   € 1,10    │
│  email-ai         ██                     € 0,60    │
│  werkvoorbereiding █                     € 0,30    │
│  opleiding-ai     █                      € 0,10    │
│  overig                                  € 0,00    │
│                                   Totaal  € 12,40  │
└──────────────────────────────────────────────────────┘

┌─ Bevestigingsratio per module ──────────────────────┐
│                                                      │
│              Bevestigd   Gecorrigeerd   Afgewezen    │
│  spot-ai         87 %        10 %           3 %     │
│  document-ai     94 %         5 %           1 %     │
│  gebouw-ai       78 %        18 %           4 %     │
│  opleiding-ai    82 %        12 %           6 %     │
│  offerte-ai      91 %         7 %           2 %     │
└──────────────────────────────────────────────────────┘
```

De bevestigingsratio is de centrale kwaliteitsmeting van de AI. Een hoge "gecorrigeerd"-ratio voor een specifieke module signaleert dat het model of de prompt verbeterd moet worden.

---

### Exportformaat (CSV)

Bij export via de knop "Exporteer CSV" worden de volgende kolommen geëxporteerd:

```
tijdstip, gebruiker_naam, module, functie, beschrijving, gebouw_naam,
model, prompt_tokens, completion_tokens, total_tokens, kosten_eurocent,
betrouwbaarheid, actie_gekozen, bevestigd_op, vervolgactie, status, duur_ms
```

Niet geëxporteerd (privacybescherming): `prompt_samenvatting`, `antwoord_samenvatting`, `prompt_hash`, `gebruiker_id`, `sessie_hash`.

Export vereist bevoegdheid `systeem` niveau 2.

---

## Navigatiestructuur

```
Beheer
  ├── Documentopmaak
  ├── Rollen & rechten
  ├── Gebruikers
  ├── AI Logboek          ← nieuw
  │     ├── Overzicht (tabel met filters)
  │     ├── Kosten (grafiek + maandrapport)
  │     └── Kwaliteit (bevestigingsratio's per module)
  └── Systeem
```

De badge "AI Logboek" in de navigatie toont het aantal open AI-acties (status = null / nog niet bevestigd) als er meer dan 0 zijn.

---

## Implementatievolgorde (wanneer gebouwd)

1. **`ai_logboek`-tabel** aanmaken via ALTER TABLE (niet via drizzle push vanwege TTY)
2. **`services/ai-logboek.ts`** — centrale `logAiActie()` en `bevestigAiActie()` functies
3. **Integratie in services** — `document-ai.ts` en `spot-ai.ts` als eerste (hoogste volume)
4. **API-routes** — `GET /ai-logboek`, `GET /ai-logboek/:id`, `PATCH /ai-logboek/:id/bevestiging`
5. **Codegen** uitvoeren
6. **Frontend** — pagina `beheer/ai-logboek.tsx` met statistieken, tabel, detail-panel
7. **Kostengrafiek** — aparte tab
8. **Overige services** integreren

Stap 1–4 zijn backend-only en kunnen als los increment worden geleverd en beoordeeld.
