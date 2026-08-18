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

## TOCTOU-hercontrole & snapshot-binding (aug 2026)
Regel: élk AccountView-verzendpad draait ná de verzend-claim `hercontroleerBvNaClaim` (verse instellingen-lees; weigering = claim-teruggave met leesbare reden) en bouwt client + boekingspayload UITSLUITEND uit de teruggegeven verse snapshot — nooit uit de pre-claim gelezen instellingen-rij.
**Why:** review-afwijzing: een BV-check op verse data die daarna toch met de oude administratiecode/credentials verzendt, laat een samenhangende gelijktijdige wijziging van factuur-BV én koppeling alsnog in de verkeerde administratie boeken.
**How to apply:** nieuw verzendpad = claim → hercontrole → snapshot gebruiken voor client/dagboek/administratiecode/testmodus; idempotency-checks op de verse payload ná de claim, met status-herstel bij blokkade. Bewijs: verificatie-bv-hercontrole-toctou.ts (api-server, deterministisch) + fase3-script (HTTP).
