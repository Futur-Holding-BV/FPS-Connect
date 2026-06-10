---
name: Nav "In uitvoering"-badge voor geparkeerde modules
description: Conventie + valkuil rond de "In uitvoering"-badge in het beheerder-menu
---

Geparkeerde / nog-niet-ontwikkelde modules krijgen in het beheerder-menu een
outline-badge met klok-icoon + `t("nav.inUitvoering")` (sleutel bestaat in alle 6
talen in i18n/vertalingen.ts). Set bij laatste herstel: Inspecties, Onderhoud, CRM,
Abonnementen. Items blijven klikbaar (de bevoegdheden-matrix regelt de toegang) —
in een nog oudere versie waren ze juist `disabled` placeholders.

**Why:** deze badges vielen STIL weg bij de bevoegdheden-matrix-herschrijving van
beheerder-layout.tsx; de gebruiker miste ze en vroeg ze terug ("weer voorzien van").

**How to apply:** bij elke herschrijving van de sidebar/het menu de badges op
geparkeerde modules behouden. Welke modules "in uitvoering" zijn volgt de roadmap in
replit.md (V1.x) — bevestig de set bij de gebruiker als de roadmap verschuift.
