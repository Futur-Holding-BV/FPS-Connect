---
name: AI-adviesbeleid server-side afdwingen
description: Reviewlessen uit het wagenpark-afstootadvies — prompt-only regels worden afgekeurd; bewijsbeleid en bronaggregatie moeten server-side.
---

De completion-review keurde het wagenpark-afstootadvies tweemaal af totdat:

1. **Bewijsbeleid = code, niet prompt.** Regels als "geen vervangen/afstoten zonder voldoende eigen data of mediaan-overschrijdend bewijs" moeten in een pure, deterministisch geteste functie zitten die het AI-antwoord ná parsing afdwingt (zie `artifacts/api-server/src/lib/wagenparkAfstootBeleid.ts` + `.test.ts`). Alleen in de prompt vragen = afkeuring.
2. **Alle kostenbronnen aggregeren.** Het wagenpark heeft twee kostenbronnen: `wagenpark_kosten` én `wagenpark_onderhoud.kosten` (datum = afgerond_datum, terugval aangemaakt_op). Een bron ophalen maar niet meetellen = "stilzwijgend genegeerd" en wordt afgekeurd.
3. **Parsed AI-arrays hardenen:** niet-object/null-elementen overslaan vóór property-access.

**Why:** review eist dat gebruikersgerichte AI-aanbevelingen niet afhangen van een onbetrouwbare LLM-instructie, en dat bewijsscripts precies deze randgevallen (data-arm voertuig, kosten alleen op onderhoudsmeldingen) afdekken.

**How to apply:** bij elke nieuwe AI-adviesfeature: pure beleidsfunctie + deterministische test + bewijsscript met data-arm geval en per-bron bewijsassertie.
