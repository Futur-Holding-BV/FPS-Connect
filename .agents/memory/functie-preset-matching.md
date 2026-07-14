---
name: Functie→preset naam-matching
description: Hoe een functienaam op het juiste rechten-preset gekoppeld wordt bij onboarding-seed
---
Bij het non-destructief koppelen van functies aan systeem-presets (standaardProfielen.ts) MOET de match-heuristiek exacte naam-gelijkheid eerst rangschikken.

**Why:** Een naïeve bidirectionele `includes()` liet een langere preset-naam ("Onderhoudsmonteur") winnen van een exacte functie ("Monteur"), omdat "Onderhoudsmonteur".includes("Monteur") true is. Gevolg: verkeerd preset gekoppeld.

**How to apply:** Rangorde = (1) exacte match; (2) functie-bevat-preset, kies de LANGSTE preset; (3) preset-bevat-functie, kies de KORTSTE preset. Test altijd met een functienaam die substring is van een andere preset.
