---
name: PIM Architectuur
description: Project Intelligence Model — kernbeslissingen, grenzen en architectuurcorrecties. Lees dit vóór elke PIM-bouwtaak.
---

## PIM is AI-context only — geen operationele data

De gebruiker heeft expliciet vastgelegd:
> "Bewaak dat het PIM geen bron van waarheid wordt voor operationele data; die blijven in bestaande tabellen/modules. PIM bevat alleen AI-context, analyse, motivatie, observaties en uitvoeringskennis."

**Wat WEL in PIM mag:** aanvraaganalyse, risico's, aannames, werkpakket-motivaties, materiaalkeuze-motivaties, foto-analyses, afwijkingsbeoordelingen, opleveringscheck-resultaat.

**Wat NIET in PIM mag:** hoeveelheden, prijzen, medewerkersnamen, planningsdatums, inkooporders, offerteregels, documenten zelf, spotdata. Die blijven in de bestaande tabellen.

**Why:** Dubbele bron van waarheid leidt tot inconsistenties en maakt de bestaande modules onbetrouwbaar.

## Fasering — harde volgorderegel

Fase A (PIM Foundation, #296) moet gemerged zijn en typecheck/build groen zijn voordat B t/m G (#297-#302) mogen starten. De dependency-chain in het task-systeem dwingt dit al af, maar expliciet vastgelegd op verzoek van de gebruiker.

## Vier architectuurcorrecties (vóór bouw vastgesteld)

1. **Geen organisatie_id-filtering** — dit patroon bestaat niet in de codebase. Autorisatie via bestaande bevoegdheden-matrix + toewijzingscheck. Klantperspectief-filter = expliciete veld-masking in GET /pim.

2. **document_koppelingen CHECK-constraint** — staat standaard `'gebouw','klant','offerte','dossier','voorziening'` toe. Fase A breidt uit met `'opdracht'` (DROP + ADD CONSTRAINT + Drizzle-schema).

3. **Geen FK uitvoering_stap → inkoopplan_regel** — temporele inversie: stappen bestaan pas ná inkoop. `pim.inkoop_context` bevat JSONB-mapping `{ werkpakket_sleutel: [inkoopplan_regel_id, ...] }`. AI-stapgenerator leest deze mapping per werkpakket.

4. **Concurrency-bescherming** — SyncQueue-retries kunnen stap-voltooiing dupliceren. Partial unique index op `pim_uitvoering_stappen`: één actieve/afgeweken stap per pim_id. Alle fase-overgangen in transactie met status-guard, 409 bij stale voltooiing.

## Autorisatie uitvoering

Monteur-endpoints voor stap-voltooien: toewijzingscheck (à la mijn-werk), NIET `requireBevoegdheid("offertes", 2)` — monteurs hebben offertes-bevoegdheid niet.

## AI-kosten uitvoeringsfase

~€1,50–3 per project (20 stappen, vision gpt-5). Acceptabel. Vorige stappen samenvatten in context i.p.v. volledige historie meesturen om token-bloat te voorkomen.

## FPS Knowledge Base (#303)

Naast het PIM bestaat een centrale KB voor bedrijfskennis (cross-project, herbruikbaar):
- Leveranciers: additieve KB-velden op bestaande tabel (levertijd, betrouwbaarheid, spoed, raamovereenkomst)
- Artikelen: additieve KB-velden (goedgekeurd_door_fps, compatibele/alternatieve artikelen, montagevoorschriften)
- Nieuwe tabellen: `leverancier_prestaties`, `fps_bedrijfsstandaarden`, `opdrachtgever_voorkeuren`
- `kbService.ts`: assembleert KB-context als Markdown-string voor prompt-injection (geen AI-aanroepen zelf)
- `KB_BESLISSTRUCTUUR` constant in `aiPrompts.ts`: 8-stappen beslisstructuur als standaard prompt-prefix

Afhankelijkheid: #303 loopt parallel aan Fase A (#296). Fase B (#297) en C (#298) moeten #303 klaar hebben — systeem-dependency kon niet worden toegevoegd (PENDING-restrictie); staat als noot in hun beschrijving.

## Sleutelbestanden

- `docs/ai-opdrachtregisseur-plan.md` — volledig plan met correcties
- `.local/tasks/pim-fase-a-foundation.md` — Fase A scope (backend-only, additief)
- `lib/db/src/schema/documenten.ts:64-78` — CHECK-constraint die uitgebreid moet worden
- `artifacts/api-server/src/lib/aiGateway.ts` — hergebruiken ongewijzigd
- `artifacts/api-server/src/routes/werkvoorbereiding.ts` — bestaande genereer-routes, uitbreiden met opt-in PIM-context
