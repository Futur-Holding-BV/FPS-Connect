---
name: AI-gateway verplicht logcontext
description: Elke aiGateway.chat/responses-aanroep vereist een volledig LogContext (AI_01 §6.4)
---
Regel: `aiGateway.chat(slot, params, timeoutMs|undefined, logCtx)` — logCtx is verplicht met verplichte strings `module`, `functie`, `promptNaam` (+ liefst `promptVersie`).
**Why:** AI_01 §6.4 eist meetbaar AI-gebruik; vóór 2026-08-09 had ~95% van de rijen in ai_aanroepen geen promptnaam en stond de module op "onbekend", waardoor elke gebruiks-/kostenmeting een ondergrens was.
**How to apply:** bij elke nieuwe AI-aanroep: prompt uit aiPrompts.ts → `promptNaam: X_PROMPT.naam, promptVersie: X_PROMPT.versie`; inline prompt → stabiele kebab-case naam + "1.0.0" (prompts niet gedwongen verhuizen). Nooit de velden weer optioneel maken — de verplichting is het meetmechanisme.
