---
name: AI-state kleurconventie
description: Vaste kleurregel voor AI-voorgestelde vs geaccepteerde content in de firevault UI (projectformulier en toekomstige kaarten).
---

# Kleurconventie voor AI-states

Door de gebruiker vastgelegde regel, geldend op ELKE kaart waar AI iets voorstelt:

- **AI stelt voor / heeft aangevuld (nog niet bevestigd) = GEEL** — Tailwind `amber`
  (`bg-amber-100 text-amber-700 border-amber-200`, tekst `text-amber-600`), met `Sparkles`-icoon.
- **Geaccepteerd / bevestigd / geverifieerd = NEUTRAAL** — `Badge variant="secondary"` +
  `text-muted-foreground`, of `text-muted-foreground` voor losse tekst, kaart-achtergrond
  `border-muted bg-muted/40`. **NIET groen** (was eerder `bg-green-100 text-green-700`).

**Why:** groen suggereerde "succes/actie nodig" terwijl bevestigde AI-content juist rustig/afgehandeld
moet ogen; geel reserveren we voor "AI-voorstel, mens moet nog controleren". Consistente taal over alle kaarten.

**How to apply:**
- Patroon zit primair in `gebouw-projectformulier.tsx` (header-status, SectieLabel-badge,
  contact-badges + contact-kaart achtergrond, alleen-lezen view, "Bevestigd (N)"-groepskop).
- BUITEN de regel (bewust groen/anders laten):
  - actie-knoppen zoals de "Bevestigen"-knop (affordance vóór acceptatie, geen state-indicator);
  - lifecycle-/datastatussen zonder AI, bv. projectstatus Gereed (groen) / Actief (blauw),
    stappenplan-stap "Gereed", "Plattegrond aanwezig".
- `gebouw-ai-suggesties.tsx` gebruikt al alleen amber voor voorstellen (geen groene accepted-state).
- Pas dezelfde regel toe op nieuwe AI-kaarten: geel bij voorstel, neutraal zodra bevestigd.
