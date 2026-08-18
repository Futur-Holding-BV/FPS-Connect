---
name: Contractbewaking bestaat al
description: Contractverloop/aanzegtermijn niet opnieuw bouwen; gat is alleen het periodiek afgaan
---

**Regel:** contractverloop, aanzegtermijn en ketenregel zijn al gebouwd — schema `contracten.ts` (arbeidsovereenkomsten met eind_datum, contract_signaleringen incl. aanzegtermijn/ketenregel, contract_besluiten) + `financiele-contracten.ts` + `routes/contract-bewaking.ts` (signalering, dashboard, besluitroute, AI-voorbereiding). NOOIT opnieuw bouwen.

**Why:** HRM_01 §2.2 beweerde ten onrechte dat dit ontbrak (verkeerde tabel gemeten: medewerker_aanstellingen heeft geen einddatum, maar dat is niet de contractbron). de beheerder heeft §2.2 op 2026-08-08 expliciet laten vervallen.

**How to apply:** het enige gat is dat contract-bewaking alleen op route-aanroep signaleert — geen scheduleNext()-taak in de opstartcode. Dat wordt opgelost in de dagelijkse bewakingsloop (WERKBAK_01), niet in HRM. Bij HRM_01 alleen §2.1/2.3/2.4/2.5 aansluiten.
