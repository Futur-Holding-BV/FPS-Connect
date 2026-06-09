---
name: Projectfuncties / functietitels
description: Hoe rollen en projectfuncties (functietitels) zijn gemodelleerd en waar de regels worden afgedwongen.
---

# Projectfuncties (functietitels)

`gebruikers.functietitels` is een `text[]` (NOT NULL DEFAULT '{}'), geen enkel-veld.
Alleen een **beheerder/hoofdbeheerder** heeft projectfuncties in het profiel; monteur/controleur/klant niet.

De zes toegestane profielfuncties zijn vast: Projectleider, Werkvoorbereider, Calculator, Commercieel, Project-administratie, Financieel.

**Regel — handhaaf server-side, niet alleen in UI:**
- Users POST/PATCH: filter functietitels tegen de whitelist + ontdubbel; forceer `[]` voor niet-beheerders.
- PATCH moet de **effectieve rol** gebruiken (bestaande rol ophalen wanneer `rol` niet wordt meegestuurd), anders wist een partiële PATCH onterecht de functietitels, of behoudt een rolwissel naar monteur/controleur oude functies.
- Projectteam (`POST /gebouwen/:id/toewijzingen`): een beheerder vereist een `project_rol` die in zijn eigen `functietitels` zit; monteur/controleur krijgen `project_rol = null` (genegeerd indien meegestuurd).

**Why:** de architect-review wees uit dat UI-only afdwinging bypassbaar is via directe API-calls, en dat PATCH-edge-cases (rol weggelaten / rolwissel) data corrumperen.

**How to apply:** bij elke wijziging aan rol/functietitel-logica beide kanten (web `gebruikers/index.tsx` + `gebouwen/detail.tsx` én de twee route-handlers) consistent houden.
