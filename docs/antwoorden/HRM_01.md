# Antwoorden en bevindingen — HRM_01

## 8 augustus 2026 · gemeten op commit `3bf91aa`

**Correctie van René (8 augustus 2026, vóór start van de opdracht):** paragraaf 2.2 van HRM_01 ("Contractverloop en aanzegtermijn ontbreekt volledig") **vervalt volledig**. De oorspronkelijke meting keek naar de verkeerde tabel (`medewerker_aanstellingen`, die inderdaad geen einddatum heeft) en miste de bestaande contractmodule.

**Vraag:** klopt het dat contractverloop en aanzegtermijn al bestaan en dus niet opnieuw gebouwd mogen worden?

**Antwoord: ja — GEMETEN op deze commit:**

- `lib/db/src/schema/contracten.ts`: `arbeidsovereenkomsten` (met `eind_datum`, null = onbepaalde tijd, incl. ketenregeling-relaties), `contract_signaleringen` (types: `120_dagen | 90_dagen | 75_dagen | 60_dagen | 30_dagen | verlopen | ketenregel | aanzegtermijn`) en `contract_besluiten` (`verlengen | wijzigen | onbepaalde_tijd | beeindigen | geen_besluit`).
- `lib/db/src/schema/financiele-contracten.ts`: `financiele_contracten` met `einddatum`, `opzegtermijn_maanden` en `automatische_verlenging`, plus `financiele_contract_signaleringen` en `financiele_contract_kosten`.
- `artifacts/api-server/src/routes/contract-bewaking.ts`: maakt de signaleringen aan (incl. ketenregel en aanzegtermijn), met dashboard, besluitroute en AI-voorbereiding op een contractbesluit. De router is aangesloten (`routes/index.ts`).

**Het echte gat — GEMETEN:** de bewaking gaat niet vanzelf af. `contract-bewaking.ts` genereert signaleringen alleen wanneer iemand de route aanroept; er is in de opstartcode geen verwijzing naar contractbewaking en geen `scheduleNext()`-taak (het patroon dat `lib/avgOpruiming.ts` en `lib/backupService.ts` wél gebruiken). Bij een aanzegtermijn is wachten-tot-iemand-kijkt hetzelfde als geen bewaking.

**BESLUIT VAN RENÉ — GENOMEN (8 augustus 2026):** het periodiek afgaan van de contractbewaking wordt opgelost in **WERKBAK_01** (de dagelijkse bewakingsloop), niet in HRM_01. Paragraaf 2.2 vervalt daarmee volledig; contractverloop/aanzegtermijn wordt **niet** opnieuw gebouwd.

**Wat van HRM_01 blijft staan (ongewijzigd):** §2.1 Poortwachter-mijlpalen, §2.3 certificaten/bekwaamheden, §2.4 verlofverjaring en §2.5 zzp-overeenkomsten moeten nog op het signaalmechanisme worden aangesloten, binnen de kaders van §3 (hergebruik signaalmechanisme + `scheduleNext()`-patroon, afhandelpaneel, routering) en §4 (privacy: nooit medische informatie in een signaal).
