---
name: Onboarding wizardversie
description: Concurrencyregel voor hervatten, herstarten en afronden van bestaande medewerker-onboardings.
---

Elke mutatie van een hervatbare onboarding moet de laatst gelezen, monotoon oplopende wizardversie meesturen. De server vergelijkt status en versie fail-closed en verhoogt de versie bij succes. `bijgewerkt_op` mag alleen een extra CAS-controle zijn en vervangt de verplichte versie nooit. Geserialiseerde auto-saves moeten na ieder antwoord zowel hun versie- als tijdstempelref vernieuwen.

Definitieve profielvelden, de actieve medewerkerstatus en de opgehoogde wizardversie moeten bij afronding in één database-transactie onder dezelfde rijvergrendeling worden geschreven. Splits dit nooit over een gewone profiel-PATCH en een latere wizard-PATCH.

**Why:** zonder één blijvende versiepoort kan een stale browser eerst oude profielvelden opslaan en pas daarna 409 krijgen op de statusovergang. De gebruiker ziet dan een conflict terwijl de verouderde data al is opgeslagen.

**How to apply:** gebruik deze poort voor elke onboardingstroom die een bestaand profiel hervat. Een reset of parallelle opslag mag lineair winnen of 409 krijgen; een verliezende stale afronding mag geen enkel profielveld wijzigen.