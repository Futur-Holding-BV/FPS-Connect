# E2E: radiaal startmenu (login + waaier + doorlinken)

Geautomatiseerde controle dat het FPS-startmenu achter de verplichte TOTP-login
opent en correct doorlinkt. Draait tegen de **draaiende Expo monteur-app** via de
Playwright-gebaseerde `runTest`-testagent (de UI-testvoorziening van het platform).

## Voorbereiding (eenmalig per omgeving)

Richt het vaste e2e-testaccount in en lees een geldige TOTP-code uit:

```
pnpm --filter @workspace/scripts run e2e-monteur-testaccount
```

Dit maakt/bijwerkt account `e2e-menu@fps.local` met wachtwoord `E2eMenuTest!2026`,
verplichte 2FA (vaste secret) en volledige bevoegdheden zodat elke menukeuze ook
echt doorlinkt. Het script print een actuele TOTP-code.

> TOTP-codes verlopen (~60-90s). Genereer de code vlak vóór de testrun. Bij een
> trage koude Expo-load kan de eerste poging op "Onjuiste code" stuklopen; gebruik
> dan een code van het volgende 30s-venster (server accepteert window ±1) of draai
> de run opnieuw.

## Testagent-URL

De Expo-app draait buiten de `/api`-proxy op het Expo dev-domein
(`https://$REPLIT_EXPO_DEV_DOMAIN/`). Gebruik die volledige URL als navigatiedoel.

## Testplan (mobiel viewport 400x720)

1. Nieuwe browsercontext, navigeer naar de Expo-app-URL.
2. Vul direct in en verstuur: e-mail `e2e-menu@fps.local`, wachtwoord
   `E2eMenuTest!2026`, authenticatiecode = de gegenereerde TOTP. Klik **Inloggen**.
3. Controleer: loginformulier weg, header toont "E2E Test Monteur", centrale knop
   `data-testid="radiaal-fps"` zichtbaar. De waaier staat standaard open; alle zes
   items zichtbaar via `data-testid`: `radiaal-gebouwen`, `radiaal-personeel`,
   `radiaal-uren`, `radiaal-planning`, `radiaal-fabrikanten`, `radiaal-berichten`.
4. Klik `radiaal-sluiten`; controleer dat de hulptekst
   "Tik op FPS om het menu te openen" verschijnt (waaier ingeklapt).
5. Klik `radiaal-fps`; controleer dat de zes items weer zichtbaar zijn
   (de FPS-knop opent de waaier).
6. Doorlinken — klik per item, controleer de route, ga terug en heropen de waaier
   (`radiaal-fps`) indien ingeklapt:
   - `radiaal-gebouwen` -> `/gebouwen`
   - `radiaal-personeel` -> `/hrm`
   - `radiaal-fabrikanten` -> `/fabrikanten`
   - `radiaal-uren` -> `/binnenkort`
   - `radiaal-planning` -> `/binnenkort`
   - `radiaal-berichten` -> `/binnenkort`

Vanwege de stap-/tijdslimieten van de testagent is het praktisch om dit in
kleinere runs te splitsen (bijv. open/sluiten + zes items zichtbaar; daarna de
drie echte routes; daarna de drie `/binnenkort`-routes), elk met een eigen login.
