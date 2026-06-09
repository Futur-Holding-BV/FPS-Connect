---
name: Rol-filter backend
description: Backend visibiliteitsfilter voor monteur/controleur — alle list/sub-resource endpoints moeten effectieveContext gebruiken.
---

## Patroon (gebruik altijd effectieveContext, NIET req.session.userId rechtstreeks)

```ts
import { effectieveContext } from "../utils/rol";

const TOEGEWEZEN_ROLLEN = ["monteur", "controleur"];

// In GET handler:
const { userId, rol: effectiefRol } = await effectieveContext(req);
if (TOEGEWEZEN_ROLLEN.includes(effectiefRol)) {
  const ids = await toegewezenGebouwIds(userId);
  all = all.filter(v => ids.includes(v.gebouwId));
}
```

**Why:** `effectieveContext(req)` respecteert de "bekijken als" impersonatie van de hoofdbeheerder. `req.session.userId` geeft altijd de echte gebruiker — bij impersonatie werkt het rolfilter dan niet.

**How to apply:**
- Alle list-endpoints die op gebouwtoewijzing filteren: `inspecties.ts`, `onderhoud.ts`, `voorzieningen.ts` (GET /voorzieningen, GET /verdiepingen/:id/voorzieningen, GET /verdiepingen/:id/scheidingen)
- Nieuw toe te voegen routes met monteur/controleur-filter: altijd effectieveContext, nooit gebruikerRol(req.session.userId!)
- Uitzondering: permissie-gating (zoals terugplaatsen beheerder-only check) mag op echte rol = `req.session.userId` blijft bewust voor security-checks
