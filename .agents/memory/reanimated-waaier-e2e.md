---
name: Reanimated waaier e2e klik
description: Waarom klik-simulatie op Reanimated waaier-items faalt en de werkende aanpak via window.__FPS_NAVIGEER__.
---

## Probleem

Reanimated plaatst alle waaier-items DOM-matig op hetzelfde punt (CSS center, x=0 y=0). De visuele positie komt via CSS-transform (matrix/translate). Dit maakt elke klik-simulatie fundamenteel onbetrouwbaar:

- `.click({ force: true })` — raakt het verkeerde item (ze liggen over elkaar)
- `boundingBox()` + `page.mouse.click()` — boundingBox rapporteert 0×0 of het midden
- transform-matrix uitlezen + rekenkundige positieschatting — Reanimated's transform-volgorde verschilt per renderpass

## Werkende aanpak

In `menu.tsx` worden twee globals geregistreerd via `useEffect` (Platform.OS === 'web', cleanup op unmount):

```ts
window.__FPS_ROUTES__   // Record<string, string> — sleutel → pad
window.__FPS_NAVIGEER__ // (pad: string) => void  — roept router.push aan
```

In de Playwright-spec wordt dan `page.evaluate(() => window.__FPS_NAVIGEER__?.("/hrm"))` gebruikt in plaats van een klik op het Reanimated element. De auth-state (bearer token in localStorage) blijft daardoor intact en de Expo Router navigeert naar de juiste route.

**Why:** Klik-simulatie op CSS-transform-gepositioneerde elementen is structureel onbetrouwbaar in Playwright/Chromium. De globals omzeilen het DOM-probleem volledig.

## Playwright transform-cache valkuil

Playwright compileert `.spec.ts` bestanden via tsx en cachet de output in:

```
/tmp/playwright-transform-cache-1000/fb/<hash>_startmenuspec.js
```

Na spec-edits draait Playwright de gecachede gecompileerde versie als de hash niet verandert. Wis de cache vóór een nieuwe run:

```bash
rm -rf /tmp/playwright-transform-cache-1000/
```

**Signaal dat de cache het probleem is:** Playwright toont de juiste TS-bronregels in de stacktrace, maar de fout is op een regel die je al hebt bewerkt.

## Letop bij __FPS_NAVIGEER__ aanroepen

- De global wordt verwijderd op unmount van `menu.tsx` — roep hem aan VOOR navigatie weg van /menu.
- Werkt alleen in web-modus (Platform.OS === 'web'); in native Expo Go bestaat hij niet.
