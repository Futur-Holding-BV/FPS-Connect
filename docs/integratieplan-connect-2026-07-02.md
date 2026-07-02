# Integraal verbeterplan FPS Connect

**Status:** plan, geen code gewijzigd  
**Datum:** 2026-07-02  
**Gebaseerd op:**
- `docs/workflowanalyse-2026-07-02.md` (module-integratieaudit, 12 werkprocesstappen)
- `docs/ai-architectuur-analyse-2026-07-02.md` (technische AI-audit, 19 functies)
- `docs/grote-bestanden-splitsingsvoorstel-2026-07-02.md` (technische code-audit, 7 bestanden)

---

## Uitgangspunten

- **Geen nieuwe functionaliteit.** Alle 20 stappen verbeteren bestaande modules zonder nieuwe gebruikersfuncties toe te voegen.
- **Elke stap is zelfstandig uitvoerbaar en testbaar.** Een stap levert een werkend systeem op dat los van de volgende stap kan worden beoordeeld en teruggerold.
- **Afhankelijkheden zijn expliciet.** Stappen met een blokkerende voorganger mogen pas starten nadat de voorganger is afgerond en gevalideerd.
- **Parallellisatie is gemarkeerd.** Onafhankelijke stappen kunnen tegelijk worden uitgevoerd.

---

## Prioriteits-diagnose

### Wat het hoogste risico heeft (nu)

**1. `hrm.ts` — 4 164 regels, 15 domeinen in één bestand.**  
Eén syntaxfout, een verkeerd geïmporteerde tabel of een foutieve middleware-aanroep breekt de volledige HRM-module: werkgevers, functies, opleidingen, medewerkers, verlof, ziekmeldingen, offboarding, capaciteit en ZZP-overeenkomsten tegelijk. Dit is het grootste structurele risico in de codebase.

**2. JSON-strip duplicaat in AI-routes — 10+ varianten.**  
Elke variant heeft subtiel andere edge-cases (trailing newlines, mixed case). Een bug in de OpenAI-respons-format raakt nu willekeurig sommige routes wel en andere niet. Niet reproduceerbaar, moeilijk te debuggen.

**3. `plattegrond.tsx` en `print.tsx` dupliceren dezelfde constanten.**  
Een kleurwijziging of label-aanpassing moet op twee plekken worden doorgevoerd. Als dit wordt vergeten, toont de plattegrond andere kleuren dan het rapport — een visuele inconsistentie die moeilijk te traceren is.

### Wat het laagste risico heeft (kan wachten)

**1. `personeel/index.tsx` opsplitsen.**  
De cross-tab state (onboard-flow) maakt opsplitsen complexer dan de andere bestanden. De huidige toestand is suboptimaal maar stabiel.

**2. `offertes.ts` opsplitsen.**  
De Express-routevolgorde (analytics vóór :id) maakt dit een zorgvuldigere split. De module werkt correct; het risico van opsplitsen is hier hoger dan de winst op korte termijn.

**3. `services/crm-ai.ts` + `services/salaris-ai.ts` aanmaken.**  
De inline AI-logica in crm.ts en salaris-mutaties.ts is beperkt in omvang en raakt geen gedeeld patroon. Kan wachten tot na de grotere deduplicatie-stappen.

---

## Modules die eerst af moeten

Deze modules zijn een blokkade voor de rest of hebben het hoogste foutrisico:

| Module | Reden |
|---|---|
| `lib/ai-utils.ts` | Fundament voor alle AI-verbeteringen; zonder dit zijn stap 3–6 niet consistent uitvoerbaar |
| `hrm-verlof.ts` (eerste split van hrm.ts) | Grootste risico-concentratie; verlof is het meest complex domein in hrm.ts (jaarafsluiting, saldocorrectie) |
| `plattegrond-constanten.ts` | Deblokkeert zowel de plattegrond-split als de print-split; beide wachten hierop |
| `veiligheid-toolboxen.ts` | Toolboxen heeft de meeste AI-aanroepen en de meeste gedupliceerde JSON-strips in veiligheid.ts |

## Modules die later kunnen wachten

| Module | Reden |
|---|---|
| `personeel/index.tsx` tabs | Cross-tab state maakt split riskant; stabiel, geen directe urgentie |
| `offertes.ts` klantcontracten | Klein volume, weinig wijzigingsfrequentie |
| `services/salaris-ai.ts` | Beperkte impact; salaris-mutaties raakt weinig andere modules |
| `lib/ai-model-registry.ts` | Nuttig maar niet urgent; modellen worden nu ook correct gebruikt, alleen niet centraal gedocumenteerd |

