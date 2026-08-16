---
name: Expo stale .env dev-domein
description: Monteur-app e2e "Failed to fetch" bij login door verouderd EXPO_PUBLIC_DOMAIN uit een lokale .env
---

**Regel:** `artifacts/monteur-app/.env` mag nooit een hardcoded `EXPO_PUBLIC_DOMAIN` bevatten; de workflow zet die var zelf uit `$REPLIT_DEV_DOMAIN`.

**Why:** Het Replit dev-domein roteert soms (segment als `-u9tai8zl` erbij). Een oude .env-waarde wordt door Metro als `.env`-module in de bundel gebakken en wint van de shell-env → de app fetcht een dood domein → login toont "Failed to fetch" en de e2e-monteur-suite faalt 3×3 pogingen lang, wat op TOTP/login-flakiness lijkt.

**How to apply:** Bij "Failed to fetch" in de monteur-app login: trace.zip uitpakken en de request-URL vergelijken met `$REPLIT_DEV_DOMAIN`. Wijkt het domein af → `.env` verwijderen, Metro-cache wissen (`node_modules/.cache`, `/tmp/metro-*`) en expo-workflow herstarten; controleer de web-bundle op de oude domeinstring. Ook: 502 op `https://$REPLIT_DEV_DOMAIN/api/healthz` betekent api-server-workflow down — eerst herstarten vóór e2e-validatie.
