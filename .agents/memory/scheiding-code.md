---
name: Scheiding-code op de plattegrondlijn
description: Hoe de brandwerendheidscode (EW60, WRD30 etc.) op een getekende scheidingslijn wordt opgeslagen en getoond.
---

## Regel
De code op een scheidingslijn = classificatie-prefix (WRD/EW/EI/E/R/Sa) + WBDBO-minuten, samengevoegd tot bv. "EW60". Dit wordt opgeslagen in het bestaande `scheidingenTable.waarde` (vrij text-veld) — GEEN aparte DB-kolom of OpenAPI-wijziging nodig.

**Why:** `waarde` was al een vrij string-veld dat eerder alleen minuten ("60") bevatte. Combineren in dat veld vermijdt een schema-migratie. Oude rijen met alleen minuten blijven gewoon weergeven (rendering toont `s.waarde` rauw).

**How to apply:**
- Het formulier (scheidingForm) houdt `classificatie` + `waarde` apart; bij opslaan worden ze samengevoegd.
- Op de plattegrond wordt de code als bolletje (witte cirkel, gekleurde rand + tekst) op het midpunt van de polyline getekend, niet als rechthoek.
- Lettergrootte schaalt met codelengte (>=6 tekens kleiner) om overflow in de r=18 cirkel te beperken.
- Legenda/selectiepaneel toont `s.waarde` zonder " min" suffix (de code bevat zelf al de betekenis).