---

## Roadmap: 20 ontwikkelstappen

### Fase 1 — AI-fundament (stappen 1–2)

> Blokkeren stap 3–6. Kunnen parallel worden uitgevoerd.

---

**Stap 1 — `lib/ai-utils.ts` aanmaken**

*Parallel met: stap 2*  
*Blokkeert: stap 3, 4, 5*

Aanmaken van drie gedeelde utility-functies die nu 10+ keer los zijn geïmplementeerd:

```
parseerAiJson<T>(raw: string): T
  → Strikt markdown-strip (```json, ```, trailing newlines) + JSON.parse + type-cast
  → Vervangt 10+ eigen regex-varianten in mod-calculatie, veiligheid (4x),
    werk-inbox, hrm, studio (2x), salaris-mutaties, werkvoorbereiding (3x)

bereidVisionAfbeelding(url: string): ChatCompletionContentPart
  → Bouwt vision-content-part; vervangt 3x handmatige constructie
    in pbm.ts, wagenpark-meldingen.ts, slim-upload.ts

heeftAiOfGooi(): void
  → Controleert heeftOpenAi(); gooit 503 indien AI niet beschikbaar
  → Vervangt inconsistente guard in alle AI-routes
```

**Testbaar:** unit-tests voor `parseerAiJson` met markdown-varianten; `bereidVisionAfbeelding` met een voorbeeldURL; `heeftAiOfGooi` met en zonder env-var.

---

**Stap 2 — `lib/ai-model-registry.ts` aanmaken**

*Parallel met: stap 1*  
*Blokkeert: niets direct, maar stap 3–6 kunnen dit optioneel gebruiken*

```
AI_MODELLEN = {
  standaard:  "gpt-5"        // tekst-extractie, documentanalyse
  vision:     "gpt-5"        // vision-taken
  chat:       "gpt-5.4"      // interactieve chat (grote redeneerruimte)
  licht:      "gpt-4o-mini"  // hoog volume, lage inzet
  compat:     "gpt-4o"       // tijdelijk voor routes die gpt-4o verwachten
}
```

Bestaande service-bestanden (`gebouw-ai`, `spot-ai`, `document-ai`, `email-ai`, `opleiding-ai`) worden bijgewerkt om `AI_MODELLEN.standaard` te gebruiken in plaats van de hardcoded string `"gpt-5"`.

**Testbaar:** typecheck slaagt; alle bestaande AI-routes werken ongewijzigd; model-naam is aanpasbaar op één plek.

---

### Fase 2 — AI-deduplicatie (stappen 3–6)

> Stap 3 en 4 kunnen parallel. Stap 5 en 6 kunnen parallel. Beide paren wachten op stap 1.

---

**Stap 3 — `services/veiligheid-ai.ts` aanmaken**

*Wacht op: stap 1*  
*Parallel met: stap 4*

`veiligheid.ts` heeft de meeste gedupliceerde AI-logica (4 JSON-strips met elk andere regex, 3 afzonderlijke AI-functies). Extraheer naar service-bestand:

```
analyseToolbox(tekst: string): ToolboxAnalyseResultaat
  → Gebruikt parseerAiJson() uit ai-utils
analyseerLmra(tekst: string, context: object): LmraVoorstel
analyseerIncident(tekst: string, bijlagen: string[]): IncidentVoorstel
```

Route-handlers in `veiligheid.ts` roepen de service aan; inline AI-logica verdwijnt uit de handlers.

**Testbaar:** alle veiligheid-AI-endpoints geven hetzelfde resultaat als vóór de refactor; typecheck slaagt.

---

**Stap 4 — `services/calculatie-ai.ts` aanmaken**

*Wacht op: stap 1*  
*Parallel met: stap 3*

`mod-calculatie.ts` en `opdrachten.ts` implementeren beide hetzelfde interactieve AI-chat-patroon. Extraheer naar gedeeld service-bestand:

```
voerCalculatieChatUit(berichten: ChatBericht[], context: CalculatieContext): ChatAntwoord
suggereerCalculatieRegels(spots: Spot[], sjabloon?: string): RegelVoorstel[]
```

Beide routes roepen de service aan; het gedupliceerde chat-patroon verdwijnt.

