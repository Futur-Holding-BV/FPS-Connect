---
name: Scripts-typecheck vs cross-project bewijsscripts
description: Waarom sommige bewijsscripts uitgesloten zijn van de scripts-typecheck en hoe nieuwe bewijsscripts te schrijven.
---

Bewijsscripts die api-server-bronbestanden importeren (bv. `bewijs-financieel-ak.ts`, `bewijs-scenario-doorrekening.ts`) breken `tsc` in scripts/ met TS6059 (rootDir) plus een cascade van sessie-augmentatie-fouten. Ze staan daarom in `exclude` van `scripts/tsconfig.json` en draaien alleen via tsx.

**Regel voor nieuwe bewijsscripts:** importeer géén api-server-source; test via geauthenticeerde HTTP-endpoints (Sessie-klasse patroon uit `bewijs-transacties-15-16.ts`) + directe `@workspace/db`-queries. Constantes zoals MAX_OPEN_ADVIEZEN lokaal definiëren met verwijzing naar de bron.

**Why:** completion code review wijst werk af als de scripts-typecheck rood is; cross-project source-imports zijn daar de oorzaak. Structurele ontkoppeling (gedeeld package of verhuizing naar api-package) is een open opruimtaak.
