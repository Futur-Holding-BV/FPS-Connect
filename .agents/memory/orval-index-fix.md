---
name: Orval index-herschrijving na codegen
description: orval 8.15 herschrijft lib/api-zod/src/index.ts met dubbele exports (TS2308); fix-zod-index.mjs draait in codegen-script.
---
Orval genereert bij elke codegen-run `lib/api-zod/src/index.ts` opnieuw met `export *` uit zowel `generated/api` als `generated/types/*` → TS2308 dubbele exports.

**Why:** handmatig terugzetten van index.ts werd bij elke codegen weer overschreven.

**How to apply:** `lib/api-spec/scripts/fix-zod-index.mjs` herschrijft de index naar alleen `export * from "./generated/api"` en hangt in het `codegen`-script van `lib/api-spec/package.json` (tussen orval en typecheck). Niet verwijderen; bij codegen-TS2308 eerst checken of dit script nog draait.
