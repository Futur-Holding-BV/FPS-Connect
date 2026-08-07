---
name: AK-dashboard eigen cijfers (FINANCIEEL_AI_01)
description: Hoe het AK-dashboard rekent en adviseert — productie-noemer, realisaties-tabel, adviezen-levenscyclus.
---

**Regels:**
- AK-percentage ALTIJD over productie = gefactureerde omzet + OHW-mutatie (uit `fie_jaarrealisaties`, per boekjaar × werkmaatschappij, NULL werkgever = geconsolideerd; upsert via POST /fie/realisaties). Omzet-percentage wordt ernaast getoond maar is nooit de maatstaf.
- Signalen deterministisch in `akEigenCijfers.ts` (post steeg ≥10pp harder dan productie, ≥2 jaren verplicht); AI (slot "default") herformuleert alleen als vraag — bij AI-falen valt de deterministische kerntekst in.
- Loonkosten-signaal: constatering zonder vervolgstap, server-side afgedwongen (ook als AI er één verzint).
- Adviezen (`fie_ak_adviezen`): max 10 open, gerangschikt op bedrag, verdwijnen nooit vanzelf; wegzetten vereist reden (422); dedup via partiële unieke index op status open/weggezet — afgehandeld patroon mag terugkomen.
- Verzekeringstoets gebruikt werkelijke premie uit `org_verzekeringen` (premieJaarbasis o.b.v. frequentie), NIET de modelkennis-bandbreedte-prompt.
- Lopend jaar: koers alleen tonen; begroting nooit automatisch bijstellen.

**Why:** opdracht FINANCIEEL_AI_01 — verkeerde noemer of concluderende toon maakt elk advies onbruikbaar; René beslist, Connect meet.

**Bevindingen gemeld (2026-08-07):** geen indirecte-loonkosten-euro's in Connect (HRM heeft bewust geen salarissen) → handmatige AK-post; org_verzekeringen heeft geen historie/werkgever-FK. Bewijs: `scripts/src/bewijs-financieel-ak.ts` (21 checks).
