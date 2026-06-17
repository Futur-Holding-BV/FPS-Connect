---
name: Kwaliteitscheck script
description: Valkuilen bij pnpm audit parsing en route-teller in kwaliteitscheck.ts
---

## pnpm audit severity parsing

Gebruik uitsluitend de plain-text samenvatting voor severity-detectie:

```
Severity: 1 low | 7 moderate | 3 high
```

NIET `pnpm audit --json` — de JSON-output bevat "critical" als schema-waarde
ook als er geen kritieke kwetsbaarheden zijn (vals-positief).

Correcte regels:
```typescript
const auditSamenvatting = audit.output.split("\n").find((l) => l.startsWith("Severity:")) ?? "";
const aantalCritical = parseInt(auditSamenvatting.match(/(\d+) critical/)?.[1] ?? "0");
const aantalHigh = parseInt(auditSamenvatting.match(/(\d+) high/)?.[1] ?? "0");
```

**Why:** `pnpm audit --json` output bevat het woord "critical" als mogelijke enum-waarde
in de schema-metadata, zelfs zonder kritieke packages. `|| pnpm audit 2>&1` als fallback
verdubbelt de output en maakt parsing nog moeilijker.

## Route-teller false positive

`router.use(requireAuth)` is middleware, geen router-import → telt wél als `router.use()` aanroep.

Correcte regex:
- Imports: `/import \w+Router from/g` — telt alleen variabelen die eindigen op "Router"
- Registraties: `/router\.use\(\w+Router\)/g` — telt alleen aanroepen met Router-variabelen

**Why:** `import \w+ from` + `router\.use\(` geeft mismatch omdat requireAuth ook een
`router.use()` triggert maar geen router-import heeft.

## Bekende pre-existing bevindingen (acceptabel)

- `xlsx` 2× HIGH (Prototype Pollution + ReDoS): geen patch beschikbaar (`Patched versions: <0.0.0`)
- `form-data` 1× HIGH: transitieve dep van @google-cloud/storage, geen directe fix
- `postcss` MODERATE: in @expo/cli dev-dep, niet in runtime
- 8× TS2367 in firevault: Rol-enum legacy (controleur/monteur verwijderd)
- 132× TS7030 in api-server: pre-existing in alle route-handlers

**How to apply:** Niet escaleren naar "kritiek/hoog" tenzij patch beschikbaar.
Vermeld als "[MIDDEL] geen patch beschikbaar".
