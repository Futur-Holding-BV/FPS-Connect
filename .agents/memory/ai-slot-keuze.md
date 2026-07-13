---
name: AI-slot keuze voor interactieve knoppen
description: Waarom interactieve AI-knoppen niet de "reasoning"-slot (gpt-5) mogen gebruiken
---

Interactieve AI-knoppen (mens wacht op resultaat) mogen NIET slot `"reasoning"` (gpt-5) gebruiken: gpt-5 met een groot `max_completion_tokens`-budget besteedt veel tijd aan reasoning-tokens en kan 7+ minuten duren — de fetch hangt en de gebruiker staart naar een spinner (aiGateway retryt bovendien op timeout, 60s per poging).

**Regel:** voor structured-JSON output waar een mens op wacht, gebruik slot `"default"` (gpt-4o) of `"fast"` (gpt-4o-mini) met `max_tokens` (niet `max_completion_tokens` — dat is de gpt-5-conventie). Zie het bestaande pattern in `documentIntelligence.ts` (slot `"fast"` + `max_tokens`).

**Why:** de rollen-voorstel-knop hing 7+ min op `"reasoning"`; met `"default"` + `max_tokens: 4000` klaar in seconden. Reserveer `"reasoning"` voor achtergrond-/batchwerk zonder mens-in-de-lus.

**How to apply:** MODEL_REGISTRY in `aiGateway.ts` mapt slots → modellen (default=gpt-4o, fast=gpt-4o-mini, reasoning=gpt-5). Kies de slot op interactiviteit, niet op "moeilijkheid". Als veiligheid van AI-output afhangt: clamp/valideer server-side (bv. `saneerBevoegdheden`) zodat modelkeuze de veiligheid nooit raakt.
