---
name: Orval enabled-opties
description: Pre-existing TypeScript fout bij { query: { enabled } } pattern in gegenereerde Orval hooks.
---

## Probleem
`{ query: { enabled: boolean } }` geeft `TS2741: Property 'queryKey' is missing` bij alle Orval-gegenereerde hooks in dit project. Dit is een pre-existing type-mismatch: de gegenereerde hooks gebruiken `UseQueryOptions` (vereist `queryKey`) terwijl eigenlijk `Partial<UseQueryOptions>` bedoeld is.

**Why:** Vite werkt gewoon ondanks TS-fout. Maar typisch TypeScript type-check via CI/CD geeft fouten. Niet fixen in gegenereerde bestanden.

**How to apply:** Gate op UI-niveau (`{isBeheerder && <Sectie />}`) in plaats van `enabled` in de hook-opties. Of accepteer de TS-fout als pre-existing (ze staan al in `voorzieningen/detail.tsx`, `voorzieningen/nieuw.tsx`, `voorzieningen/qr.tsx`).
