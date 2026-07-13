---
name: Financiele kerncijfers denormalisatie
description: Meerjarenoverzicht leest gedenormaliseerde kolommen op kerncijfers; elke wijziging van documentmetadata moet atomair cascaderen.
---

Het meerjarenoverzicht queryt uitsluitend de gedenormaliseerde kolommen `entiteit`/`boekjaar`/`geconsolideerd` op `financiele_kerncijfers`, niet het document zelf.

**Regel:** elke plek die document-metadata (entiteit/boekjaar/subtype) wijzigt, moet die kolommen op ALLE kerncijfers van het document meebewegen, in dezelfde `db.transaction`.

**Why:** productiemelding — een verkeerd geclassificeerde jaarrekening bleef onzichtbaar in het meerjarenoverzicht omdat correcties de denormalisatie niet bereikten; zonder transactie kan een fout halverwege de kolommen blijvend laten afwijken.

**How to apply:** bij nieuwe mutatiepaden (bijv. bulk-correctie, import) de PATCH-cascade in `financieel-jaarrekeningen.ts` als voorbeeld nemen; herextractie is veilig (leest doc-metadata op extractiemoment). Cascade nooit via delete+herextractie doen — dat wist handmatige correcties. Bewijs draaien via `scripts/src/verificatie-jaarrekening-cascade.ts`.
