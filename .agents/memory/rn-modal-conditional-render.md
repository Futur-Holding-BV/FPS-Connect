---
name: RN Web Modal conditioneel renderen
description: React Native Web Modal met visible=false verwijdert content niet uit het DOM; fix voor e2e-detectie.
---

In React Native Web (gebruikt door Expo voor Playwright e2e) behoudt een `<Modal visible={false} animationType="slide">` zijn content in het DOM tijdens de sluit-animatie — en soms daarna. Playwright's `filter({ visible: true })` detecteert de tekst dan nog steeds, waardoor `toHaveCount(0)` assertions falen.

**Regel:** gebruik conditioneel renderen in plaats van de `visible`-prop voor modals die in e2e tests gecontroleerd worden:

```jsx
{open && (
  <Modal visible animationType="slide" transparent ...>
    ...content...
  </Modal>
)}
```

Zo wordt de content volledig uit het DOM verwijderd zodra `open` false wordt.

**Why:** `visible={false}` triggert een CSS/animatie-verberging, maar de DOM-nodes blijven bestaan. Playwright vindt zichtbare (niet-display:none) tekst zelfs tijdens de slide-out animatie.

**How to apply:** Elk nieuw Modal in de monteur-app die een e2e test heeft op tekst-verdwijning moet dit patroon gebruiken.
