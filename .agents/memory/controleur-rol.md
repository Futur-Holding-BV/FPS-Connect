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

## Web (frontend) — mogelijk nog legacy
Frontend kan nog "monteur"/"controleur" referenties bevatten (bv. plattegrond.tsx BEWERKER_ROLLEN, monteur-layout, dashboards). Dat viel buiten de server/contract-opschoning; controleer en saneer apart indien nodig.
