---
name: Herschik/reorder-endpoint patroon
description: Vereisten voor endpoints die een volgorde-kolom hertellen (herschikken van regels/items).
---
Regel: een reorder-endpoint doet lezen → herschikken → hertellen volledig binnen ÉÉN transactie, geserialiseerd per parent-entiteit (transactie-advisory-lock); en ouder-kindrelaties tellen alleen mee binnen dezelfde groepsgrens (hoofdstuk/eenheid/sectie) — cross-groep kinderen blijven in hun eigen groep, en create/update valideert dat kind en ouder dezelfde groep delen.

**Why:** snapshot buiten de transactie laat gelijktijdige verplaatsingen interleaven (dubbele volgordes), en een kind met ouder in een andere groep zou anders over hoofdstuk-/eenheidgrenzen meegesleept worden.

**How to apply:** bij elk endpoint dat volgordes hertelt. Bewijs met een concurrency-test (parallelle verzoeken → unieke, aaneengesloten volgordes) én een cross-groep-kind-test. UI: kinderen visueel onder ouder ordenen los van de rauwe volgorde.
