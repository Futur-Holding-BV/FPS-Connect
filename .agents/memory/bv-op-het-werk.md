---
name: BV op het werk (ADMINISTRATIE_01 fase 3)
description: Werkmaatschappij hangt aan offerte/opdracht; gebouw is alleen default; factuurketen + harde AccountView-poort
---

**Regel:** de werkmaatschappij (BV) van commercieel werk staat op de OFFERTE en OPDRACHT zelf (`werkmaatschappij_id`); het gebouw levert alleen de default bij offerte-aanmaak. Opdracht erft van offerte. Factuur-BV komt uit één gedeelde resolver (keten offerte → opdracht → gebouw-default, bron zichtbaar) — ELKE consument (print, fiscale nummerreeks, Studio-modelpinning, AccountView-export) moet die resolver gebruiken, nooit een eigen gebouw-afleiding.

**Why:** besluit René 18-08-2026: één pand kan werk van meerdere BV's hebben en het gebouwveld mag leeg zijn; eigen afleidingen per route gaven eerder verkeerde BV-nummerreeksen/branding.

**How to apply:**
- Resolver + harde poort: `services/factuurWerkmaatschappij.ts` (`bepaalFactuurWerkmaatschappij`, `controleerFactuurAdministratieBv`).
- AccountView boekt alleen bij match factuur-BV == `accountview_instellingen.werkgever_id` (bewust geen backfill = fail-closed); check zit in service (incl. hercheck ná verzend-claim, TOCTOU) én forceer-herexport én batch.
- Uren blijven bedrijfsbreed: nacalculatie `bv_controle` meldt medewerker-BV vs werk-BV (afwijkend/onbekend apart geteld); GEEN doorbelasting tussen BV's bouwen zonder nieuw besluit.
- Offerte-PDF/mail-branding op offerte-BV = losse taak (huisstijl per werkmaatschappij), nog hardcoded FPS.
