---
name: AI_01 — proactieve voeders & leerlus
description: Ontwerpregels voor de vijf AI-voeders in de bewakingsloop en de leerlus van correcties.
---

**Regels:**
- De vijf AI-voeders (bronnen `ai_calculatie_afwijking`, `ai_inkoop_afwijking`, `ai_magazijn_bestelsuggestie`, `ai_hrm_capaciteit`, `ai_werkvoorbereiding_signaal`) zijn DETERMINISTISCH op eigen cijfers — géén LLM in de bewakingsloop; actiePad wijst naar het scherm met de opvraagbare AI-analyse.
- Elk item = soort "doen" met concrete handeling + onderbouwing (waarvan afwijkend, hoeveel, aantal waarnemingen). Onder de drempels (calculatie ≥5, inkoop ≥3, leerlus ≥10 correcties per veld) wordt gezwegen.
- **Direct geadresseerde werkbak-items (gebruikerId) omzeilen de module-check in zichtbaarVoor()** — directe ontvangers ALTIJD filteren op actuele bevoegdheid (filterOntvangersOpBevoegdheid in bewakingsloop.ts); functietitel alleen is geen recht.
- Leerlus telt alleen échte correcties (`ai_voorstel != gekozen`); overnames zijn bevestigingen. Zichtbaar via `geleerd_van_correcties`, uitzetbaar via instelling `ai_leren_van_correcties_ingeschakeld` (migratie 0034); nooit auto-overnemen.
- mod_calc_headers-statussen: concept/intern_akkoord/aangeboden/gewonnen/verloren ("nog niet definitief" = concept+intern_akkoord).

**Why:** review vond een autorisatielek (prijzen naar mensen zonder recht) en een rem die op bevestigingen afging; LLM-in-de-loop is te duur/onbetrouwbaar.

**Meting:** `scripts/src/meting-ai01.ts` → docs/metingen/AI_01_gebruik.md. Logginggat §6.4 (meeste aanroepen zonder promptNaam/module) staat open als taak; prod-meting vergt draai op de VPS. Bewijs: `scripts/src/bewijs-ai01.ts` (app_instellingen kan 0 rijen hebben — eerst rij zaaien vóór toggle-test).
