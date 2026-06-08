---
name: Sync context patroon
description: SyncProvider implementatie voor Expo offline-sync met directe sync, 5-min vangnet en connectiviteitscheck.
---

## Patroon
- `SyncProvider` in `artifacts/monteur-app/context/sync.tsx`
- Connectiviteitscheck via `fetch('/api/healthz', { signal: AbortSignal.timeout(4000) })` — geen extra pakket nodig
- `forceerSync()` aanroepen na elke bewaar-actie in de plattegrond screen
- `AppState` listener triggert `forceerSync()` bij terugkeer naar voorgrond
- 5-minuten interval als vangnet: `setInterval(() => forceerSync(), 5 * 60 * 1000)`
- `SyncStatus` enum: `gesynchroniseerd | opgeslagen | synchroniseert | wacht_op_verbinding`
- `SyncStatusBadge` component in `artifacts/monteur-app/components/SyncStatusBadge.tsx`

**Why:** Direct sync zodra verbinding beschikbaar is; offline work flows via AsyncStorage wachtrij in `syncQueue.ts`.

**How to apply:** Wrap app root met `<SyncProvider>`, gebruik `useSync()` overal; roep `forceerSync()` aan na elke mutatie die naar de server moet.
