---
name: Orval enabled/select-opties
description: Pre-existing TypeScript fout bij { query: { enabled } } of { query: { select } } pattern in gegenereerde Orval hooks.
---

## Probleem
`{ query: { enabled: boolean } }` geeft `TS2741: Property 'queryKey' is missing` bij alle Orval-gegenereerde hooks in dit project. Dit is een pre-existing type-mismatch: de gegenereerde hooks gebruiken `UseQueryOptions` (vereist `queryKey`) terwijl eigenlijk `Partial<UseQueryOptions>` bedoeld is.

**Why:** Vite werkt gewoon ondanks TS-fout. Maar typisch TypeScript type-check via CI/CD geeft fouten. Niet fixen in gegenereerde bestanden.

**How to apply:** Gate op UI-niveau (`{isBeheerder && <Sectie />}`) in plaats van `enabled` in de hook-opties. Of accepteer de TS-fout als pre-existing (ze staan al in `voorzieningen/detail.tsx`, `voorzieningen/nieuw.tsx`, `voorzieningen/qr.tsx`).

## Schone fix zonder TS-fout (voorkeur voor NIEUWE code)
Geef de gegenereerde queryKey-helper mee zodat het type compleet is:
```ts
useGetVolgendSpotnummer(Number(gebouwId), {
  query: { enabled: !!gebouwId, queryKey: getGetVolgendSpotnummerQueryKey(Number(gebouwId)) },
});
```
Elke operation heeft een `getGet<OperationId>QueryKey(...)` export. Zo voeg je `enabled` toe zonder een nieuwe TS2741 te introduceren. **Why:** taakeis "geen nieuwe typecheck-fouten" terwijl je conditioneel moet fetchen.

## Zelfde fix geldt voor `select`
`{ query: { select: (data) => ... } }` geeft dezelfde `TS2741`. Fix identiek: `queryKey: getList<Naam>QueryKey(...)` meegeven. Toegepast om API-hook-data defensief naar een array te normaliseren (`Array.isArray(data) ? data : []`) in app-brede contexts/shell-componenten die anders bij een onverwachte non-JSON respons (bv. lokale dev zonder Vite-proxy naar /api) een `TypeError` op `.find()`/`.map()` geven.

## Element-type afleiden van een list-hook
Gebruik NIET `NonNullable<ReturnType<typeof useListXxx>["data"]>[number]` om het element-type te krijgen — dat lost op naar `{}` en geeft `TS2537: Type '{}' has no matching index signature for type 'number'`. Importeer in plaats daarvan het gegenereerde model-type rechtstreeks (bv. `import type { GebouwPartij } from "@workspace/api-client-react"`). De list-functies retourneren `Promise<Model[]>`, dus het model-type is altijd beschikbaar. **Why:** kostte 2 pogingen; de hook-returntype is te generiek om te indexeren op module-niveau.
