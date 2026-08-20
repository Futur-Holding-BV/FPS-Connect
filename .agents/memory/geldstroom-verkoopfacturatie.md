---
name: GELDSTROOM_01 verkoopfacturatie-invarianten
description: Regels rond samengestelde verkoopfacturen, totalen-herberekening, fiscale onveranderbaarheid en de inkoop-goedkeuringspoorten.
---

- **Koptotalen = afgeleide van regels (alleen verkoop).** Elke regelmutatie herberekent binnen dezelfde transactie de koptotalen in centen. Inkoopfacturen bewust niet: daar is het brondocument leidend.
  **Why:** architect-review: regel-edit zonder herberekening liet definitieve facturen/mails met stale totalen versturen.
  **How to apply:** nieuwe regel-mutatiepaden (bulk, AI) moeten dezelfde helper in de tx aanroepen; nooit floats voor factuurbedragen.
- **Definitief = dossier.** Een verkoopfactuur met fiscaal nummer is onwijzigbaar en onverwijderbaar. Correctie loopt uitsluitend via de beschermde creditworkflow; generieke aanmaak- of definitiefpaden mogen geen achterdeur bieden. Bronfactuur en bronregel blijven gekoppeld en elke bronregel kan maximaal één keer worden tegengeboekt.
  **Why:** routeguards alleen op regelmutaties lieten een fiscale bypass toe via een los creditconcept; een genummerde credit zonder bronrelatie is niet auditbaar.
  **How to apply:** nieuwe credit-ingangen moeten de bronfactuur locken en bronrelaties, negatieve bedragen, fiscale BV-snapshot en eigen nummer in één tx schrijven; borg genummerde creditintegriteit ook in de database.
- **Fiscaal nummer pas bij definitief maken.** Een concept mag geen nummer uit de fiscale reeks verbruiken en mag niet als definitieve klantfactuur worden verzonden.
- **BV-eis:** definitief maken bevriest de uitgevende BV met een expliciete vastlegmarker; credit en AccountView gebruiken daarna alleen die snapshot. Genummerde legacy-verkoop zonder complete snapshot faalt gesloten en mag nooit uit actuele werkkoppelingen worden afgeleid. Dit geldt niet voor inkoopfacturen met een extern leveranciersnummer.
  **Why:** een actuele offerte-/opdracht-BV kan tijdens óf na historische nummeruitgifte wijzigen; een read vóór de factuurtransactie kan daardoor al bij uitgifte de verkeerde BV-reeks kiezen.
  **How to apply:** lock factuur en alle aanwezige offerte-/opdracht-/gebouwbronnen in vaste volgorde, bepaal daarna pas de BV en schrijf teller, BV-id en vastlegmarker in dezelfde tx. Zonder complete snapshot geen credit/export.
- **Inkoop fail-closed:** zonder passende goedkeuringsregel nooit doorlaten; grenzen en rollen komen uit het beheerde goedkeuringsbeleid, niet uit vaste code.
- **Betaalbatch-vrijgave** blijft een vaste directiepoort zonder delegatie; de beveiligingsschakelaar kan alleen door het hoogste beheerniveau worden omgezet.
