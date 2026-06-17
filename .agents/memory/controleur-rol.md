---
name: Controleur/monteur rollen — gedecommissioneerd (contract)
description: De rollen monteur/controleur bestaan niet meer in het API-contract; rol-enum = hoofdbeheerder/gebruiker/klant. Scoping en inspectietoegang zijn matrix-driven.
---

## Huidige stand (rolmodel)
Het API-contract kent nog maar drie rollen: **hoofdbeheerder, gebruiker, klant** (openapi rol-enums). De oude rollen **monteur** en **controleur** zijn gedecommissioneerd.

**Why:** rolgebaseerde businesslogica is vervangen door de bevoegdheden-matrix. Een aparte monteur/controleur-rol is overbodig: toegang volgt uit module-niveaus, niet uit een rolnaam.

## Server — wat verdwenen is
- `TOEGEWEZEN_ROLLEN = ["monteur","controleur"]` bestaat NIET meer. Gebouw-scoping (alleen toegewezen gebouwen zien) loopt nu via `effectieveContext(req).beperkt` (lees-/listfilters) en `isBeperktTotToegewezen(userId)` (write-guards) in `utils/rol.ts`.
- "beperkt" = NIET hoofdbeheerder EN gebouwen-module niveau < 2 (GEBOUW_BEHEER_NIVEAU). hoofdbeheerder nooit beperkt; klant → lege matrix.
- De controleur-inspectiebeperking (`CONTROLEUR_INSPECTIE_TYPES`, `=== "controleur"` in `inspecties.ts` GET-filter + POST-guard) is VERWIJDERD. Inspectietoegang is nu puur niveau-driven via `requireBevoegdheid("inspecties", n)`. Er is geen matrix-concept "alleen onderhoudsinspectietypes".

## Legacy migratiepad blijft
`bevoegdhedenVoorLegacyRol(rol)` in `lib/permissies` vertaalt nog niet-gemigreerde accounts (waaronder rol "monteur"/"controleur" met lege matrix) naar een matrix. NIET aanraken — dit is het migratiepad, geen live rolbranch.

## Web (frontend) — rol-string gating = verdwijnende knoppen
**Regel:** UI bewerk-/actiegating MOET via `useBevoegdheid().heeftNiveau(module, n)` (de matrix), NOOIT via rol-strings. Spots bewerken/plaatsen = `heeftNiveau("voorzieningen", 3)` (niveau 3 = "Aanmaken en wijzigen" = oude monteur-preset).

**Why:** sinds de rol-enum alleen nog hoofdbeheerder/gebruiker/klant kent, evalueert elke `["monteur","beheerder",...].includes(rol)` of `rol === "monteur"` naar false voor gewone gebruikers → de knop verdwijnt stilzwijgend (geen error). hoofdbeheerder blijft werken, dus de bug is onzichtbaar als je als admin test.

**How to apply:** zie je een verdwenen knop-melding voor een niet-admin, zoek eerst naar rol-string gates (`_ROLLEN`, `.includes(...rol)`, `=== "monteur"/"beheerder"`) op die pagina vóór je dieper graaft.

Gesaneerd: `plattegrond.tsx` (magBewerken) en `voorzieningen/detail.tsx` (magBewerken) → matrix. Nog legacy (apart te volgen, niet de gemelde bug): `isBeheerder` (archief terugplaatsen + logo bewerken) in plattegrond/gebouwen-pagina's; portal-routing in `App.tsx`/`monteur-layout.tsx`/`dashboard/monteur.tsx`; `voorziening-bewerken-dialog.tsx` — deze veroorzaken ook de pre-existing Rol-enum typecheck-fouten (`"beheerder"`/`"controleur"` no overlap).