**Testbaar:** AI-chat in calculatie en AI-chat in opdrachten geven hetzelfde responsformaat; typecheck slaagt.

---

**Stap 5 — `services/upload-ai.ts` aanmaken + vision-deduplicatie**

*Wacht op: stap 1*  
*Parallel met: stap 6*

`slim-upload.ts`, `pbm.ts` en `wagenpark-meldingen.ts` bouwen elk handmatig een `ChatCompletionContentPart[]`-array. De al bestaande `bereidVisionAfbeeldingVoor()`-functie in `slim-upload.ts` wordt geëxporteerd als gedeeld hulpmiddel (of verplaatst naar `ai-utils.ts`).

```
classifiseerBestand(bestandsnaam: string, inhoudBase64?: string): BestandsType
  → Verplaatst uit slim-upload.ts naar service-bestand
  → Gebruikt bereidVisionAfbeelding() uit ai-utils
```

**Testbaar:** slim-upload scan-endpoint werkt ongewijzigd; pbm en wagenpark-meldingen gebruiken gedeelde vision-bouw.

---

**Stap 6 — `CrmCoachPanel` omzetten naar gegenereerde API-hook**

*Wacht op: stap 1 (voor heeftAiOfGooi in backend)*  
*Parallel met: stap 5*

`CrmCoachPanel` gebruikt `fetch("/api/crm/ai-coach")` direct. Gevolg: geen TypeScript-typering, geen React Query-caching (elke schermwissel = nieuwe AI-aanroep).

- OpenAPI-spec uitbreiden met `POST /crm/ai-coach` (schema al impliciet aanwezig)
- Codegen uitvoeren → `useAiCoach`-hook gegenereerd
- `CrmCoachPanel` omzetten: `fetch(...)` → `useAiCoach().mutateAsync(...)`
- React Query-caching: dezelfde coaching wordt niet dubbel opgehaald bij schermwissel

**Testbaar:** CRM-coach laadt correct op alle CRM-schermen; TypeScript rapporteert geen ongetypeerde interface meer; netwerkverzoeken zijn gecached (browser DevTools).

---

### Fase 3 — Backend-opsplitsingen (stappen 7–11)

> Stap 7+8+9 (hrm) kunnen parallel met stap 10+11 (veiligheid).  
> Binnen de hrm-reeks: stap 7 eerst, dan 8 en 9 parallel.

---

**Stap 7 — `hrm.ts` → `hrm-verlof.ts`**

*Geen voorganger (onafhankelijk van AI-fase)*  
*Parallel met: stap 10*

Extraheer het verlof-domein (850 regels) als eerste split van hrm.ts:

```
routes/hrm-verlof.ts
  → /verlofsoorten, /verlofsaldi, /verlofaanvragen, /verlofaanvragen/:id/log
  → /feestdagen, /verlof-instellingen, /jaarafsluiting-regels
  → POST /hrm/jaarafsluiting (265-regels handler blijft intact)
  → POST /medewerkers/:id/saldocorrectie
  → GET /verlof/overzicht
```

De jaarafsluiting-handler is de meest complexe functie in hrm.ts. In isolatie is het makkelijker te testen.

**Testbaar:** alle verlof-endpoints werken ongewijzigd; jaarafsluiting-flow is end-to-end testbaar; typecheck slaagt.

---

**Stap 8 — `hrm.ts` → `hrm-functies-opleidingen.ts` + `hrm-mijn.ts`**

*Wacht op: stap 7 (zodat hrm.ts stabieler is voor de volgende split)*  
*Parallel met: stap 9*

```
routes/hrm-functies-opleidingen.ts
  → /functies, /functies/:id, /functies/:id/opleidingen-voorstel
  → /opleidingen, /opleidingen/:id
  → /bekwaamheden, /bekwaamheden/:id
  → /medewerkers/:id/opleidingen, /medewerker-opleidingen/:id
  → /medewerkers/:id/bekwaamheden

routes/hrm-mijn.ts
  → /mijn/certificaten, /mijn/verlofsoorten, /mijn/verlofsaldi
  → /mijn/verlofaanvragen (GET + POST)
  → /mijn/ziekmeldingen (GET + POST)
```

**Testbaar:** opleidingen-voorstel AI werkt; mijn-routes retourneren data voor ingelogde gebruiker; typecheck slaagt.

---

