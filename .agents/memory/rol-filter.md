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

**Why:** rolnaam-filtering (`TOEGEWEZEN_ROLLEN = ["monteur","controleur"]`) is verwijderd — die rollen bestaan niet meer in het contract. `effectieveContext(req)` respecteert ook de "bekijken als" impersonatie van de hoofdbeheerder.

**LET OP — `beperkt` is NIET simpelweg gebouwen<2.** Die naïeve regel beperkte kantoor-leesrollen (commercieel/calculatie, gebouwen:1, géén veld-write) ten onrechte tot toegewezen gebouwen → die zagen NUL gebouwen (geen toewijzingen). Huidige `isBeperkt(rol, bevoegdheden)` in `utils/rol.ts`, op volgorde:
1. `hoofdbeheerder` → false (ziet alles).
2. `klant` → ALTIJD true. Klantportaal-objectscope (klant ziet enkel eigen gebouwen) loopt VOLLEDIG via `beperkt` + `toegewezenGebouwIds`; `requireBevoegdheidOfKlant` laat klant door en verwacht handler-scoping. Mag NOOIT false worden → lekt anders de hele portefeuille aan elke klant.
3. `gebouwen`-niveau < 1 (geen leesrecht op gebouwen) → true. Anders ziet een custom-matrix met bv. `voorzieningen:1, gebouwen:0` alle spots ongescoped.
4. `gebouwen`-niveau >= 2 (gebouwbeheer) → false (hele portefeuille).
5. gebouwen-niveau == 1: beperkt ALLEEN als veldgebruiker = niveau >= 2 op één van `voorzieningen|onderhoud|inspecties` (monteur/timmerman/controleur). Kantoor-leesrol (commercieel/calculatie) → false.

`beperkt=false` verbreedt alleen LEESbereik; schrijven blijft gegated via `requireBevoegdheid("gebouwen", 2/3/4)`, dus commercieel (gebouwen:1) kan nog steeds niet muteren.

**How to apply:**
- Alle list-endpoints die op gebouwtoewijzing filteren: `dashboard.ts`, `inspecties.ts`, `onderhoud.ts`, `voorzieningen.ts` (GET /voorzieningen, GET /verdiepingen/:id/voorzieningen, GET /verdiepingen/:id/scheidingen), `gebouwen.ts`.
- Lees-/listfilters: gebruik `beperkt` uit `effectieveContext` (impersonatie-aware).
- Write-guards (magBijGebouw): gebruik `isBeperktTotToegewezen(userId)` op de ECHTE sessie-gebruiker — write-autorisatie blijft altijd op de werkelijke gebruiker.
- Uitzondering: permissie-gating (security-checks) blijft op `req.session.userId` / requireBevoegdheid.
