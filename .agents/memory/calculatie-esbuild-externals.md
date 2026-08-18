---
name: Workspace-pakketten & api-server bundel
description: Workspace-pakketten NOOIT in build.mjs externals (prod-crash ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING); wel pnpm install per artifact.
---

# Workspace-pakketten in de api-serverbundel

## Rule
Workspace-pakketten (`@workspace/calculatie`, `@workspace/db`, …) moeten door esbuild MEEGEBUNDELD worden — zet ze NOOIT in de `external`-lijst van `artifacts/api-server/build.mjs`.

**Why:** op 18 aug 2026 stond `@workspace/calculatie` in externals. In het productie-Docker-image staat het pakket dan als onvertaalde TypeScript ín node_modules en weigert Node het te laden (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`): api crashte bij opstarten, hele site plat. In dev merk je dit NIET: de pnpm-symlink lost op naar `lib/<pakket>/src` buiten node_modules, waar Node 24 types wél zelf stript. Lokale prod-sim met de dev-node_modules bewijst dus niets over dit faalpad — grep de dist op `from "@workspace/` (moet 0 zijn).

**How to apply:**
- Nieuw workspace-pakket gebruiken in api-server/firevault: `pnpm install --filter <artifact>` zodat de symlink bestaat (anders faalt tsc/typecheck met "Cannot find module").
- esbuild bundelt de TS-bron gewoon mee; externals zijn alleen voor echte npm-deps met native/dynamiek-problemen.
- Controle na build: `grep -c '@workspace/' artifacts/api-server/dist/index.mjs` → 0, en de dist bevat herkenbare functies uit het pakket.
