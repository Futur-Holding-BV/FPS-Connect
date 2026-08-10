---
name: Materiaal-aanvraagketen (MATERIAAL_01)
description: Werkbaksignaal-sluiting, meet-/herstelendpoints en de bewust niet-gebouwde fase 3 (keuze A/B/C aan René)
---

# Materiaal-aanvraagketen

- **Werkbaksluiting**: `handelHerkomstAf(herkomstType, herkomstId)` in werkbakService sluit alle open items op herkomst (systeemafhandeling). PATCH materiaal-aanvraag → goedgekeurd/afgewezen roept hem aan; in_behandeling niet. Nooit een tweede sluitroute bouwen.
- **Rechten**: behandelen én heranalyseren = projecten:2 (`niveauInzienEnBehandelen`). Principe: een besluit mag nooit lichter beveiligd zijn dan een niets-beslissende handeling — bij scheefstand de lichte kant omláág, nooit behandelen omhoog (sluit anders mensen uit hun werk).
- **Fase 3 (aanvraag→bestelling) is BEWUST NIET gebouwd**: keuze A (inkoopbon) / B (reservering) / C (behandelaar kiest) ligt bij René, ná de productietelling. Geen keuze = correcte uitkomst. Harde eisen t.z.t.: geen vierde bestelpad, aanvraag houdt verwijzing naar resultaat, resultaat = concept, volgens_opdracht=wijkt_af loopt zichtbaar mee.
- **Meetvoorziening zonder prod-SSH**: `GET /api/metingen/materiaal01` (telling T1-T10) + `POST .../herstel` (idempotente herstelronde), hoofdbeheerder-only; firevault-pagina `/beheer/metingen-materiaal` (Instellingen → Meting inkoopgebruik) met kopieer-als-markdown. Dit patroon (hoofdbeheerder-beheerpagina als prod-meetinstrument) is herbruikbaar voor toekomstige prod-metingen.
- **Schema-valkuil**: `inkoopbonnen` heeft géén `aangemaakt_door_id` (alleen `goedgekeurd_door_id`); magazijn_inkooporders en reserveringen wél.
