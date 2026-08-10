---
name: Geconsolideerde onboardingflow is definitief
description: Medewerkerprofielen ontstaan uitsluitend via Personeel/HRM; nooit vanuit gebruikersbeheer.
---

**Regel:** medewerkerprofiel-aanmaak loopt uitsluitend via de geconsolideerde HRM-flow: Personeel → Medewerkers → "Onboarden" (lijst "Gebruikers zonder medewerkerprofiel") of de onboarding-wizard (`/personeel/onboarden?userId=…`). Gebruikersbeheer maakt alléén accounts aan.

**Why:** de "drieledige keuze bij gebruikersaanmaak" (extra dialoogstap met dossier-opties) is op expliciete opdracht (2026-08-07) volledig van main teruggedraaid als strijdig met deze definitieve flow, nadat hij al gemerged was.

**How to apply:** bouw geen dossier-/medewerkerprofiel-creatie in gebruikersbeheer-schermen; nieuwe onboarding-features horen in de Personeel/HRM-flow. De wizard staat sinds 2026-08-07 aan in productie via build-arg `VITE_FEATURE_WIZARD_ONBOARDING` (default true) in de deploy-config.

## Eén-flow accountstap (aug 2026)
De wizard heeft een accountstap zonder `userId`: `POST /medewerkers/onboarding-account`, gegate op personeel:2 (NIET gebruikers:4) en least-privilege (rol "gebruiker", lege bevoegdheden, geen profielen).
**Why:** completion-review wees af toen de knop zichtbaar was voor personeel:2 maar de accountaanmaak gebruikers:4 vereiste — capability moet visibility matchen; least-privilege maakt de lagere gate veilig.
**How to apply:** nieuwe wizard-ingangen nooit op een endpoint met zwaardere rechten dan de knop-zichtbaarheid laten leunen; ofwel gate gelijk trekken, ofwel een bewust begrensd endpoint bouwen.
