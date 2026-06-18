---
name: OpenAPI inline request body TS2308 conflict
description: Inline request bodies in OpenAPI PATCH/POST paths veroorzaken TS2308 bij codegen omdat Orval zowel een Zod-const in api.ts als een TypeScript type in types/ genereert met dezelfde naam, die beide re-exported worden uit de barrel index en conflicteren.
---

## Regel

Gebruik **nooit** inline `content.application/json.schema` objecten in PATCH/POST paths in openapi.yaml. Gebruik altijd een named `$ref` schema.

**Fout (inline → TS2308):**
```yaml
requestBody:
  content:
    application/json:
      schema:
        type: object
        properties:
          notities:
            type: string
```

**Goed (named $ref → geen conflict):**
```yaml
requestBody:
  content:
    application/json:
      schema:
        $ref: '#/components/schemas/WeekStaatPatch'
components:
  schemas:
    WeekStaatPatch:
      type: object
      properties:
        notities:
          type: string
```

**Why:** Orval genereert voor een inline body zowel:
- Een Zod-schema const in `lib/api-client-react/src/generated/api.ts` (bijv. `weekstatenIdPatchBody`)
- Een TypeScript interface in `lib/api-client-react/src/generated/types/` (bijv. `WeekstatenIdPatchBody`)

Beide worden re-exported via de barrel `index.ts`. Dit geeft TS2308 ("Module has already exported a member"). Named schemas genereren alleen het type in `types/`, geen conflict.

**How to apply:** Bij elke nieuwe PATCH of POST route met een request body: definieer het schema als named component en verwijs er naar via `$ref`.
