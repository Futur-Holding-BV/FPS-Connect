---
name: Materiaal-aanvraagketen (MATERIAAL_01)
description: Werkbaksignaal-sluiting, meet-/herstelendpoints en de bewust niet-gebouwde fase 3 (keuze A/B/C aan René)
---

# Materiaal-aanvraagketen

- **Werkbaksluiting**: `handelHerkomstAf(herkomstType, herkomstId)` in werkbakService sluit alle open items op herkomst (systeemafhandeling). PATCH materiaal-aanvraag → goedgekeurd/afgewezen roept hem aan; in_behandeling niet. Nooit een tweede sluitroute bouwen.
- **Rechten**: behandelen én heranalyseren = projecten:2 (`niveauInzienEnBehandelen`). Principe: een besluit mag nooit lichter beveiligd zijn dan een niets-beslissende handeling — bij scheefstand de lichte kant omláág, nooit behandelen omhoog (sluit anders mensen uit hun werk).
- **Fase 3 = keuze A, gebouwd (2026-08-10)**: productietelling was overal nul; goedkeuring (soort materiaal, mét opdracht) maakt in dezelfde tx een concept-inkoopbon via gedeeld pad `maakConceptInkoopbon` (ook de handmatige POST loopt daardoor — geen vierde bestelpad). Aanvraag houdt `inkoopbon_id`; nooit-tweede-bon = conditionele claim (`inkoopbon_id IS NULL`, verlies → throw → tx-rollback → 409) + partiële unieke index. Leverancier="Nog te bepalen"/prijs leeg — bewust niet uit AI; wijkt_af = "LET OP"-prefix in bon-opmerkingen. B/C blijven open voor als het magazijn in gebruik komt; INKOOP_01 en NUMMER_01 §4.5 hierdoor gedeblokkeerd.
- **Meetvoorziening zonder prod-SSH**: `GET /api/metingen/materiaal01` (telling T1-T10) + `POST .../herstel` (idempotente herstelronde), hoofdbeheerder-only; firevault-pagina `/beheer/metingen-materiaal` (Instellingen → Meting inkoopgebruik) met kopieer-als-markdown. Dit patroon (hoofdbeheerder-beheerpagina als prod-meetinstrument) is herbruikbaar voor toekomstige prod-metingen.
- **Schema-valkuil**: `inkoopbonnen` heeft géén `aangemaakt_door_id` (alleen `goedgekeurd_door_id`); magazijn_inkooporders en reserveringen wél.
