---
name: RN flex-row text starvation door wrappende knoppengroep
description: Yoga/React Native layout-gotcha waarbij een flexWrap+flexShrink knoppengroep een flex:1 tekstkolom tot 0px uithongert
---

# Symptoom

In een mobiel scherm wordt een tekstkolom verticaal weergegeven (1 letter per
regel) langs de rand, en de content eronder (lijst) wordt van het scherm gedrukt.
De header lijkt "leeg/gecentreerd" met alleen knoppen zichtbaar.

# Oorzaak

Een horizontale flex-row bevat:
- links een tekstkolom met `flex: 1` (flexBasis 0%), en
- rechts een knoppengroep met `flexDirection:"row"`, `flexWrap:"wrap"`, `flexShrink:1`.

De wrappende knoppengroep heeft `flexBasis: auto`, wat in Yoga resolveert naar haar
**single-line max-content** (alle knoppen op één regel ≈ heel breed, bv. 5 knoppen ≈
500px). Bij flex-distributie krimpt die grote basis maar blijft hij domineren,
terwijl de tekstkolom (basis 0) al niets heeft. Resultaat: de tekstkolom krijgt ~0px
en wikkelt per teken; de knoppengroep pakt vrijwel de volledige breedte.

# Regel / hoe op te lossen

Zet een wrappende knoppen-/actiegroep **niet** in dezelfde horizontale row als een
`flex:1` tekstkolom. **Stapel** in plaats daarvan: tekstblok full-width bovenaan,
daarna de knoppen in een eigen wrappende row eronder (`justifyContent:"flex-start"`,
`marginTop`). Dan kan de tekst nooit worden uitgehongerd.

**Why:** op telefoonbreedte past welkomsttekst + meerdere nav-knoppen niet naast
elkaar; de auto flex-basis van de wrappende groep wint altijd van een flex:1 buur.

**How to apply:** geldt voor elke mobiele header/toolbar met een tekstkolom naast
een set knoppen. Verifieer met een ~400px-brede screenshot (Playwright tegen de Expo
dev-domein-login is hiervoor de betrouwbare weg; e2e-helpers in `scripts/`).