**Stap 9 — `hrm.ts` → `hrm-offboarding.ts` + `hrm-zzp.ts` + `hrm-ziekmeldingen.ts`**

*Wacht op: stap 7*  
*Parallel met: stap 8*

```
routes/hrm-offboarding.ts
  → /medewerkers/:id/offboard-samenvatting
  → /medewerkers/:id/arbeidsgetuigenis-ai
  → /medewerkers/:id/offboard
  → /medewerkers/:id/aanstellingen (volledige CRUD)
  → /medewerkers/:id/ai-contract-analyse
  → /medewerkers/:id/documenten (CRUD)

routes/hrm-zzp.ts
  → /zzp-overeenkomsten (CRUD, AI-vullen)

routes/hrm-ziekmeldingen.ts
  → /ziekmeldingen (CRUD), /ziekmeldingen/statistieken
```

Na stap 7+8+9 bestaat hrm.ts alleen nog uit werkgevers + medewerkers-basis + capaciteit + statistieken (~600 regels). Dit kan daarna optioneel verder worden gesplitst of als-is worden gelaten.

**Testbaar:** offboard-flow werkt end-to-end; ZZP-overeenkomsten CRUD werkt; ziekmeldingen werken; typecheck slaagt.

---

**Stap 10 — `veiligheid.ts` → `veiligheid-toolboxen.ts`**

*Geen voorganger*  
*Parallel met: stap 7*

Het grootste domein in veiligheid.ts (700 regels):

```
routes/veiligheid-toolboxen.ts
  → /veiligheid/toolboxen (CRUD, publiceren, afronden, koppeling-suggestie)
  → /veiligheid/toolboxen/:id/ai-analyse
  → /veiligheid/toolboxen/ai-batch-genereer
  → /veiligheid/toolboxen/:id/review
  → /veiligheid/toolbox-maandopdrachten (CRUD, voortgang)
  → /veiligheid/toolbox-compliance
  → /mijn/toolbox-maandopdracht + uitstellen + voltooien
```

Gedeelde helpers `addMonths()` en `mapToolbox()` verhuizen naar `lib/veiligheid-helpers.ts`.

**Testbaar:** toolbox CRUD werkt; AI-analyse en AI-batch werken; maandopdrachten werken; typecheck slaagt.

---

**Stap 11 — `veiligheid.ts` → `veiligheid-lmra.ts` + `veiligheid-meldingen.ts` + `veiligheid-incidenten.ts`**

*Wacht op: stap 10*

```
routes/veiligheid-lmra.ts
  → /veiligheid/lmras (CRUD, AI-voorstel, upload)
  → /mijn/lmra-status, /mijn/lmra-openstaand

routes/veiligheid-meldingen.ts
  → /veiligheid/meldingen (CRUD) + acties

routes/veiligheid-incidenten.ts
  → /veiligheid/incidenten (CRUD, AI-voorstel, upload)
```

Na stap 10+11 bestaat `veiligheid.ts` alleen nog uit de dashboard-route en de router-orkestratie (~80 regels).

**Testbaar:** LMRA-flow werkt; meldingen en acties werken; incidenten werken; AI-voorstellen functioneren; typecheck slaagt.

---

### Fase 4 — Frontend-opsplitsingen (stappen 12–17)

> Stap 12 is blokkerende voorganger voor stap 13+14+15.  
> Stap 12 kan parallel met fase 3 (onafhankelijk van backend).

---

**Stap 12 — `plattegrond-constanten.ts` aanmaken**

*Geen voorganger (volledig onafhankelijk)*  
*Parallel met: stap 7–11*  
*Blokkeert: stap 13, 14, 15*

Dit is het fundament voor zowel de plattegrond-split als de print-split, en heft de constanten-duplicatie op:

```
pages/gebouwen/plattegrond-constanten.ts
  → TYPEN, SCHEIDING_TYPEN, CLUSTER_TYPEN, CLUSTER_KLEUREN
  → STATUSKLEUREN, STATUSLABEL, CANVAS_W/H, MIN/MAX_ZOOM
  → WBDBO_OPTIES, RUIMTE_STANDAARD, LEEG_FORM
  → puntOpAfstand(), markerPosities(), groepCentroid()
  → maakVisueleGroepen(), spotVolgnummer(), getRuimteVolgorde()
```

`plattegrond.tsx` en `print.tsx` importeren vervolgens vanuit dit bestand. De drie gedupliceerde blokken (`TYPEN`, `STATUSKLEUREN`, `markerPosities`) worden verwijderd uit `print.tsx`.

