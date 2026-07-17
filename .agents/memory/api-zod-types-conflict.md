---
name: api-zod index types-map conflict
description: orval 8.15 genereert zowel api.ts (Zod schemas) als types/ submap (TS types). Beide exporteren dezelfde namen → TS2308 bij export * from beide. Fix en workaround.
---

## Probleem

Orval 8.15 genereert bij de `api-zod` output (config: `schemas: { path: "generated/types", type: "typescript" }`) zowel:
- `generated/api.ts` — platte Zod-schemas (bijv. `export const ListAiVoorstellenParams = zod.object({...})`)
- `generated/types/*.ts` — TypeScript-type bestanden (bijv. `export type ListAiVoorstellenParams = {...}`)

`lib/api-zod/src/index.ts` had `export * from "./generated/api"` én `export * from "./generated/types"`. Na codegen met orval 8.15 verscheen de types/-map voor het eerst → TS2308 op elke naam die in beide bestanden voorkomt.

`export type * from "./generated/types"` lost het NIET op (TypeScript ziet de naam nog steeds dubbel).

## Fix

`lib/api-zod/src/index.ts` exporteert uitsluitend van `./generated/api`:
```ts
export * from "./generated/api";
```

Type-only const-objecten die ALLEEN in types/ staan (bijv. `DocumentStudioModelInputDocumentType`) worden inline gedefinieerd in de server-route die ze nodig heeft.

**Why:** De Zod-schemas in api.ts leveren via type-inferentie al alle TypeScript-types die clients nodig hebben. De extra types/-map is redundant voor consumenten.

**How to apply:** Na elke codegen-run: als typecheck meldt TS2308 op een naam in api-zod/src/index.ts, verwijder dan `export * from "./generated/types"` en fix kapotte server-imports door de const inline te definiëren of over te hevelen naar een utils-bestand.
