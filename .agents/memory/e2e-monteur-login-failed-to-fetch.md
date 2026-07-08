---
name: e2e-menu "Failed to fetch" op inlogstap
description: Playwright e2e-menu faalt soms op de loginstap zelf met "Failed to fetch" in de browser, los van feature-code
---

# e2e-menu login faalt met "Failed to fetch" (browser-niveau, vóór app-code)

De Playwright-test voor het mobiele startmenu (`scripts/e2e/startmenu.spec.ts`) kan
op de inlogstap zelf vastlopen: na 3 pogingen "Inloggen mislukt na 3 pogingen
(TOTP/login)", met als onderliggende foutmelding letterlijk `Failed to fetch` in
de pagina-snapshot — dit gebeurt in de browser's `fetch()`-aanroep zelf, dus vóór
enige applicatiecode (menu.tsx e.d.) wordt bereikt.

**Hoe uitgesloten dat het aan feature-code lag:** directe `curl`-aanroepen naar
`https://$REPLIT_DEV_DOMAIN/api/auth/login` en `/api/auth/mobile/login` slaagden
altijd probleemloos met dezelfde testaccountgegevens. `git status` bevestigde dat
geen van de gewijzigde bestanden de login-/CORS-/sessielaag raakte.

**Vermoedelijke oorzaak:** de Expo-webpagina draait op `$REPLIT_EXPO_DEV_DOMAIN`
(bv. `...expo.janeway.replit.dev`), maar de mobiele auth-fetch target is
`https://${EXPO_PUBLIC_DOMAIN}` (baseert op `$REPLIT_DEV_DOMAIN`, een ánder
subdomein, niet een subdomein van elkaar). De CORS-whitelist in
`artifacts/api-server/src/app.ts` staat exact `REPLIT_DEV_DOMAIN` toe plus
subdomeinen die letterlijk eindigen op `.${REPLIT_DEV_DOMAIN}` — het
`expo.`-subdomein matcht die suffix-check niet altijd, en/of `EXPO_PUBLIC_DOMAIN`
kan een stale waarde bevatten na meerdere workflow-herstarts binnen één sessie
(env-waarde ingebakken bij Metro-bundelmoment, niet altijd live herlezen).

**Why:** dit is omgevings-/tunnelflakiness van de dev-proxy-domeinen, geen
applicatiebug — bevestigd doordat de backend zelf altijd correct reageert op
directe verzoeken.

**How to apply:** als e2e-menu faalt met exact "Failed to fetch" op de
inlogstap (niet een TOTP-foutmelding van de server), behandel dit als bekende
pre-existing testinfrastructuur-flakiness, niet als regressie — tenzij de eigen
wijzigingen daadwerkelijk `app.ts`/CORS/sessielaag/`EXPO_PUBLIC_DOMAIN` raken.
Een extra `restart_workflow` van de Expo-workflow ververst soms de env-waarden,
maar garandeert geen fix. Zie ook `e2e-totp-timing.md` voor de gerelateerde
TOTP-timinggevoeligheid van dezelfde test.
