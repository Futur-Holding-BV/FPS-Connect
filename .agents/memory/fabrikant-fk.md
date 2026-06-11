---
name: Fabrikant FK op toepassingen
description: Waarom labels.fabrikant_id (FK) én labels.fabrikant (tekst) naast elkaar bestaan en hoe hernoemen doorwerkt
---

# Fabrikant-koppeling op toepassingen (labels)

`labels.fabrikant_id` (FK -> fabrikanten, ON DELETE SET NULL) is de bron van waarheid.
`labels.fabrikant` (vrije tekst) blijft bestaan als **gedenormaliseerde naam-cache**.

**Why:** AI-services (`spot-ai.ts`, `document-ai.ts`) lezen `l.fabrikant` als platte
tekst. Door de naam mee te synchroniseren blijven die werken zonder join/aanpassing.
Het FK-veld werd toegevoegd zodat hernoemen overal doorwerkt i.p.v. losse vrije tekst.

**How to apply:**
- Schrijven gaat via `bepaalFabrikant()` in `lib/classificatie.ts`: fabrikant_id heeft
  voorrang; anders wordt vrije tekst case-insensitief op naam gematcht; anders losse tekst.
- Hernoemen: `PATCH /fabrikanten/:id` roept `herbenoemFabrikantOpToepassingen()` aan en
  werkt de gedenormaliseerde `labels.fabrikant` tekst bij voor alle gekoppelde labels.
  Bij elke nieuwe schrijfweg naar fabrikantnaam: deze sync NIET vergeten, anders loopt
  de cache uit de pas met de FK.
- Excel-import stuurt nog steeds vrije tekst; de server matcht die via bepaalFabrikant.
