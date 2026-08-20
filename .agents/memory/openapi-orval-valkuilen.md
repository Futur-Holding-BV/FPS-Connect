---
name: OpenAPI/Orval-valkuilen (verzamelindex)
description: Wegwijzer naar Orval/OpenAPI codegen-valkuilen; lees het betreffende bestand bij API-schemawerk.
---
- orval-index-fix.md — fix-zod-index.mjs in codegen houden (dubbele exports)
- orval-enabled.md — query.enabled/select vergt queryKey meegeven (TS2741)
- openapi-inline-body-conflict.md — altijd named $ref schemas voor bodies (TS2308)
- api-zod-types-conflict.md — index.ts alleen export * from generated/api
- openapi-pad-prefix.md — paden zonder /api/-prefix (Orval baseUrl voegt toe)
- js-yaml-override.md — security-override in pnpm-workspace.yaml mag js-yaml voor orval nooit naar 5.x duwen (default-export weg → codegen crasht); houd `js-yaml@>=4.0.0 <=4.1.1: '>=4.2.0 <5'`
- orval-generated-baseline-drift.md — controleer codegen-numstat vóór commit; een achterlopende generated baseline mag een kleine contractwijziging niet veranderen in onreviewbare repositorybrede churn.
