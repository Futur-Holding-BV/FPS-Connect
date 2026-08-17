---
name: Offboarding-uitsluiting & AVG-afscherming
description: Offboard vernietigt sessies; afgeschermd_op strip't persoonsgegevens in mappers + duplicate-check
---
- Offboard (hrm.ts) deactiveert account én roept beeindigSessiesVanGebruiker aan; bearer sterft al op actief-check per request.
- medewerkers.afgeschermd_op (migratie 0058) = AVG-afscherming door personeelszaken; data blijft in DB, API strip't via pasAfschermingToe (AFGESCHERMDE_VELDEN) in medewerkerNaarJson + lijst-mapper.
- **Waarom:** verlof/loon/NAW bewaarplicht, maar niet meer opvraagbaar; alleen oud-medewerkers, 409-guards, isNull-atomair.
- **Let op:** elke NIEUWE route die medewerker-persoonsgegevens teruggeeft moet afgeschermd_op respecteren; duplicate-check (hrm-wizard.ts) sluit afgeschermden uit en geeft gekoppeld account alleen geredigeerd terug bij exacte e-mailmatch (geen deelstring-vissen). Bredere audit = taak #1008.
- Bewijs: scripts/src/bewijs-offboard-uitsluiting.ts (17 checks; geeft e2e-target tijdelijk TOTP omdat mobiele login 2FA eist).
