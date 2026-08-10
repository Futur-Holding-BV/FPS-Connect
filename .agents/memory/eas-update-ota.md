---
name: EAS Update OTA valkuilen
description: Durable lessen bij eas update in dit monorepo (env-inbakken, babel-preset versie, stale Metro-cache)
---

# EAS Update OTA valkuilen

- `eas update` bakt `EXPO_PUBLIC_*` in bij het exporteren van de bundle; `eas.json` `build.env` geldt ALLEEN voor EAS Build. Elke plek die een OTA-update publiceert moet `EXPO_PUBLIC_DOMAIN=connect.fps-one.nl` zelf in de omgeving zetten, anders breekt de API-config voor monteurs. **Why:** review-afwijzing; meerdere app-paden lezen het env-veld direct.
- Babel-presets die in babel.config.js staan moeten als directe dep in de app staan én SDK-matched zijn (SDK 54 → babel-preset-expo 54.x; latest = verkeerde major).
- hermesc-fout "private properties are not supported" bij export = stale Metro transform-cache; oplossen met `--clear-cache`, niet met preset-wijzigingen.
- OTA dekt alleen JS; native wijzigingen = nieuwe APK (runtimeVersion policy appVersion).
