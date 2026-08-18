---
name: Financiële keten (FINANCIEEL_KETEN_01)
description: Ketenreparaties financieel hoofdstuk + open voorleg-punten aan René
---

## Regels
- Financiële wacht-toestanden horen in de werkbak: bronnen factuur_geblokkeerd, factuur_exportfout, verkoopfactuur_vervallen, ohw_signaal (aug 2026).
- OHW-voeder rekent alléén afgesloten statussen door via berekenItems(peildatum, status) — nooit de hele portefeuille aggregeren in de sequentiële bewakingsloop.
- **Why:** volledige OHW-aggregatie per loopdraai kan de loop laten timeouten en alle bewaking onderdrukken (architect-review).
- Asynchrone onderzoeken (marktspiegel-patroon): time-out door lezer is terminaal; worker mag alleen afronden vanuit status "bezig" (conditionele update), anders herrijst een als-mislukt-getoond onderzoek.
- Verwijder-audit via DELETE ... RETURNING — alleen daadwerkelijk verwijderde rij loggen (geen vals log bij race). Codebaseconventie: logActiviteit ná geslaagde mutatie.
- Handmatige OHW-waardering eist toelichting (422 zonder) + bijgewerktDoorId + activiteitregel.

## Open voorleg-punten aan René (niet stilzwijgend wijzigen — cijfers veranderen)
1. Btw-definitieverschil: liquiditeit incl. btw vs OHW/bedrijfsresultaten excl. — voorstel: labels verduidelijken.
2. Contractkosten: lijst-jaarlast (contractvelden) vs besparingsadvies (kostenhistorie).
3. Crediteuridentiteit op 3 plekken (leveranciers.relatiecode, facturen.relatieCode, AccountView-mapping) — reconciliatie vergt opschoonslag.
Details: docs/antwoorden/FINANCIEEL_KETEN_01.md.
