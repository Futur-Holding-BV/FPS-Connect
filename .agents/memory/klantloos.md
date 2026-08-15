---
name: KLANTLOOS_01 — Connect kent geen klantrol meer
description: De rol 'klant' is volledig uit Connect verwijderd (aug 2026); wat bleef, wat verboden is, en waar de bewaking zit.
---

**Regel:** Connect is de binnenlaag zonder externe gebruikers; klanten wonen in het (externe) Platform. De rol `klant` bestaat niet meer: geen klantPoort, geen `requireBevoegdheidOfKlant`, geen `isKlant` in permissies-engine/PermissieService/aiContext, geen klant-frontend.

**Why:** René's besluit (aug 2026). Eén rechtenmodel (module-matrix) voor iedereen; het externe klantoppervlak wordt buiten Connect gebouwd.

**How to apply:**
- Nieuwe routes: altijd `requireBevoegdheid(module, niveau)`; nooit een "of klant"-variant terugbouwen.
- POST/PATCH /gebruikers dwingt server-side af: rol ∈ {hoofdbeheerder, gebruiker}; heractiveren van een legacy-klantaccount = 409 (eerst interne rol toewijzen).
- Migratie 0049 deactiveerde klantaccounts (niet verwijderd); rol-kolom blijft historisch.
- **Blijft bestaan:** publiek offerteportaal `/portaal/:token` (token-based, gemount vóór requireAuth) en alle CRM-klantterminologie (`crm_klanten`, `klant_id` = bedrijfsrelatie, geen inlogrol). Ook aiContext-knooptype "klant" = CRM-entiteit, correct.
- De klant-notificatiemail bij rapport-definitief is vervallen (verwees naar het verwijderde /klant/rapportages); herbouwen op het Platform als dat er is.
- Projecten-router draait bewust nog op gebouwen/crm-rechten (technische-schuld #34) — niet "even rechttrekken".
- Fase 3 (gepland): buildcontrole die FAALT bij herintroductie van de klantrol; de oude klant-poort-check + CI/deploy-stap zijn verwijderd.