**Testbaar:** plattegrond en print tonen identieke kleuren; typecheck slaagt; geen runtime-fouten.

---

**Stap 13 — `plattegrond-componenten.tsx` + `plattegrond-sidebar.tsx`**

*Wacht op: stap 12*  
*Parallel met: stap 14*

```
pages/gebouwen/plattegrond-componenten.tsx
  → ClusterBubble, ClusterOmhulling, VoorzieningIcoon
  → GridAchtergrond, FotoUploader, AiBadge

pages/gebouwen/plattegrond-sidebar.tsx
  → Detail-paneel geselecteerde spot
  → Spot-velden bewerken, foto's, cluster, monteurs, verplaats-knop
```

**Testbaar:** spot-selectie en sidebar werken; foto-upload werkt; cluster-weergave correct; typecheck slaagt.

---

**Stap 14 — `print-constanten.ts` + `print-componenten.tsx`**

*Wacht op: stap 12*  
*Parallel met: stap 13*

```
pages/gebouwen/print-constanten.ts
  → Importeert TYPEN/STATUSKLEUREN uit plattegrond-constanten.ts
  → Rapport-specifiek: ONDERHOUD_STATUSLABEL, INSPECTIE_TYPELABEL,
    RAPPORT_TYPE_LABEL, PRESET_SECTIES, RAPPORT_MODELLEN, SECTIES_LABELS

pages/gebouwen/print-componenten.tsx
  → GridAchtergrond, SpotIcoon, Minimap, SpotDetailBlok (456r)
  → VerdiepingSpotSelector, PrintVerdieping, CertificaatFPS
  → renderScheidingen(), e-mail helpers (afzenderKort, etc.)
```

**Testbaar:** rapport-preview toont alle secties correct; spot-detail-blok werkt; certificaat-weergave klopt; typecheck slaagt.

---

**Stap 15 — `plattegrond-spot-form.tsx` + `plattegrond-serie.tsx`**

*Wacht op: stap 12*

```
pages/gebouwen/plattegrond-spot-form.tsx
  → Dialoog aanmaken nieuwe spot
  → AI-herkenningsstap (foto voor → foto na → AI-voorstel → bevestigen)

pages/gebouwen/plattegrond-serie.tsx
  → Serie-plaatsen dialoog + logica (klik / lijn / rechthoek)
```

Na stap 12+13+15 is `plattegrond.tsx` gereduceerd tot ~500 regels orkestratie + SVG-canvas + pan/zoom.

**Testbaar:** nieuwe spot aanmaken via plattegrond werkt; AI-herkenning werkt; serie-plaatsen werkt (alle drie methoden); typecheck slaagt.

---

**Stap 16 — `print-secties.tsx` + `print-configuratie.tsx`**

*Wacht op: stap 14*

```
pages/gebouwen/print-secties.tsx
  → SectieSpots, SectiePlattegronden, SectieInspecties, SectieOnderhoud,
    SectieEmails, SectieDocumenten, SectieTekeningen, SectiePartijen,
    SectieSamenvatting

pages/gebouwen/print-configuratie.tsx
  → Configuratie-panel: rapport-type, secties aan/uit, spot-selectie,
    tekeningen, bijlagen, rapport opslaan, definitief maken
```

Na stap 14+16 is `print.tsx` gereduceerd tot ~200 regels orkestratie.

**Testbaar:** alle rapport-secties renderen correct; configuratie-panel functioneert; rapport opslaan/definitief werkt; typecheck slaagt.

---

### Fase 5 — Documenten (stappen 17–18)

> Beide stappen betreffen `documenten-tab.tsx`. Stap 17 eerst, dan stap 18.

---

**Stap 17 — `documenten-constanten.ts` + `documenten-formulier.tsx`**

*Geen voorganger (onafhankelijk)*  
*Parallel met: stap 12–16*

```
pages/beheer/documenten-constanten.ts
  → TYPE_LABELS, STATUS_LABELS, GOEDKEURING_LABELS, KOPPELING_LABELS
  → goedkeuringBadge(), statusBadge(), foutmelding() — extern geëxporteerd
  → geldigheidStatus(), formatTijdstip(), FormState, LEEG_FORM

pages/beheer/documenten-formulier.tsx
  → KoppelingenKiezer
  → DocumentFormulier (aanmaken / bewerken, 490r)
```

