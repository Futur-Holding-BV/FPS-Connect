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

## Mobiele Fabrikanten-scherm filtert op TEKST, niet op FK

De productiedata heeft `labels.fabrikant_id` overal NULL; de vrije-tekst `labels.fabrikant`
bevat brand/productlijn-namen (Promastop, ProRox, Rockwool...) die grotendeels NIET matchen
met de curated `fabrikanten`-mastertabel (8 echte fabrikanten: Hilti, Promat, Rockwool...).
Daarom leidt het Expo-scherm `monteur-app/app/fabrikanten.tsx` de fabrikant-chips af uit de
distinct `fabrikant`-teksten op actieve labels en filtert producten op die tekst — NIET op
fabrikant_id en NIET op de curated mastertabel.

**Why:** chips uit de mastertabel + filter op fabrikant_id gaf altijd 0 producten ("merknamen
zichtbaar, geen producten eronder"). Tekst-afgeleide chips garanderen dat elke getoonde
fabrikant ook producten heeft, zonder risicovolle data-backfill of giswerk over welk
productlijn bij welke fabrikant hoort.

**How to apply:** canonieke groepering op de 8 echte fabrikanten vereist eerst het vullen van
`labels.fabrikant_id` (toewijzen per toepassing in de web-bibliotheek of een backfill-migratie
mét domeinbeslissing). Doe dat als aparte taak; koppel deze bugfix er niet aan.
