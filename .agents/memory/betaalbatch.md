---
name: Crediteuren-betaalbatch (SEPA)
description: Akkoord-schakelaar, fail-closed selectie en pain.001-generator voor de betaalbatch (ADMINISTRATIE_02 §3).
---

- **Akkoord-schakelaar**: `app_instellingen.betaalbatch_actief` (standaard UIT). Álle betaalbatch-endpoints (ook lijst en annuleren) geven 423 zolang uit; omzetten kan alleen de hoofdbeheerder via PUT /info/instellingen (403 voor anderen). **Waarom:** René eiste uitdrukkelijk akkoord vóór de betaalfunctie werkt; review wees uit dat een half-gegate feature (lijst/annuleren open) de eis schendt.
- Selectie fail-closed in `routes/betaalbatch.ts` → `beoordeelFactuur`: inkoop + geaccordeerd + AccountView-geboekt, nooit geblokkeerd/afgekeurd/betaald, geldig IBAN (mod-97), BV-match via factuur-BV-resolver, G-rekening uitgesloten. Herbeoordeling gebeurt bínnen de aanmaak-transactie met `FOR UPDATE`-locks (race met parallelle blokkade/afkeuring).
- pain.001.001.03-generator in `lib/sepaBetaalbestand.ts` (zelfgebouwde XML met SEPA-tekensetfilter + escaping, geen dependency). Bevestigen = één handeling die facturen op betaald zet — er is géén CAMT/MT940-import; gemeld als gat.
- Drie-weg-controle op inkoopfacturen is bewust twee-en-een-half: ontvangst-aantallen bestaan niet in projectinkoop → `geleverd_registratie: "ontbreekt"` eerlijk melden, nooit uit bonstatus verzinnen.