**Aandacht:** alle bestanden die vanuit `documenten-tab` importeren (`goedkeuringBadge`, `statusBadge`, `TYPE_LABELS`) moeten worden bijgewerkt naar `documenten-constanten`. Grep-inventarisatie vooraf uitvoeren.

**Testbaar:** document aanmaken werkt; document bewerken werkt; extern gebruik van `goedkeuringBadge` en `statusBadge` werkt ongewijzigd; typecheck slaagt.

---

**Stap 18 — `documenten-detail.tsx` + `documenten-koppelingen.tsx` + `documenten-signaleringen.tsx`**

*Wacht op: stap 17*

```
pages/beheer/documenten-detail.tsx
  → DocumentDetail, DocumentGoedkeuringSectie, DocumentLogboekSectie

pages/beheer/documenten-koppelingen.tsx
  → DocumentEntiteitKoppelingen, KoppelingToevoegen, KoppelVoorstellenDialog

pages/beheer/documenten-signaleringen.tsx
  → DocumentSignaleringenDashboard, DocumentAudittrail
```

Na stap 17+18 is `documenten-tab.tsx` gereduceerd tot ~400 regels: `TabDocumenten` met filters, lijst en orkestratie.

**Testbaar:** document-detail openen werkt; goedkeurings-flow werkt; koppelingen toevoegen werkt; signaleringen-dashboard toont correct; audittrail laadt; typecheck slaagt.

---

### Fase 6 — Personeel (stap 19–20)

> Laatste fase; geen blokkerende voorganger (onafhankelijk van alle andere stappen).

---

**Stap 19 — Personeel: 6 eenvoudige tabs opsplitsen**

*Parallel met: stap 20*

```
pages/personeel/tabs/werkgevers-tab.tsx
pages/personeel/tabs/functies-tab.tsx
pages/personeel/tabs/opleidingen-tab.tsx
pages/personeel/tabs/bekwaamheden-tab.tsx
pages/personeel/tabs/verlof-tab.tsx
pages/personeel/tabs/ziekmeldingen-tab.tsx
```

Elk van deze tabs heeft geen cross-tab state-afhankelijkheid; ze kunnen worden geëxtraheerd zonder interface-ontwerp.

**Testbaar:** alle 6 tabs laden correct; CRUD-flows werken per tab; typecheck slaagt.

---

**Stap 20 — Personeel: medewerkers-tab met onboard-flow**

*Parallel met: stap 19*

De medewerkers-tab is afzonderlijk vanwege de cross-tab state (onboard-flow linkt aan functies):

```
pages/personeel/tabs/medewerkers-tab.tsx
  → Props: onFunctieNodig(callback), geselecteerdeFunctieId
  → Onboarden-flow: stap 1 (gebruiker) → stap 2 (functie) → stap 3 (CAO)
```

`personeel/index.tsx` orkestreert de callback: wanneer de medewerkers-tab een nieuwe functie nodig heeft, schakelt `index.tsx` over naar de functies-tab en geeft het resultaat terug.

**Testbaar:** onboarden-flow werkt end-to-end; functie aanmaken vanuit onboarden werkt; bestaande medewerkers-lijst laadt; typecheck slaagt.

---

## Parallelisatiegraph

```
Fase 1 (AI-fundament)
  ├── Stap 1 (ai-utils) ──────────────── Parallel ──── Stap 2 (model-registry)
  │
Fase 2 (AI-deduplicatie) — wacht op stap 1
  ├── Stap 3 (veiligheid-ai) ────────── Parallel ──── Stap 4 (calculatie-ai)
  └── Stap 5 (upload-ai) ─────────────── Parallel ──── Stap 6 (crm-coach hook)
  │
Fase 3 (Backend) — onafhankelijk van fase 1+2, parallel uitvoerbaar
  ├── Stap 7 (hrm-verlof) ──────────── Parallel ──── Stap 10 (veiligheid-toolboxen)
  ├── Stap 8 (hrm-functies/mijn) ───── [na 7] ─────── Parallel ──── Stap 9 (hrm-offboarding/zzp)
  └── Stap 11 (veiligheid rest) ─────── [na 10]
  │
Fase 4 (Frontend plattegrond+print) — onafhankelijk, parallel met fase 3
  ├── Stap 12 (plattegrond-constanten) ── blokkeert 13, 14, 15
  ├── Stap 13 (plattegrond-componenten/sidebar) ─── Parallel ──── Stap 14 (print-constanten/componenten)
  ├── Stap 15 (plattegrond-spot-form/serie)
  └── Stap 16 (print-secties/configuratie) ─── [na 14]
  │
Fase 5 (Documenten) — onafhankelijk, parallel met fase 3+4
  ├── Stap 17 (documenten-constanten/formulier)
  └── Stap 18 (documenten-detail/koppelingen/signaleringen) ─── [na 17]
  │
Fase 6 (Personeel) — onafhankelijk, parallel met alles
  ├── Stap 19 (6 eenvoudige tabs)
  └── Stap 20 (medewerkers-tab + onboard-flow) ─── Parallel ──── Stap 19
```

