---
name: Stale EXPO_PUBLIC_DOMAIN in monteur-app .env
description: e2e-monteur "Failed to fetch" bij login = vaak stale .env-domein of Metro-cache, geen codebug
---

Symptoom: e2e-monteur faalt deterministisch met "Inloggen mislukt na 3 pogingen (TOTP/login)" en het paginasnapshot toont "Failed to fetch" onder het 2FA-veld.

**Why:** `artifacts/monteur-app/.env` (gitignored) bevat een hardcoded `EXPO_PUBLIC_DOMAIN` uit een eerdere/andere (taak)omgeving. Taakomgevingen krijgen een dev-domein met extra suffix (bv. `...-hkddke76.janeway.replit.dev`); het stale domein wijst naar de hoofd-workspace. De app fetcht dan cross-origin naar het verkeerde domein → CORS-weigering → browser toont "Failed to fetch". Metro inlinet EXPO_PUBLIC_* bij transform en cachet dat in `/tmp/metro-cache`, dus ook na env-fix blijft het oude domein staan tot de cache weg is.

**How to apply:**
1. Diagnose: pak `trace.zip` uit test-results en grep de request-URL's in `0-trace.network` — vergelijk het API-domein met `$REPLIT_DEV_DOMAIN`.
2. Fix: `printf 'EXPO_PUBLIC_DOMAIN=%s\n' "$REPLIT_DEV_DOMAIN" > artifacts/monteur-app/.env`, dan `rm -rf /tmp/metro-cache /tmp/metro-file-map-*` en de expo-workflow herstarten.
3. Verifieer via de web-bundle: `grep -c '<oud-domein>' bundel` moet 0 zijn.

Bijvangst: een door ShellExec/CI gekilde e2e-run laat `/tmp/e2e-suite.lock` achter (mutex, 20 min stale-drempel) — volgende suite wacht dan 15 min en faalt; lock handmatig verwijderen mag.
