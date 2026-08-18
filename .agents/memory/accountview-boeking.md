---
name: AccountView-boeking & exportclaim
description: Automatische AccountView-boeking, gedeelde exportkern en de atomaire verzend-claim tegen dubbele boekingen.
---
# AccountView-boeking

- Alle verzendpaden (handmatige export, auto-boeking, batch, herexport) moeten door `claimAccountviewVerzending()` (accountviewExportService): atomaire update accountviewStatus→"verzenden", stale claim vervalt na 10 min. Nieuwe verzendpaden NOOIT direct `client.verzendBoeking` laten aanroepen zonder claim.
- **Why:** twee gelijktijdige triggers verstuurden anders dezelfde boeking twee keer (architect-review-afwijzing INKOOP_BOEKING_01).
- Automatische boeking (`probeerAutomatischeBoeking`) is gegate op `export_actief` in accountview-instellingen; handmatig exporteren bewust niet. Mislukking → faalmail naar hoofdbeheerders (loopt via de mail-wachtrij).
- Direct betaalde algemene inkoop + PDF-bon = factuurroute (verwerkDirectBetaaldeBonFactuur); foto blijft bon. Auto-afronden alleen als inkoop status "open" is én geen open goedkeuringsaanvraag (FOR UPDATE herlezen in de tx) — goedkeuringspoort geldt voor factuur ÉN inkoop.
- AI leest geen btw-code → zonder geleerde leverancier-categorisatie weigert de exportcontrole ("BTW-code ontbreekt") en gaat de faalmail eruit.
