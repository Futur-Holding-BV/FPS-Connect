---
name: Rekeningschema grootboek (ADMINISTRATIE_01)
description: grootboekrekeningen-tabel per BV, keuzelijst, boekingspoort en gebruik-meting
---

- Tabel `grootboekrekeningen` (per werkgever_id: nummer/omschrijving/soort/actief/bron). Import = upsert; verdwenen nummers → `actief=false`, nooit deleten.
- **Boekingspoort** in `accountviewExportService.controleerGrootboekSchema`: ná de verzend-claim (zelfde plek als de BV-TOCTOU-hercontrole), toetst kop- én regelrekeningen. Claim-teruggave = status `error` + reden (bestaand patroon, er is géén aparte geefClaimTerug-functie).
- **Why leeg schema = doorlaten**: fail-closed zou de hele boekingsstroom stilleggen vóór het schema ooit is ingelezen (KADER: geen productieremmen). Gebruik-meting (`GET /grootboekrekeningen/gebruik`) maakt het gat zichtbaar.
- AccountView-ophalen is een *meting*: `haalGrootboekrekeningen()` in accountview-client is fail-soft ({beschikbaar, httpStatus, reden}); 404/405 = koppeling ondersteunt het niet → lijst inlezen.
- Frontend: `GrootboekSelect` (firevault/components) vervangt alle vrije-tekst grootboekvelden; waarde buiten schema blijft zichtbaar met amber-waarschuwing. Beheer-UI = tab Rekeningschema op Beheer → Boekhouding.
- Module-gate: er bestaat geen module-id "facturen" — facturenroutes gebruiken `financieel`.
