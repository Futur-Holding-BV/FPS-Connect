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
