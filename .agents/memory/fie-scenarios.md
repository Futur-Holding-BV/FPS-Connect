---
name: FIE wat-als-scenario's
description: SCENARIO_01 — scenario = begrotingskopie met status 'scenario'; uitsluitingsregels en doorrekenmodel
---

**Regel:** een wat-als-scenario is een rij in `fie_jaarbegrotingen` met status `scenario` (+ `scenario_van_id`/`scenario_naam`/`scenario_aannames` JSON). Overal waar begrotingen gelezen worden voor live gedrag moet `ne(status,'scenario')` staan: begrotingenlijst-route, `berekenFieContext`-fallback, en alle drie de AK-dashboard-joins (jaarreeks, lopend jaar, postontwikkeling). Nieuwe lezers van `fie_jaarbegrotingen` moeten scenario's expliciet uitsluiten.

**Why:** scenario's zijn kopieën mét gekopieerde AK-posten; zonder filter tellen ze dubbel mee in AK-sommen en kunnen ze als fallback-begroting de calculatiecontext vervuilen.

**How to apply:**
- Statusovergang scenario→iets anders = 422 (route-side; geen DB-constraint). Scenario aanmaken alleen via POST /fie/begrotingen/:id/scenario (kopie in tx, nooit vanaf een ander scenario).
- Capaciteitswijziging (aantal_monteurs in aannames) zonder bezettingsgraad_pct → 422 (`valideerScenarioAannames`, geëxporteerd uit routes/fie.ts voor bewijs).
- Doorrekening (`berekenScenarioDoorrekening`) hergebruikt `berekenDoelmarge` — geen tweede rekenmodel; AK% altijd over productie; niveaus 60/70/80/90 + eigen aanname; omslagpunt = loonkosten / (uren × tarief × (1−variabele%)).
- Elke gebruikte waarde krijgt een bron (ingevoerd/afgeleid/standaard); ontbrekend = melding, nooit stil invullen.
