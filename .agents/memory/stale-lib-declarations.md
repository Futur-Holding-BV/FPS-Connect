---
name: Stale lib declarations na merge
description: Phantom TS2305 "no exported member" op nieuwe API-hooks na een task-merge = stale composite lib-build, niet kapotte code; fix met codegen/typecheck:libs.
---

# Stale lib declarations na merge

Symptoom: na een task-merge die nieuwe OpenAPI-operaties toevoegt, faalt
`pnpm --filter @workspace/firevault run typecheck` met
`TS2305: Module '@workspace/api-client-react' has no exported member 'useXxx'`,
terwijl de hook WEL in `lib/api-client-react/src/generated/api.ts` staat (grep bevestigt het).

Oorzaak: de composite lib-declaraties (`.d.ts` / `.tsbuildinfo`) zijn stale. De
post-merge setup (`scripts/post-merge.sh`) draait alleen `drizzle-kit push`, NIET
codegen of `typecheck:libs`. De incrementele `tsc --build`-cache reflecteert de
nieuwe hooks dus niet, dus leaf-artifacts (firevault) zien de export niet.

Fix: `pnpm --filter @workspace/api-spec run codegen` (eindigt met
`pnpm -w run typecheck:libs` → `tsc --build` en herbouwt de lib-declaraties), of
direct `pnpm run typecheck:libs`. Daarna pas de leaf-typecheck vertrouwen.

**Why:** de gegenereerde `api.ts` wordt gecommit, maar de lib-build-output is lokaal
en gitignored; na een merge moet je de libs herbouwen voordat je de leaf-typecheck
gelooft. Dezelfde klasse als de pnpm-workspace-regel "missing @workspace/db exports
usually mean stale lib declarations, not bad imports".

**How to apply:** zie je TS2305 op een nieuw toegevoegde hook, grep dan eerst in
`api.ts`. Staat de hook er → herbouw libs (codegen/typecheck:libs), ga NIET de
applicatiecode "repareren". Een task-agent die ditzelfde meldt als "pre-existing
fout" heeft waarschijnlijk gewoon een stale lib-cache.
