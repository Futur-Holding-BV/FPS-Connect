---
name: KLANTLOOS_01 — Connect kent geen klantrol meer
description: De rol 'klant' is volledig uit Connect verwijderd (aug 2026); wat bleef, wat verboden is, en waar de bewaking zit.
---

**Regel:** Connect is de binnenlaag zonder externe gebruikers; klanten wonen in het (externe) Platform. De rol `klant` bestaat niet meer: geen klantPoort, geen `requireBevoegdheidOfKlant`, geen `isKlant` in permissies-engine/PermissieService/aiContext, geen klant-frontend.

**Why:** de beheerder's besluit (aug 2026). Eén rechtenmodel (module-matrix) voor iedereen; het externe klantoppervlak wordt buiten Connect gebouwd.

**How to apply:**
- Nieuwe routes: altijd `requireBevoegdheid(module, niveau)`; nooit een "of klant"-variant terugbouwen.
- POST/PATCH /gebruikers dwingt server-side af: rol ∈ {hoofdbeheerder, gebruiker}; heractiveren van een legacy-klantaccount = 409 (eerst interne rol toewijzen).
- Migratie 0049 deactiveerde klantaccounts (niet verwijderd); rol-kolom blijft historisch.
- **Blijft bestaan:** publiek offerteportaal `/portaal/:token` (token-based, gemount vóór requireAuth) en alle CRM-klantterminologie (`crm_klanten`, `klant_id` = bedrijfsrelatie, geen inlogrol). Ook aiContext-knooptype "klant" = CRM-entiteit, correct.
- De klant-notificatiemail bij rapport-definitief is vervallen (verwees naar het verwijderde /klant/rapportages); herbouwen op het Platform als dat er is.
- Projecten-router draait bewust nog op gebouwen/crm-rechten (technische-schuld #34) — niet "even rechttrekken".
- Fase 3 (gebouwd): `klantloos-check` (scripts) faalt op klantrol-identifiers/rol-vergelijkingen/OpenAPI-enum/of-klant-middleware; in CI + deploy (Controle 3/3). Bewuste uitzonderingen markeren met `// klantloos-ok`; requireAuth-only routes alleen informatief.
- **ONE-verwijdering (15 aug 2026):** de One-buitenlaag (Connect/One-schakelaar, /one/*-schermen en -routes) is definitief uit Connect; klantloos-check bewaakt nu ook ONE-restanten (/one/-routes, pages/one, fps.omgeving, kiesOmgeving, connect|one-union in beide volgordes). Er waren geen One-only backend-endpoints; gebouw_publicaties blijft als uitgaande postbak naar het Platform.
