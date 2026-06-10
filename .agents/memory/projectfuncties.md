---
name: Projectfuncties / functietitels
description: Hoe rollen en projectfuncties (functietitels) zijn gemodelleerd en waar de regels worden afgedwongen.
---

# Projectfuncties (functietitels)

`gebruikers.functietitels` is een `text[]` (NOT NULL DEFAULT '{}'), geen enkel-veld.
Het veld is **gesplitst in twee disjuncte categorieën** afhankelijk van de rol:
- **Office-functies (beheerder/hoofdbeheerder)** — meerdere toegestaan: Projectleider, Werkvoorbereider, Project-admin, Calculator, Commercie, Financieel (6). Server-const `FUNCTIETITELS_TOEGESTAAN` / web-const `FUNCTIETITELS`.
- **Veldfuncties (monteur)** — hooguit ÉÉN: Timmerman, Uitvoerder. Server-const `VELD_FUNCTIES`.
- controleur/klant: altijd `[]`.

**Formeel V1.0-rollenmodel (gebruikersbeslissing):** exact 5 systeemrollen (hoofdbeheerder/beheerder/monteur/controleur/klant) + 8 projectfuncties (6 office + 2 veld hierboven). GEEN nieuwe systeemrollen — de projectfuncties krijgen GEEN eigen rechtenlaag; toegang blijft puur op systeemrol. "Commercie"/"Financieel" zijn hier label-strings in `functietitels`, los van de gelijknamige CRM-tabellen (niet aanraken).

**Timmerman/Uitvoerder zijn GEEN aparte systeemrollen.** De 5 systeemrollen (hoofdbeheerder/beheerder/monteur/controleur/klant) bepalen toegang. In de gebruikers-UI verschijnen Timmerman/Uitvoerder als rol-keuzes (virtuele lowercase Select-values), maar worden opgeslagen als `rol="monteur"` + één veldfunctie — zelfde monteur-app/portaal, alleen een specifiekere naam. `functietitels` zit nergens in auth-middleware → een veldfunctie geeft NOOIT extra toegang.
(Historisch was dit één whitelist van vijf/zes met o.a. Calculator/Commercieel/Project-administratie/Financieel; per V1.0 ingeperkt en daarna gesplitst in office vs veld. "Commercieel"/"Financieel" bestaan nog als losstaande CRM-tabellen — niet aanraken.)

**Regel — handhaaf server-side, niet alleen in UI:**
- Users POST/PATCH: beheerder → `schoonFunctietitels` (office-whitelist, ontdubbeld); monteur → `schoonVeldFunctie` (max 1 uit `VELD_FUNCTIES`); controleur/klant → `[]`.
- PATCH moet de **effectieve rol** gebruiken (bestaande rij ophalen wanneer `rol` niet wordt meegestuurd). `functietitels` weggelaten + GEEN rolwissel → ongemoeid laten. `functietitels` weggelaten + WEL rolwissel → bestaande functies door de schoonmaak-helper van de NIEUWE rol halen (zo verdwijnen office-titels bij wissel naar monteur en omgekeerd). Anders wist een partiële PATCH onterecht, of houdt een rolwissel verkeerde functies vast.
- Projectteam (`POST /gebouwen/:id/toewijzingen`): een beheerder vereist een `project_rol` die in zijn eigen `functietitels` zit; monteur/controleur krijgen `project_rol = null` (genegeerd indien meegestuurd).

**Why:** de architect-review wees uit dat UI-only afdwinging bypassbaar is via directe API-calls, en dat PATCH-edge-cases (rol weggelaten / rolwissel) data corrumperen.

**How to apply:** bij elke wijziging aan rol/functietitel-logica beide kanten (web `gebruikers/index.tsx` + `gebouwen/detail.tsx` én de twee route-handlers) consistent houden.

**Whitelist inperken vereist DB-opschoning:** de `POST /gebouwen/:id/toewijzingen`-validatie controleert alleen of `project_rol` in `gebruiker.functietitels` zit (profiel-subset), NIET tegen de whitelist. De whitelist "self-healt" pas bij de volgende profiel-save. Dus als je de whitelist verkleint, blijven legacy-waarden in bestaande `gebruikers.functietitels`-rijen gewoon toewijsbaar als project_rol totdat je ze in de DB opschoont. Bij inperken altijd een gerichte UPDATE draaien die functietitels filtert op de nieuwe whitelist.
