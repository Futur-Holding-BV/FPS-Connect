---
name: Factuur-vergrendeling bij export
description: Welke statussen een factuur onwijzigbaar maken en hoe mutatiepaden dat atomair moeten afdwingen.
---

**Regel:** een factuur is vergrendeld (geen kop/regel-mutaties, geen bulk-omzetting) bij `status IN ('verwerkt','verzonden_naar_accountview')` óf `accountview_status IN ('success','verzenden')`. `verzenden` is de gecommitte exportclaim van `claimAccountviewVerzending` — de externe boeking kan dan al onderweg zijn met de oude payload.

**Why:** twee architect-reviewrondes (aug 2026) wezen TOCTOU-races aan: een export die tussen voorcontrole en mutatie valt laat Connect en AccountView stil uiteenlopen, zonder audit trail of herexport.

**How to apply:**
- Elke check-dan-muteer op facturen/factuurregels moet ín één transactie met `FOR UPDATE` op de factuurrij (zie `regelMutatieGeblokkeerd` in facturen-routes en de herbeoordeling in de omzet-route).
- Statusvoorwaarden NULL-veilig schrijven (`IS NULL OR NOT IN (...)`) — `accountview_status` is nullable.
- Bulk-correcties (zoals grootboek-omzetten) zijn BV-bewust: alleen facturen van de aan de boekhouding gekoppelde BV (`bepaalFactuurWerkmaatschappij`), overgeslagen aantallen terugmelden.
- Correcties op geboekte facturen horen via creditering/herexport, nooit via stille edits; server is leidend, UI verbergt alleen.
- Race-bewijs patroon: aparte drizzle-transactie die de rij vergrendelt/status zet terwijl het API-verzoek loopt (`Promise.all`), plus een gecommitte `verzenden`-claim als statisch geval.
