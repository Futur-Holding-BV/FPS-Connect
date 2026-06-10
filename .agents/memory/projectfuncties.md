---
name: Projectfuncties / functietitels
description: Hoe rollen en projectfuncties (functietitels) zijn gemodelleerd en waar de regels worden afgedwongen.
---

# Projectfuncties (functietitels)

`gebruikers.functietitels` is een `text[]` (NOT NULL DEFAULT '{}'), geen enkel-veld.
Alleen een **beheerder/hoofdbeheerder** heeft projectfuncties in het profiel; monteur/controleur/klant niet.

De vijf toegestane profielfuncties zijn vast: Projectleider, Werkvoorbereider, Project-admin, Uitvoerder, Timmerman.
(Historisch waren dit er zes met o.a. Calculator/Commercieel/Project-administratie/Financieel; per V1.0 ingeperkt tot deze vijf. "Commercieel"/"Financieel" bestaan nog als losstaande CRM-tabellen — niet aanraken.)

**Regel — handhaaf server-side, niet alleen in UI:**
- Users POST/PATCH: filter functietitels tegen de whitelist + ontdubbel; forceer `[]` voor niet-beheerders.
- PATCH moet de **effectieve rol** gebruiken (bestaande rol ophalen wanneer `rol` niet wordt meegestuurd), anders wist een partiële PATCH onterecht de functietitels, of behoudt een rolwissel naar monteur/controleur oude functies.
- Projectteam (`POST /gebouwen/:id/toewijzingen`): een beheerder vereist een `project_rol` die in zijn eigen `functietitels` zit; monteur/controleur krijgen `project_rol = null` (genegeerd indien meegestuurd).

**Why:** de architect-review wees uit dat UI-only afdwinging bypassbaar is via directe API-calls, en dat PATCH-edge-cases (rol weggelaten / rolwissel) data corrumperen.

**How to apply:** bij elke wijziging aan rol/functietitel-logica beide kanten (web `gebruikers/index.tsx` + `gebouwen/detail.tsx` én de twee route-handlers) consistent houden.

**Whitelist inperken vereist DB-opschoning:** de `POST /gebouwen/:id/toewijzingen`-validatie controleert alleen of `project_rol` in `gebruiker.functietitels` zit (profiel-subset), NIET tegen de whitelist. De whitelist "self-healt" pas bij de volgende profiel-save. Dus als je de whitelist verkleint, blijven legacy-waarden in bestaande `gebruikers.functietitels`-rijen gewoon toewijsbaar als project_rol totdat je ze in de DB opschoont. Bij inperken altijd een gerichte UPDATE draaien die functietitels filtert op de nieuwe whitelist.
