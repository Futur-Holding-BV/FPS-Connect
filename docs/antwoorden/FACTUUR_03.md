# Antwoorden en bevindingen — FACTUUR_03

## 8 augustus 2026 · stand op commit `875c2141`

**Vraag (aanvulling René):** "René keurt goed" moet een rol met instelbare bedragsgrenzen worden, geen persoon. Past dit binnen de lopende taak of wordt het een vervolgtaak?

**Antwoord:** het past **binnen de taak zelf**. FACTUUR_03 is nog niet in aanbouw (WVB_01 loopt eerst), dus de aanvulling gaat vanaf het eerste ontwerp mee:

1. Factuurgoedkeuring via de bestaande goedkeuringsmotor (`/goedkeuring/beleidsregels`): beleidsregel op **rol** + bedragsgrens, instelbaar in beheer — niets in code.
2. Onder de grens keurt de aangewezen rol; daarboven de directierol (als rol, niet als persoon).
3. **Betaalbatch vrijgeven blijft één vaste poort** bij de directierol — zonder bedragsgrens, zonder delegatie; bewust een ander mechanisme dan factuurgoedkeuring.
4. Nooit automatische goedkeuring, ongeacht bedrag.

- **GEMETEN:** `/goedkeuring/beleidsregels` bestaat en wordt al gebruikt als generieke goedkeuringsmotor (governance-engine, pilot-patroon 422+viaGoedkeuring).
- **AANGENOMEN:** nog niets — het ontwerp wordt bij de bouw van FACTUUR_03 tegen de dan geldende code gemeten.
