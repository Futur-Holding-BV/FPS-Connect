# FPS Monteur — Installeerbare Android-app (APK)

_MONTEURAPP_01 · aangelegd 10 augustus 2026_

## Overzicht

De monteur-app (`artifacts/monteur-app`, Expo SDK 54) wordt als **direct installeerbare APK** uitgeleverd — bewust géén Play Store, géén App Store, géén iOS-build. De build draait via **EAS Build** (Expo Application Services) op de servers van Expo; updates zonder herinstallatie lopen via **EAS Update**.

| Onderdeel | Waarde |
|---|---|
| Android-package | `nl.fpsone.monteur` |
| Build-profiel | `production` in `artifacts/monteur-app/eas.json` (buildType **apk**, nooit AAB) |
| Productie-API | `connect.fps-one.nl` — hard afgedwongen in `lib/apiDomein.ts` (`__DEV__ === false` ⇒ altijd productiedomein, ongeacht env) |
| Update-kanaal | `production` (EAS Update) |
| Runtime-versie | policy `appVersion` (nieuwe native modules ⇒ versie ophogen ⇒ nieuwe APK) |

## Domein-garantie (stale-.env-valkuil)

`EXPO_PUBLIC_DOMAIN` wordt in `eas.json` op `connect.fps-one.nl` gezet, maar de echte borging zit in `lib/apiDomein.ts`: in een release-build (`__DEV__ === false`) wordt `process.env.EXPO_PUBLIC_DOMAIN` genegeerd en altijd `connect.fps-one.nl` gebruikt. Een achtergebleven `.env` met een Replit-domein kan een productie-APK dus niet vergiftigen.

**Controle in de gebouwde app:** open Menu → App-informatie. Onder "Over de applicatie" staat de regel **Server** met het domein waar de app werkelijk tegen praat. Daar hoort `connect.fps-one.nl` te staan.

## Meest recente build

| Veld | Waarde |
|---|---|
| **APK-downloadlink** | [lDusgGleOPhFr0s-qrs1uxqWsrSj6YSVjczUDWMLyNY.apk](https://expo.dev/artifacts/eas/lDusgGleOPhFr0s-qrs1uxqWsrSj6YSVjczUDWMLyNY.apk) |
| Build-ID | `a2dfe037-13e0-4cde-b6d9-67030b6e1c04` |
| Versie | 1.0.0 (versionCode 4) |
| SDK | 54.0.0 |
| Datum | 10 augustus 2026 |
| Expo-project | [@futur-holding/monteur-app](https://expo.dev/accounts/futur-holding/projects/monteur-app) |
| EAS Update-kanaal | production (actief, klaar voor OTA-updates) |

> **Directe downloadlink monteurs:** stuur de bovenstaande APK-link per e-mail/WhatsApp. Na beveiliging van de link via het Expo-dashboard is toegang eventueel te beperken.

## Bouwen (eenmalige setup + per build)

Vereist: Expo-account `futur-holding` + `EXPO_TOKEN` (Replit Secret) of ingelogde `eas-cli`.

```bash
cd artifacts/monteur-app

# Eenmalig: project koppelen aan het Expo-account + EAS Update configureren
npx eas-cli init                # zet extra.eas.projectId in app.json
npx eas-cli update:configure    # zet updates.url in app.json

# APK bouwen (Android, production-profiel)
npx eas-cli build --platform android --profile production --non-interactive
```

De buildpagina op expo.dev toont na afloop een **downloadlink naar de APK**. Versienummer (`version` in app.json, versionCode auto-increment door EAS) en bouwdatum (geïnjecteerd via `app.config.ts`) verschijnen op het informatiescherm van de app.

## Ondertekeningssleutel (keystore)

- De Android-keystore wordt **door EAS beheerd** en opgeslagen in het Expo-account van FPS (project `monteur-app`). Hij staat **nooit** in de repository.
- **Toegang:** iedereen met inloggegevens van het Expo-account (beheerd door René Vink). Toegang tot het account = toegang tot de sleutel.
- **Back-up maken (aanbevolen, eenmalig):**
  ```bash
  cd artifacts/monteur-app && npx eas-cli credentials -p android
  # kies: Keystore → Download existing keystore
  ```
  Bewaar het gedownloade `.jks`-bestand plus de wachtwoorden op een veilige plek buiten de repo (wachtwoordmanager van FPS).
- **Verlies van de keystore** betekent: dezelfde app kan nooit meer bijgewerkt worden; alle monteurs moeten een nieuw gesigneerde app opnieuw installeren.

## Bijwerken zonder herinstallatie (EAS Update)

**Automatisch (standaard):** elke productie-deploy via GitHub Actions (`.github/workflows/deploy.yml`) publiceert na een geslaagde deploy + smoketest automatisch een OTA-update op het `production`-kanaal (`npx eas-cli update --channel production --non-interactive`). Hiervoor moet het GitHub Actions secret `EXPO_TOKEN` (Expo-account `futur-holding`) zijn ingesteld; ontbreekt het, dan wordt de stap met een waarschuwing overgeslagen en moet handmatig gepusht worden.

**Handmatig (fallback):** JS/inhoudelijke wijzigingen (geen nieuwe native modules):

```bash
cd artifacts/monteur-app
npx eas-cli update --channel production --message "korte omschrijving"
```

De app haalt de update op bij de volgende start (tweede start = actief). Een nieuwe APK is **alleen** nodig als native onderdelen wijzigen (nieuw expo-native-pakket, SDK-upgrade) — hoog dan `version` in `app.json` op (runtimeVersion-policy `appVersion`) en bouw opnieuw.

## Uitleverinstructie voor monteurs

1. **APK ontvangen:** de beheerder stuurt de downloadlink van de Expo-buildpagina (of het APK-bestand zelf via e-mail/WhatsApp/USB).
2. **Installeren:** open het bestand op de telefoon. Android vraagt eenmalig om "installeren uit onbekende bron" toe te staan voor de gebruikte app (bijv. Chrome of Bestanden) → toestaan → installeren.
3. **Eerste keer inloggen:** e-mailadres + wachtwoord + authenticator-code. Daarna biedt de app aan om vingerafdruk/gezichtsherkenning in te schakelen; bij volgende starts volstaat de vingerafdruk.
4. **Versiecheck:** Menu → App-informatie → "Over de applicatie": daar staan versienummer, bouwdatum en de server (`connect.fps-one.nl`).

## Buiten scope / bekende punten

- **iOS:** definitief besloten (17 aug 2026, taak #886): er komt **geen iOS-build en geen Apple Developer-account**. Medewerkers met een iPhone werken in de webapp (FPS Connect PWA). Zie docs/besluit-geen-ios-build.md.
- De biometriecode zelf is in deze opdracht niet gewijzigd (`context/auth.tsx` zet biometrie alleen op web uit; dat blijft zo).
