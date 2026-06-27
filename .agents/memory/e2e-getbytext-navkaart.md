---
name: E2E getByText nav-kaart val
description: Playwright getByText("Verlof").first() treft ancestor-containers i.p.v. de Pressable in Expo RNW, waardoor klikken niet navigeert.
---

## Regel

Gebruik **nooit** `getByText(label).first().click()` om een Pressable nav-kaart in de Expo monteur-app te klikken als het label-woord ook als substring voorkomt in andere tekst op dezelfde pagina (bijv. "Verlof" in "Openstaande verlofaanvragen").

Zet in plaats daarvan `testID="<scherm>-<naam>-navkaart"` op de Pressable en gebruik `page.getByTestId(...)` in de test.

## Waarom

Playwright's `getByText` doet case-sensitive substring-matching. In React Native Web levert dat meerdere matches terug (Text-element, inner View, Pressable, nav-View, ScrollView, root View), allemaal bevatten ze "Verlof". `.first()` pakt het eerste element in DOM-volgorde — dat is de buitenste ancestor, niet de Pressable. Klikken op die ancestor klikt op de verkeerde coordinaten en triggert de `onPress` niet.

`getByText("Opleidingen")` en `getByText("Kennisbank")` werken wél omdat die strings nergens anders op de pagina voorkomen, zodat `.first()` correct de innerste Text-node pakt die dicht bij de Pressable ligt.

## Hoe toepassen

1. Voeg `testID` toe aan de Pressable in het scherm: `testID="hrm-verlof-navkaart"`.
2. Gebruik in de e2e-test: `await page.getByTestId("hrm-verlof-navkaart").click()`.
3. Doe dit voor elke nav-kaart waarvan het label als substring in andere zichtbare tekst voorkomt.
