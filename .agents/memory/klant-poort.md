---
name: Klant-poort (KLANT_01)
description: Centrale klantafscherming — dicht tenzij open; hoe nieuwe klantroutes toe te voegen.
---

**Regel:** rol "klant" bereikt sessieroutes alleen via de allowlist in `middlewares/klantPoort.ts` (gemount direct na `laadPermissies`); al het andere → 403. Handlerfilters (magBijGebouw, statusfilters) blijven als tweede laag.

**Why:** vóór KLANT_01 waren 229 van 1264 sessieroutes klantbereikbaar (alles met alleen requireAuth); pim/rapporten lekten cross-klant data.

**How to apply:** nieuwe klantroute = (1) `requireBevoegdheidOfKlant`, (2) gebouw-begrenzing in de handler (magBijGebouw/toegewezenGebouwIds), (3) allowlist-regel toevoegen. Buildcheck `pnpm --filter @workspace/scripts run klant-poort-check` dwingt dit af (faalt op OfKlant-route zonder allowlist-opname). Klanten zien alleen gebouwen met een `gebouw_publicaties`-rij status=gepubliceerd. Restlek (medewerkers): projecten.ts/opname.ts/workflow.ts hebben géén requireBevoegdheid — aparte opdracht.
