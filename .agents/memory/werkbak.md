---
name: Werkbak & bewakingsloop
description: Ontwerpregels van de persoonlijke werkbak (WERKBAK_01) en valkuilen bij voeders/zichtbaarheid.
---

- Eén werkbak per persoon: `werkbak_items` (soort doen|weten, gewicht=consequentie, dedup via partiële unieke index WHERE status='open') + `bewaking_draaien` runlog; dagelijkse loop 06:30 via scheduleNext-patroon met opstartcontrole.
- Nieuwe voeder = item in `WERKBAK_BRONNEN` (gesloten lijst, throw bij onbekend) + voeder in `bewakingsloop.ts` die `syncBron(bron, items)` aanroept. **Lijst == werkelijkheid**: geen bronnamen zonder voeder laten staan.
- `syncBron` is transactioneel (aanmaken + reconciliëren als één geheel) en de loop heeft een overlap-guard (`_loopBezig`); reconciliatie = "sleutel niet meer in actuele open-set → afhandelen met herleidbare oorzaak".
- **Zichtbaarheid**: hoofdbeheerder-check EERST (ziet alles, ook persoonlijke items), dan gebruikerId==ik, dan alleenHoofdbeheerder, dan module-match. Klant nooit.
- **Why (mailbox-les):** module-brede zichtbaarheid (crm:2) is te grof voor mailgegevens — werk-inbox heeft per-mailbox rechten. Fijnmazige bronnen krijgen persoonlijke items per gerechtigde (dedupSleutel bevat gebruikerId); geen gerechtigden → escaleren naar hoofdbeheerder, nooit stil laten hangen.
- **Gezondheid**: draai-status `klaar` alleen als álle voeders slaagden (anders `gedeeltelijk`/`fout`); >26u geen `klaar`-draai → Weten-item René (`bewakingsloop:niet_gedraaid`); falende voeders direct gemeld (`bewakingsloop:voeders_mislukt`).
- Documenten-inbox (routes/inbox.ts) is bewust géén voeder (eigen werkvoorraad-flow); vastgelegd in docs/antwoorden/WERKBAK_01.md.
- **Bewijsscript-val:** seed-cleanup registreren vóór de eerste insert die kan crashen, anders blijven wees-rijen achter die latere runs vervuilen; testitems selecteren op herkomst_id, niet op eerste naam-match.
- Inline verlof beoordelen in het paneel stuurt de volledige VerlofAanvraagInput terug (stale-write-risico bij gelijktijdige wijziging — bekend, geaccepteerd v1).
