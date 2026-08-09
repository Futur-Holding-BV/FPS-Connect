---
name: Jaarkalender (KALENDER_01)
description: Kalender-aggregatie als afgeleide view + collectieve vrije dagen via de bestaande verlofmotor
---

- Kalenderroute (`GET /kalender`) is een pure afgeleide view: nooit bron-data kopiëren; elke soort komt live uit zijn eigen tabel (voertuigen, gereedschappen, verlofaanvragen, …). Scoping server-side per module-niveau (personeel/wagenpark/gereedschappen/gebouwen: niveau 1 = alles, anders eigen-scope); verjaardagen alleen met dubbele opt-in en nooit jaar/leeftijd in de respons.
- Collectieve vrije dagen boeken af via `workflowService.transiteer(→goedgekeurd, negeer_bezetting)` — er is bewust GEEN tweede afboekpad naast de verlofmotor; terugdraaien = transitie →ingetrokken per aanvraag. Deeltijd = contracturen÷5 (afgerond op 0,1).
- Uniciteitsgrendel: partiële unieke index op verlofaanvragen(collectieve_dag_id, medewerker_id); FK is ON DELETE SET NULL, dus koppeling verdwijnt bij verwijderen van de dag — bewijs/checks moeten aanvraag-ids vóór de delete vastleggen.
- Afboekrapporten (namen + saldi) alleen teruggeven bij personeel:1 — de dagenlijst zelf is voor iedereen zichtbaar.
- Indiensttredings-hook (POST /medewerkers) mag nooit stil falen: waarschuwing in de 201-respons als afboeken mislukt.
- **Waarom:** René's kwaliteitskader eist bron-van-waarheid zonder kopieën en één verlofmechanisme; reviewer keurde rapport-lek en stil falen af.
- Gemelde afwijkingen (2026-08-09): weekcontrole telt verlof als geteld naast de norm (≠ §4.5-formulering "norm verlaagd", gedrag gelijkwaardig); inspecties achter gebouwen:1 en PBM/veiligheidsmiddelen achter gereedschappen:1 zijn aannames.
