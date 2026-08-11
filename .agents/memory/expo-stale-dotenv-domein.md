---
name: Expo stale .env override domein
description: Onbetrouwbare "Failed to fetch" in monteur-app/e2e-menu door verouderd untracked .env dat EXPO_PUBLIC_DOMAIN pint op een oud dev-domein.
---
Een untracked `artifacts/monteur-app/.env` met `EXPO_PUBLIC_DOMAIN=<oud domein>` overschrijft de workflow-env; na rotatie van het Replit-dev-domein wijst de bundle dan naar een dood/CORS-blokkerend host → alle app-fetches `Failed to fetch`, e2e-menu faalt consistent.

**Why:** Expo laadt .env bij bundelen; het bestand was ooit handmatig aangemaakt en bleef achter na domeinrotatie (aug 2026, 3x CI-faal op login).
**How to apply:** bij consistente "Failed to fetch" in de monteur-app eerst de fetch-URL in Playwright request-log vergelijken met $REPLIT_DEV_DOMAIN; verschilt het host-suffix → zoek naar stale .env / gecachte bundle en verwijder die. Curl-bewijs dat de API werkt sluit dit NIET uit. Bevestigd (10 aug 2026): `rm artifacts/monteur-app/.env` maakte e2e-menu direct weer groen na 3 opeenvolgende login-faalruns.

**Herbevestigd (11 aug 2026):** bestand dook opnieuw op (datum 22 jun) en brak e2e-menu 2x in validatie; `rm` maakte de run direct groen.

**3e recidive (11 aug 2026, later op de dag):** zelfde bestand (mtime 22 jun) brak e2e-menu opnieuw 3x in taakvalidatie; `rm` → direct groen. Iets herschept dit bestand of git-checkout brengt het terug — bij elke e2e-menu-faal op login éérst `ls artifacts/monteur-app/.env` checken.
**4e recidive (11 aug 2026, taak-900-validatie):** zelfde stale bestand brak e2e-menu opnieuw; `rm` → direct groen. Bij elke e2e-menu login-faal standaard eerst `rm artifacts/monteur-app/.env`.
