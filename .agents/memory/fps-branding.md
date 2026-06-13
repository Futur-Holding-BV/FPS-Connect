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

## Logo-familie FPS One / FPS Connect (schild+vlam+gebouw beeldmerk)
- Twee logo's, ZELFDE beeldmerk/verhoudingen/tagline ("ÉÉN PLATFORM. ALLES IN ÉÉN."), alleen naam + accentkleur verschillen. Bestanden: `firevault/public/logo-fps-one.png` (klant) en `logo-fps-connect.png` (intern). Navy wordmark "FPS" = ~`#1F2A44`.
  - **FPS One = navy + oranje** (warm, klantgericht). **FPS Connect = navy + antraciet/staalgrijs** (zakelijk, intern); accent/wordmark "CONNECT" = `#54606E`.
- **Why:** beide omgevingen moeten direct herkenbaar één productfamilie zijn (klant ziet screenshots van beide); onderscheid puur via naam + kleuraccent, niet via een ander logo.
- **How to apply (Connect afgeleid van One):** recolor warme tinten (h<55 of >338, s>0.18) → slate hue 212° met lage sat, lichtheid behouden (vlam blijft tonale gradient, wordt staal); witgom oude "ONE", herzet "CONNECT" in Montserrat 900 Black, ge-justeerd op FPS-breedte (x≈385–807). Tooling: `@napi-rs/canvas` (in store) + `@expo-google-fonts/montserrat` (tijdelijk installeren, daarna verwijderen). LET OP: dit logo-familiepalet (navy/oranje/antraciet) wijkt af van het app-thema primair `#F23B0D` rood-oranje; nog niet samengevoegd.
