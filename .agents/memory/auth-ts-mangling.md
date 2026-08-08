---
name: auth.ts terugkerende mangeling
description: routes/auth.ts raakt herhaaldelijk gemangeld door reverts/merges; hoe herkennen en herstellen
---

`artifacts/api-server/src/routes/auth.ts` is nu twee keer door revert/merge-verkeer
in een kapotte hybride staat beland (undefined `id`-lookups in login/2FA/reset,
mobiel token als rauwe hex i.p.v. `maakToken`, wachtwoord-wijzigen-route vervangen
door een tweede `/auth/taal`).

**Waarom verraderlijk:** de dev-server (tsx/esbuild) en zelfs login-e2e kunnen
tegen een oudere werkende compilatie draaien, dus "login werkt" bewijst niet dat
de bron gezond is. Alleen `tsc --noEmit` op api-server toont het.

**How to apply:** bij elke merge/revert die auth.ts raakt: draai de api-server
typecheck; bij TS2304 `id`-fouten het hele bestand herstellen uit de laatste
commit waar tsc groen was (niet regel-voor-regel patchen — de mangeling is een
mix van twee versies).

**Update 8 aug 2026:** ook opname.ts is bij taak-merges twee keer opnieuw gemangeld (bodies onder verkeerde koppen, ongedefinieerde variabelen). Vaste remedie: `git checkout <laatst geverifieerde commit> -- <bestand>` + volledige typecheck. CI bewaakt nu dubbele declaraties via `check-dubbele-routes` (@workspace/scripts), maar verschoven bodies zónder duplicaat vangt alleen tsc. Na ELKE taak-merge die routes raakt: typecheck draaien vóór deploy-vertrouwen.
