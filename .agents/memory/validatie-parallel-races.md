---
name: Parallelle validatiestappen delen poort 8080 en dist/
description: Hoe bewijs-/e2e-validatierunners elkaars api-server slopen en hoe een runner zich isoleert.
---
De Project-validatieworkflow draait stappen **parallel**. Drie gevaren voor runners die een api-server nodig hebben:
1. Het api-server dev-script doet onvoorwaardelijk `fuser -k 8080/tcp` — meeliften op 8080 is een race.
2. `build.mjs` doet `rm -rf` op zijn outdir — een parallelle build trekt lazy-geladen modules (bv. thread-stream-worker.mjs) onder een draaiende server weg.
3. e2e-menu en e2e-web racen zelf al om 8080 (EADDRINUSE) als de api-server-workflow niet draait; herstart die workflow vóór een validatierun.

**Why:** 3 review-afwijzingen/CI-fails bij het registreren van bewijs-herschik (aug 2026).
**How to apply:** nieuwe bewijsrunners volgen het patroon van `scripts/src/bewijs-herschik-run.ts`: eigen vrije poort (net listen 0), eigen build-outdir via `API_BUILD_OUTDIR` (bv. dist-bewijs, git-ignored), gereedheid gebonden aan het eigen kindproces (elke exit vóór gereed = fout), bewijsscript wijst via `BEWIJS_API_BASIS` naar de eigen instantie, alleen eigen procesgroep killen.
