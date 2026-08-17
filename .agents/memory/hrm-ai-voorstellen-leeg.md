---
name: HRM AI-voorstellen zonder waarde
description: Ontbrekend-veld-signaleringen in het medewerkerdossier — geen zekerheidsscore, geen Overnemen, fail-closed goedkeuren.
---
Regel: een AI-"voorstel" zonder voorstelwaarde is een **signalering** (modelGebruikt=missingFieldScan), geen overneembaar voorstel.
- Signaleringen krijgen géén confidence/vertrouwenScore (betekenisloos zonder waarde); heranalyse heelt oude rijen met score zelf (bulk-update per medewerker).
- PATCH goedkeuren zonder voorgesteldeWaarde én zonder correctie_tekst → 422; doorvoer werkt ook via het correctieTekst-pad.
- UI: badge "Ontbreekt", alleen "Waarde invullen en overnemen" (disabled tot ingevuld); bulk-accepteren en de bulk-knop-conditie filteren op niet-lege voorstelwaarde.

**Why:** kaarten met "Voorstel: —" + Overnemen + "100% zekerheid" (terwijl impact laag/gemiddeld zei) waren misleidend en goedkeuren deed stil niets.
**How to apply:** bij nieuwe voorstel-bronnen in hrm_ai_voorstellen: lege waarde ⇒ score null en frontend-kaart behandelt het als signalering. Bewijs: scripts/src/verificatie-hrm-voorstel-leeg.ts.

## Datum-saniteit medewerkerprofiel (aug 2026)
Regel: alle datumvelden op het medewerkerprofiel gaan uitsluitend via lib/datumSaniteit (echte kalenderdatum, jaartal 1900–2100); geldt voor routes, AI-voorstel-doorvoer, onboarding én import.
**Why:** text-kolommen + dossier-AI lieten "82026-07-14" in het dossier landen; losse per-route checks misten paden.
**How to apply:** nieuw schrijfpad voor deze velden → ongeldigeDatumvelden/isRedelijkeDatum hergebruiken, nooit een eigen new Date()-check.

