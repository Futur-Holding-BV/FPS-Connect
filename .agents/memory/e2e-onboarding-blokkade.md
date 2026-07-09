---
name: E2E onboarding-scherm blokkade
description: Frisse Playwright-browser heeft geen fps_onboarding_voltooid in localStorage; na login redirect naar /onboarding; FPS-waaier niet zichtbaar.
---

# E2E onboarding-scherm blokkade

## De regel
Na login navigeert `menu.tsx` naar `/onboarding` als `fps_onboarding_voltooid !== "1"` in AsyncStorage (= localStorage in Expo web). In een frisse Playwright-browser is localStorage leeg, dus na elke succesvolle login verschijnt het onboarding-scherm — en de test vindt `radiaal-fps` niet.

## Waarom
- `menu.tsx` line 65: `AsyncStorage.getItem("fps_onboarding_voltooid").then(v => { if (v !== "1") router.replace("/onboarding"); })`
- Playwright maakt standaard een verse browser context per test (geen `storageState`), dus localStorage is leeg.
- De retry-loop in `logIn()` probeert dan opnieuw in te loggen, maar de pagina staat op `/onboarding` — geen login-inputs.

## Hoe toepassen
Voeg `page.addInitScript` toe VÓÓR `page.goto("/")` in de `logIn` helper van `scripts/e2e/startmenu.spec.ts`:

```typescript
await page.addInitScript(() => {
  window.localStorage.setItem("fps_onboarding_voltooid", "1");
});
await page.goto("/");
```

`addInitScript` loopt voor elke navigation (ook na `goto`), zodat het localStorage-item altijd aanwezig is voordat de React-app initialiseert.
