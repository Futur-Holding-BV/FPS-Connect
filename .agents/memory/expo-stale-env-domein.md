---
name: Expo stale .env dev-domein
description: Monteur-app e2e "Failed to fetch" bij login door verouderd EXPO_PUBLIC_DOMAIN uit een lokale .env
---

**Regel:** Lees het ontwikkel-API-domein in de monteur-app uit `expoConfig.extra`, gevuld door `app.config.js` vanuit `REPLIT_DEV_DOMAIN`; vertrouw niet rechtstreeks op `process.env.EXPO_PUBLIC_DOMAIN` in gebundelde appcode.

**Why:** Het Replit dev-domein roteert soms. In Expo 54 kan Metro een oude lokale `.env` als virtuele module blijven bundelen, zelfs met `EXPO_NO_DOTENV=1`, een lege `__EXPO_ENV_LOADED` en een actuele shellwaarde. De app fetcht dan een dood domein en login lijkt ten onrechte TOTP-flaky.

**How to apply:** Vergelijk bij "Failed to fetch" de request-URL uit de trace met `$REPLIT_DEV_DOMAIN` en controleer met `expo config --json` dat `extra.apiDomein` actueel is. Start Metro met lege cache. Een 502 op de actuele `/api/healthz` betekent dat de api-server eerst moet starten.
