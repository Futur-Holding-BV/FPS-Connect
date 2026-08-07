---
name: Geconsolideerde onboardingflow is definitief
description: Medewerkerprofielen ontstaan uitsluitend via Personeel/HRM; nooit vanuit gebruikersbeheer.
---

**Regel:** medewerkerprofiel-aanmaak loopt uitsluitend via de geconsolideerde HRM-flow: Personeel → Medewerkers → "Onboarden" (lijst "Gebruikers zonder medewerkerprofiel") of de onboarding-wizard (`/personeel/onboarden?userId=…`). Gebruikersbeheer maakt alléén accounts aan.

**Why:** de "drieledige keuze bij gebruikersaanmaak" (extra dialoogstap met dossier-opties) is op expliciete opdracht (2026-08-07) volledig van main teruggedraaid als strijdig met deze definitieve flow, nadat hij al gemerged was.

**How to apply:** bouw geen dossier-/medewerkerprofiel-creatie in gebruikersbeheer-schermen; nieuwe onboarding-features horen in de Personeel/HRM-flow. De wizard staat sinds 2026-08-07 aan in productie via build-arg `VITE_FEATURE_WIZARD_ONBOARDING` (default true) in de deploy-config.
