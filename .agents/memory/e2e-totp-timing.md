---
name: E2E TOTP login timing
description: How to log in through the UI past mandatory TOTP in runTest e2e flows without the code expiring
---

# E2E login achter verplichte TOTP

De web- en monteur-app loginflows vereisen een geldige TOTP-code. In een
`runTest` (Playwright) e2e is de koude Expo-/web-load in een verse browsercontext
traag (kan 30-60s duren), waardoor een net gegenereerde TOTP-code al verlopen kan
zijn vóór de agent op Inloggen klikt → server geeft "Onjuiste code, probeer
opnieuw".

**Regel:** genereer de TOTP-code voor het VOLGENDE 30s-venster
(`t = Date.now() + 30000`), liefst vlak na een vensgrens. De server staat
`authenticator.options = { window: 1 }` (±1 stap), dus een next-window code wordt
nu al geaccepteerd en blijft geldig tot het einde van venster N+2 ≈ ~90s. Een
code voor het huidige venster geeft maar ~30-60s en loopt op trage runs stuk.

**Why:** TOTP step=30s, window:1 → een code is geldig tijdens stap N-1/N/N+1.
Met de cold-load latency van runTest is 90s nodig, geen 60s.

**How to apply:** richt een vast e2e-account in via
`pnpm --filter @workspace/scripts run e2e-monteur-testaccount` (idempotent, vaste
TOTP-secret, volledige bevoegdheden). Splits lange menu-/navigatieplannen in
kleinere runs (elk een eigen login) vanwege de stap-/tijdslimiet van de testagent
én de 600s-timeout van het code_execution-venster. De Expo-app draait buiten de
`/api`-proxy: navigeer naar de volledige `https://$REPLIT_EXPO_DEV_DOMAIN/`-URL.
Testplan: `artifacts/monteur-app/e2e/startmenu.md`.
