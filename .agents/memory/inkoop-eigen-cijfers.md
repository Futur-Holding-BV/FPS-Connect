---
name: Inkoop/werkbegroting-AI eigen cijfers
description: INKOOP_AI_01 — inkoopadvies op eigen FPS-historie; deterministische prijsvulling, geen AI-prijzen of -leverancierskeuze
---

Regels (spiegel van calculatie-eigen-cijfers, zie dat topic):
- `inkoopprijs_verwacht` komt NOOIT van de AI: jaarprijslijst (exacte case-insensitieve naam-match, ambigu = geen override) → eigen inkoopmediaan (≥3 waarnemingen, prijsBron "inkoophistorie") → null. Besparing en `totaleBesparing` zijn rekensommen uit de regels.
- Bronnen fail-closed: alleen bestelde/geleverde inkoopbonnen + verwerkte/betaalde inkoopfacturen; nacalculaties alleen `afgesloten=true`.
- `aanbevolen_leverancier` = deterministische opsomming van leveranciers uit eigen historie mét prijs; AI kiest nooit één leverancier.
- Nieuwe prijs_bron-enumwaarde toevoegen = openapi.yaml (3 plekken) + codegen + frontend Select/labels/cast-union + prijsbronVerdeling-init in werkvoorbereiding.ts.

**Why:** verzonnen marktprijzen zijn erger dan leeg — er wordt een besparing tegen afgezet; leverancierskeuze is aan de inkoper.
**How to apply:** elke nieuwe AI-plek die over inkoopprijzen of leveranciers praat krijgt `bouwInkoopEigenCijfersContext`/`bouwWerkbegrotingEigenCijfersContext` (lib/inkoopEigenCijfers.ts) en laat prijsvelden server-side vullen. Bewijs: scripts/src/bewijs-inkoop-eigen-cijfers.ts.
