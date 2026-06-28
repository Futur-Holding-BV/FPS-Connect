---
name: Offline-first monteur app patroon
description: Architectuur en gotchas voor de offline-first implementatie in de FPS Monteur Expo app
---

## Kernprincipes

- **AsyncStorage cache** (`fps_offline_v1:*`): planning, werkorders, opname-items, voorzieningen
- **SyncQueue** (`fps_sync_queue_v2`): alle offline mutaties als `WachtrijItem` (SyncActie & metadata)
- **OfflineProvider** detecteert connectivity via fetch `/healthz` met AbortSignal.timeout(3000)
- **expo-file-system/legacy** importpath voor `documentDirectory` e.d. (v56 splitsing)

## Type-gotchas

- `WachtrijItem = SyncActie & { id: string; ... }` — gebruik NOOIT `id: number` in SyncActie-varianten; gebruik `urenId`/`werkdagId`/`voorzieningId` om id-conflicten te vermijden
- `create_uren` slaat de volledige API-body op als `payload: Record<string, unknown>` (geen specifieke velden); sync handler stuurt `JSON.stringify(item.payload)` direct
- `OfflineUren.payload` bevat de volledige API-body (datum, begin_tijd, eind_tijd, pauze_minuten, etc.)
- `voegOfflineUrenToe(datum, payload, omschrijving?)` — nieuwe signature (niet meer object-arg)

## expo-file-system v56

- ALTIJD `import * as FileSystem from "expo-file-system/legacy"` voor `documentDirectory`, `cacheDirectory`, `makeDirectoryAsync`, `writeAsStringAsync`, `copyAsync`, `uploadAsync`, etc.
- De nieuwe modulaire API (`from "expo-file-system"`) heeft andere exports en mist de genoemde constants

## Offline mutatie-flow

1. Schrijf lokaal naar cache (`patchWerkorderStatusLokaal`, `patchOpnameItemLokaal`, etc.)
2. Voeg toe aan wachtrij (`voegToeAanWachtrij({type: "...", ...})`)
3. Roep `herlaadAantal()` aan voor badge-update
4. SyncContext verwerkt de wachtrij bij reconnect (NetInfo + interval)

## Schermen

- `werkdag/index.tsx`: `leesWerkorders()`/`leesPlanning()` direct uit offlineCache (niet via context)
- `werkdag/[id].tsx`: gecachedWerkorder cast via `as unknown as typeof werkorder`
- `opname/item/[itemId].tsx`: lokale fotos in FileSystem + "Lokaal" badge; opslaan queues patch_opname_item
- `uren.tsx (UrenFormulier)`: async opslaan() met offline intercept; update_uren gebruikt urenId
- `planning.tsx`: download-knop via `downloadVandaag()` uit OfflineContext
