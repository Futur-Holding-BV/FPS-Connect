---
name: Expo stale .env override domein
description: Onbetrouwbare "Failed to fetch" in monteur-app/e2e-menu door verouderd untracked .env dat EXPO_PUBLIC_DOMAIN pint op een oud dev-domein.
---
Een untracked `artifacts/monteur-app/.env` met `EXPO_PUBLIC_DOMAIN=<oud domein>` overschrijft de workflow-env; na rotatie van het Replit-dev-domein wijst de bundle dan naar een dood/CORS-blokkerend host → alle app-fetches `Failed to fetch`, e2e-menu faalt consistent.

**Why:** Expo bakt .env in bij bundelen; een handmatig aangemaakt bestand overleeft domeinrotaties en duikt herhaaldelijk opnieuw op (merge/checkout brengt het terug).
**How to apply:** bij e2e-menu login-falen ("Failed to fetch") altijd eerst `ls artifacts/monteur-app/.env` — bestaat het, verwijder het vóór verder debuggen. Curl-bewijs dat de API werkt sluit dit NIET uit. Structurele preventie: het bestand hoort niet in de repo/werkruimte; nooit een .env in monteur-app aanmaken (workflow-env is de bron).
