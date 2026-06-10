---
name: Expo typed routes regeneratie
description: monteur-app typecheck faalt na toevoegen/verwijderen van een route-bestand tot .expo/types regenereert
---

In `artifacts/monteur-app` staat `experiments.typedRoutes: true` (app.json). De route-union leeft in het gegenereerde `.expo/types/router.d.ts`.

**Regel:** na het toevoegen of verwijderen van een bestand onder `app/` (bv. `app/document/[tekeningId].tsx`) faalt `pnpm run typecheck` met `TS2345` op `router.push("/nieuwe-route/...")` omdat de nieuwe route nog niet in de union staat.

**Waarom:** het types-bestand wordt alleen geschreven door de draaiende expo dev-server, niet door tsc.

**Hoe toepassen:** herstart de workflow `artifacts/monteur-app: expo` (genereert `router.d.ts` opnieuw, ~5-8s) en draai dan opnieuw typecheck. Niet handmatig `router.d.ts` editen — wordt overschreven.
