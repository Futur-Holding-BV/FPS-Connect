---
name: Google Maps embed patroon
description: Hoe Google Maps satellietzicht in de gebouw-detailpagina werkt — API-sleutel blijft server-side.
---

## Regel
De `GOOGLE_MAPS_API_KEY` mag nooit naar de frontend. Backend endpoint `GET /gebouwen/:id/kaart` berekent de embed-URL en stuurt die terug als `{ embed_url }`. De frontend plaatst de URL in een `<iframe>`.

**Why:** Google Maps API-sleutels zijn betalend; blootstelling in de browser geeft misbruik-risico.

**How to apply:**
- Prioriteit lat/lng coördinaten → `maps/embed/v1/view?center=LAT,LNG&zoom=19&maptype=satellite`
- Fallback op adres+stad → `maps/embed/v1/place?q=ADRES+STAD&maptype=satellite`
- Als geen van beide beschikbaar: 404 teruggeven
- Dezelfde toegangscontrole als GET /gebouwen/:id (monteur/controleur check op toewijzing)

## Google Cloud API-configuratie (operationeel)
De app roept server-side meerdere losse Google API's aan: **Geocoding** + **Maps Static** (AI-invullen in gebouw-ai.ts), **Maps Embed** (locatiekaart), **Street View Static** (verdiepingen tellen). Elke API moet apart (a) ingeschakeld zijn in de Library én (b) in de "API restrictions"-witte lijst van de sleutel staan.

**Why:** twee verschillende foutmeldingen wezen op twee verschillende oorzaken: `"This API is not activated on your API project"` = niet ingeschakeld in Library; `REQUEST_DENIED "check the API restrictions settings of your API key"` = wél ingeschakeld maar niet in de sleutel-witte lijst. Static Maps werkte terwijl Geocoding faalde op dezelfde sleutel → bewijs dat het de per-sleutel restrictielijst was, niet de Library.

**How to apply:**
- `GOOGLE_KEY` wordt op module-niveau gelezen in gebouw-ai.ts → na toevoegen/wijzigen van de secret is een **API-server-restart verplicht**.
- Diagnose: roep de 3-4 endpoints direct aan met de sleutel via node fetch om per API status te zien (geen login nodig).
- Street View: check eerst `streetview/metadata` (gratis, status !== "OK" → geen dekking → null, AI valt terug op schatting). Bereken `heading` uit pano-locatie → gebouw zodat de gevel in beeld komt.
