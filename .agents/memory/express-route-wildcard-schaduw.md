---
name: Express wildcard-route schaduw
description: Specifieke GET-routes moeten vóór /entiteit/:id staan; twee productie-incidenten door deze foutklasse.
---

Regel: in Express-routers moet elke specifieke route (bv. `/facturen/financieel-dashboard`, `/opname/plattegrond-items`) vóór de wildcard `/entiteit/:id` staan, anders parst Express het padsegment als `:id` (→ NaN → 404/fout).

**Why:** twee echte incidenten (facturen-dashboard "kon niet laden"; opname-plattegrondlaag stil kapot met altijd-404) doordat nieuwe specifieke routes ná de wildcard werden toegevoegd. Compileert gewoon, typecheck vangt het niet.

**How to apply:**
- Bij elke nieuwe route onder een bestaand entiteitspad: check waar `/:id` staat en plaats de specifieke route erboven (met LET OP-commentaar, patroon staat in facturen.ts/opname.ts).
- Verificatie: 401 zonder auth bewijst NIETS over routematching (beide routes hebben dezelfde middleware); alleen een geauthenticeerd verzoek onderscheidt (eigen handler-respons vs. :id-lookup-404).
- Bij review van route-bestanden: scan alle `router.get("/<entiteit>/...")`-regels op volgorde t.o.v. de wildcard.
