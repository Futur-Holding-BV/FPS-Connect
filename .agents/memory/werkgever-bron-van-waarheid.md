---
name: Werkgever als HRM-hoofdentiteit
description: Werkgever is de bron van waarheid in HRM; werkmaatschappij-tekst is een afgeleide cache; renames moeten cascaderen.
---

# Werkgever = eerste-klas HRM-entiteit (FPS Groep)

De `werkgevers`-tabel (FPS-werkmaatschappijen) is leidend voor CAO, briefpapier/logo en
personeelsbeleid. Kinderen (functies, medewerkers, verlofsoorten) hebben een nullable
`werkgever_id` FK. Het bestaande `werkmaatschappij` tekstveld op die kinderen blijft als
**legacy cache**, NIET als bron van waarheid.

**Regel:** `werkgever_id` is authoritatief; `werkmaatschappij`-tekst wordt afgeleid uit
`werkgevers.naam` — nooit andersom. Bij hernoemen van een werkgever (PATCH
`/werkgevers/:id`) moet de cache op alle gekoppelde kinderen in één transactie
meeschrijven.

**Why:** `werkgeverIdVoor(werkmaatschappij)` in hrm.ts resolvet `werkgever_id` door de
werkmaatschappij-naam exact te matchen tegen `werkgevers.naam`. Zonder cascade zou een
rename toekomstige child-writes wezen (`werkgever_id = null`) en de weergave laten
verlopen. Voor contractgeneratie (CAO/briefpapier/ondertekenaar per medewerker) is die
koppeling te fragiel om op naam-matching te leunen.

**How to apply:**
- Elke nieuwe schrijfactie op een child die `werkmaatschappij` zet, moet ook
  `werkgever_id` afleiden (via `werkgeverIdVoor`) totdat de overstap naar expliciete
  `werkgever_id` in de API is voltooid.
- Geplande hardening vóór de contract-/sjabloon-uitbreiding (architect-advies): expose
  `werkgever_id` in child-API-responses + accepteer het op writes; vervang de hard-coded
  `WERKMAATSCHAPPIJEN`-frontend-selects (lib/werkmaatschappijen.ts) door `/werkgevers`-data
  (alleen `actief`), met behoud van bestaande opgeslagen waarden. Daarna kan
  name-matching vervallen.
- Out of scope (geparkeerd V3.0): salarisadmin, payroll, e-signature, werving, planning,
  beoordeling, AI-personeelsadvies.

- **Besluit René (17 aug 2026):** "FPS Bouw" en "FPS Bouw en Renovatie" zijn écht twee aparte werkmaatschappijen — nooit samenvoegen of als duplicaat behandelen. Let op naam-matching: exacte DB-naam is "FPS Bouw en Renovatie" (met "en", niet "&"); includes-matching kan "FPS Bouw" onterecht laten matchen op de langere naam.
