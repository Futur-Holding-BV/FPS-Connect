---
name: GELDSTROOM_01 verkoopfacturatie-invarianten
description: Regels rond samengestelde verkoopfacturen, totalen-herberekening, fiscale onveranderbaarheid en de inkoop-goedkeuringspoorten.
---

- **Koptotalen = afgeleide van regels (alleen verkoop).** Elke regel-mutatie (POST/PATCH/DELETE `/facturen/:id/regels`) herberekent binnen dezelfde tx de koptotalen via `herberekenVerkoopfactuurTotalen` in **centen** (`naarCenten`/`centenNaarBedrag` in facturen.ts). Inkoopfacturen bewust NIET: daar is het brondocument leidend.
  **Why:** architect-review: regel-edit zonder herberekening liet definitieve facturen/mails met stale totalen versturen.
  **How to apply:** nieuwe regel-mutatiepaden (bulk, AI) moeten dezelfde helper in de tx aanroepen; nooit floats voor factuurbedragen.
- **Definitief = dossier.** Verkoopfactuur met fiscaal nummer → regel-mutaties 409 (afgedwongen in `regelMutatieGeblokkeerd` mét FOR UPDATE). Correctie hoort via creditfactuur (nog te bouwen, taak een vervolgtaak).
- **Fiscaal nummer alleen via `/definitief`**; samenstellen (`POST /opdrachten/:id/verkoopfactuur`) geeft F-volgnummer per offerte onder advisory lock 864201, factuurnummer=null. Verzenden-klant vóór definitief = 409.
- **BV-eis:** definitief maken vereist bepaalbare BV (offerte.werkmaatschappijId / gebouw-BV), anders 422.
- **Inkoop fail-closed:** `goedkeuren-stroom` zonder passende beleidsregel = 422 (nooit doorlaten); mét regel = 422 viaGoedkeuring. Grens/rollen staan in Beheer → Goedkeuringsbeleid, niets in code.
- **Betaalbatch-vrijgave** (`/betaalbatches/:id/bevestigen`) = `requireRol("hoofdbeheerder")`, vaste directiepoort zonder delegatie; aanmaken/downloaden/annuleren blijft financieel:3; 423-schakelaar `betaalbatch_actief` blijft en is alleen door hoofdbeheerder om te zetten.
