---
name: ENK-import calculatiemodule
description: Ontwerpbeslissingen en valkuilen van de ENK-begroting-import (PDF/Excel/CSV) in de calculatiemodule.
---

# ENK-import (calculatiemodule)

## Zichtbare correctieregel i.p.v. stille aanpassing
ENK rondt op regelniveau soms anders af dan Connect. Bij keuze "ENK-totaal aanhouden" wordt het verschil als aparte regel (isStaartkosten, hoofdstuk "Correctie ENK-import") toegevoegd zodat het detailtotaal exact het ENK-totaal is.
**Why:** gebruiker moet altijd kunnen zien waarom het totaal afwijkt van de regelsom; regelbedragen mogen nooit stil worden aangepast.
**How to apply:** bij elke toekomstige import/sync met externe totalen hetzelfde patroon: verschil = zichtbare regel, nooit verdeeld over bestaande regels.

## Standaard opslagen zijn informatief, geen rekenpad (geen dubbeltelling)
ENK-regelprijzen zijn al inclusief opslagen. `STANDAARD_OPSLAGEN` (materiaal 25 / arbeid 4 / AK 8 / risico 0 / winst 4 / korting 0) is de fallback wanneer geen opslagen herkend worden; die waarden worden **alleen vastgelegd/getoond** (kopopmerkingen + read-only controlescherm), NOOIT opnieuw verrekend.
**Why:** het rekenpad bij verwerking "inclusief" moet `LEGE_OPSLAGEN` blijven gebruiken (in `berekenConnectCenten` én `effectieveOpslagen` bij bevestigen), anders inflateert de Connect-som en breekt het bewezen resultaat (ENK € 165.463,74 vs Connect € 165.463,73 = € 0,01, advies=inclusief).
**How to apply:** wil je in de toekomst opslagen tóch verrekenen, doe dat uitsluitend op het expliciete "bovenop"-pad (bron=gedetecteerd → connectBovenop). Nooit de inclusief-defaults per ongeluk in de berekening trekken. Detectiedrempel staat nu op aantal>=2; bij 1 expliciet percentage wordt alles vervangen door STANDAARD (nog open verbeterpunt: mergen over baseline).

## Float4-precisiegrens geldbedragen
mod_calc_regels.tarief/totaal zijn `real` (float4, ~7 significante cijfers). Boven € 167.772,16 per regel (2^24 centen) is cent-precisie niet gegarandeerd; de parser waarschuwt hierop (voegPrecisieWaarschuwingToe).
**Why:** de cent-exacte ENK-garantie kan boven die grens stil breken.
**How to apply:** bij grote projecten of nieuwe geldkolommen: overweeg `numeric`; rekenwerk altijd in centen-integers doen, opslag is de zwakke schakel.

## Dubbelklik-race op bevestigen
Statuscheck vóór de transactie is onvoldoende: de status-update ("geanalyseerd" → "verwerkt") moet conditioneel (`WHERE status='geanalyseerd'` + returning-check) binnen de transactie; verliezer gooit een eigen Error-klasse die de handler naar 409 vertaalt.
**How to apply:** elk "eenmalig verwerken"-endpoint (claim-patroon) zo bouwen.

## E2E: twee file-inputs op elke pagina
De globale slim-upload-balk rendert altijd een verborgen `input[type=file]`; Playwright `input[type="file"]` geeft dan een strict-mode violation. Selecteer op het accept-attribuut van de bedoelde dropzone (bv. `input[type="file"][accept=".pdf,.csv,.xlsx,.xls"]`).

## Bewijsscripts
- `scripts/src/verificatie-enk-import.ts` — 8 API-stappen incl. DB-bewijs (draaien: `cd scripts && pnpm exec tsx src/verificatie-enk-import.ts`).
- `scripts/e2e/web-enk-import.spec.ts` — volledige UI-flow met echte PDF uit attached_assets.

## Bekend aandachtspunt
`xlsx@0.18.5` heeft bekende CVE's (prototype pollution, ReDoS); risico beperkt (alleen calculaties-niveau-3 upload) maar meenemen bij de volgende security-scan.
