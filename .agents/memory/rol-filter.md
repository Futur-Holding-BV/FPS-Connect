---
name: Rol-filter backend (gebouw-scoping)
description: Backend visibiliteitsfilter op gebouwtoewijzing is matrix-driven (beperkt), NIET op rolnaam; alle list/sub-resource endpoints moeten effectieveContext gebruiken.
---

## Patroon (gebruik altijd effectieveContext, NIET req.session.userId rechtstreeks)

```ts
import { effectieveContext, isBeperktTotToegewezen } from "../utils/rol";

// In GET/list handler (impersonatie-aware):
const { userId, beperkt } = await effectieveContext(req);
if (beperkt) {
  const ids = await toegewezenGebouwIds(userId);
  all = all.filter(v => ids.includes(v.gebouwId));
}

// In write-guard (altijd op echte gebruiker):
if (!(await isBeperktTotToegewezen(req.session.userId!))) { /* niet beperkt */ }
```

**Why:** rolnaam-filtering (`TOEGEWEZEN_ROLLEN = ["monteur","controleur"]`) is verwijderd — die rollen bestaan niet meer in het contract. "beperkt" volgt nu uit de bevoegdheden-matrix: NIET hoofdbeheerder EN gebouwen-niveau < 2. `effectieveContext(req)` respecteert ook de "bekijken als" impersonatie van de hoofdbeheerder.

**How to apply:**
- Alle list-endpoints die op gebouwtoewijzing filteren: `dashboard.ts`, `inspecties.ts`, `onderhoud.ts`, `voorzieningen.ts` (GET /voorzieningen, GET /verdiepingen/:id/voorzieningen, GET /verdiepingen/:id/scheidingen), `gebouwen.ts`.
- Lees-/listfilters: gebruik `beperkt` uit `effectieveContext` (impersonatie-aware).
- Write-guards (magBijGebouw): gebruik `isBeperktTotToegewezen(userId)` op de ECHTE sessie-gebruiker — write-autorisatie blijft altijd op de werkelijke gebruiker.
- Uitzondering: permissie-gating (security-checks) blijft op `req.session.userId` / requireBevoegdheid.
