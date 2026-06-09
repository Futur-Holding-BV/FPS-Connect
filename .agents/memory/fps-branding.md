---
name: FPS branding-tokens & conventies
description: Exacte merkkleuren, web/mobiel-sync, app-naamgeving en e-mailtemplate-kleurregel
---

# FPS branding (niet white-label)

- **Primaire merkkleur = exact `#F23B0D`** (= HSL 12 90% 50%). Donker oppervlak (sidebar/koppen/login/splash) = `#212631`.
  - Web: `firevault/src/index.css` (`--primary: 12 90% 50%`). Mobiel: `monteur-app/constants/colors.ts` (`primary/tint: #F23B0D`, `dark: #212631`). Houd deze twee in sync.
- **E-mailtemplates moeten `#F23B0D` gebruiken, geen benaderingen.** Eerder stond `#E8440F` hardcoded in `api-server/src/services/email.ts` — een net iets andere oranje die afweek van de merkkleur. **Why:** transactionele e-mail moet exact op merk zijn; benaderende hexes sluipen er makkelijk in.
- **App-naam vs bedrijfsnaam is bewust verschillend, NIET "fixen":** `app.json name` = "FPS Monteur" (het product/de monteur-app) terwijl de UI "FPS Brandpreventie" (de organisatie) toont. Dit is correct, geen inconsistentie.
- **Mobiel splash/icon:** splash `backgroundColor: #212631` (matcht login `c.dark`, voorkomt witte flits). Android `adaptiveIcon.backgroundColor: #F23B0D` matcht de oranje van `icon.png` zelf (oranje rounded-square met witte locatiepin+vlam), zodat maskering naadloos op merkkleur valt. Open punt: foreground is een volle tegel; een transparant-symbool-foreground zou mask-veiliger zijn maar is niet nodig zolang achtergrond = icoon-oranje.
