---
name: EXPO_PUBLIC_DOMAIN staleness
description: EXPO_PUBLIC_DOMAIN in .env kan stale worden; mismatch veroorzaakt "Failed to fetch" in de monteur-app.
---

# EXPO_PUBLIC_DOMAIN staleness

## De regel
- `artifacts/monteur-app/.env` bevat `EXPO_PUBLIC_DOMAIN` — deze waarde kan stale worden als de Replit-sessie opnieuw opstart en een ander subdomein krijgt.
- Het dev-script in `package.json` zet `EXPO_PUBLIC_DOMAIN=$REPLIT_DEV_DOMAIN` dynamisch in, maar als Metro-bundler de cache gebruikt (en `EXPO_PUBLIC_DOMAIN` al gezet is via `.env`), kan de stale `.env`-waarde winnen.
- Resultaat: de monteur-app fetcht naar het verkeerde domein → "Failed to fetch" voor alle API-calls.

## Waarom
- `REPLIT_DEV_DOMAIN` verandert tussen sessies (bevat een `-oxbb7nno`-achtig suffix dat roteert).
- Metro-bundler bakt `EXPO_PUBLIC_*` in op bundle-time; stale waarde → fout baked in.

## Hoe toepassen
1. Houd `.env` in sync met de actieve `$REPLIT_DEV_DOMAIN` — fix via `sed -i "s|EXPO_PUBLIC_DOMAIN=.*|EXPO_PUBLIC_DOMAIN=${REPLIT_DEV_DOMAIN}|" artifacts/monteur-app/.env`.
2. Herstart daarna de Expo-workflow zodat Metro een verse bundle maakt.
3. Voeg ook `REPLIT_EXPO_DEV_DOMAIN` toe aan `TOEGESTANE_ORIGINS` in `artifacts/api-server/src/app.ts` — het Expo-webdomein heeft een ander subdomain (`*.expo.janeway.replit.dev`) dan het gewone dev-domein.