**Maximale parallelisatie:** fase 3 + fase 4 + fase 5 + fase 6 kunnen tegelijk worden gestart. Fase 2 kan deels overlappen met fase 3 (stap 3–6 blokkeren alleen stap 1, niet de backend-splits).

---

## Stappen-overzicht

| # | Stap | Fase | Wacht op | Parallel met | Geschatte impact |
|---|---|---|---|---|---|
| 1 | `lib/ai-utils.ts` aanmaken | AI-fundament | — | 2 | Hoog: elimineert 10+ duplicaten |
| 2 | `lib/ai-model-registry.ts` aanmaken | AI-fundament | — | 1 | Middel: documenteert keuze |
| 3 | `services/veiligheid-ai.ts` | AI-dedup | 1 | 4 | Hoog: 4 JSON-strips opgelost |
| 4 | `services/calculatie-ai.ts` | AI-dedup | 1 | 3 | Middel: chat-patroon gedeeld |
| 5 | `services/upload-ai.ts` + vision-dedup | AI-dedup | 1 | 6 | Middel: vision-bouw gedeeld |
| 6 | CrmCoachPanel → gegenereerde hook | AI-dedup | 1 | 5 | Laag: caching + typering |
| 7 | `hrm-verlof.ts` | Backend | — | 10 | Hoog: grootste risicoreductie |
| 8 | `hrm-functies-opleidingen.ts` + `hrm-mijn.ts` | Backend | 7 | 9 | Hoog |
| 9 | `hrm-offboarding.ts` + `hrm-zzp.ts` + `hrm-ziekmeldingen.ts` | Backend | 7 | 8 | Hoog |
| 10 | `veiligheid-toolboxen.ts` | Backend | — | 7 | Middel |
| 11 | `veiligheid-lmra/meldingen/incidenten.ts` | Backend | 10 | — | Middel |
| 12 | `plattegrond-constanten.ts` | Frontend | — | 7–11 | Hoog: heft duplicatie op |
| 13 | `plattegrond-componenten.tsx` + `plattegrond-sidebar.tsx` | Frontend | 12 | 14 | Middel |
| 14 | `print-constanten.ts` + `print-componenten.tsx` | Frontend | 12 | 13 | Middel |
| 15 | `plattegrond-spot-form.tsx` + `plattegrond-serie.tsx` | Frontend | 12 | — | Middel |
| 16 | `print-secties.tsx` + `print-configuratie.tsx` | Frontend | 14 | — | Middel |
| 17 | `documenten-constanten.ts` + `documenten-formulier.tsx` | Documenten | — | 12–16 | Middel |
| 18 | `documenten-detail/koppelingen/signaleringen.tsx` | Documenten | 17 | — | Middel |
| 19 | Personeel: 6 eenvoudige tabs | Personeel | — | 20 | Laag-middel |
| 20 | Personeel: medewerkers-tab + onboard-flow | Personeel | — | 19 | Laag-middel |

---

## Wat dit plan niet bevat

De volgende bevindingen uit de workflowanalyse zijn bewust buiten dit plan gehouden omdat ze nieuwe functionaliteit vereisen:

- "Maak project" knop na CRM "Gewonnen" — nieuwe UI + nieuwe route
- "Maak offerte" knop vanuit calculatie — nieuwe koppeling
- Debiteur-factuurkoppeling (werkbon → factuur) — nieuwe workflow
- Uitvoering-module — ontbreekt volledig

Deze verbeteringen volgen de roadmap-volgorde zoals vastgelegd in `replit.md` (V1.4 Opleverrapportage → V1.5 Rapportenmodule → etc.) en vallen buiten de scope van dit technisch verbeterplan.
