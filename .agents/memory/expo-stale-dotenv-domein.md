---
name: Expo stale .env override domein
description: Onbetrouwbare "Failed to fetch" in monteur-app/e2e-menu door verouderd untracked .env dat EXPO_PUBLIC_DOMAIN pint op een oud dev-domein.
---
Een untracked `artifacts/monteur-app/.env` met `EXPO_PUBLIC_DOMAIN=<oud domein>` overschrijft de workflow-env; na rotatie van het Replit-dev-domein wijst de bundle dan naar een dood/CORS-blokkerend host → alle app-fetches `Failed to fetch`, e2e-menu faalt consistent.

**Why:** Expo laadt .env bij bundelen; het bestand was ooit handmatig aangemaakt en bleef achter na domeinrotatie (aug 2026, 3x CI-faal op login).
**How to apply:** bij consistente "Failed to fetch" in de monteur-app eerst de fetch-URL in Playwright request-log vergelijken met $REPLIT_DEV_DOMAIN; verschilt het host-suffix → zoek naar stale .env / gecachte bundle en verwijder die. Curl-bewijs dat de API werkt sluit dit NIET uit.
