---
name: Document Studio bulk-generatie
description: Claim-patroon en tussenstatus voor AI-bulkgeneratie van Studio-modellen
---

Bulk "genereer ontbrekende modellen" (Document Studio) is race-gevoelig: het schema staat meerdere niet-goedgekeurde rijen per (werkgever, documenttype) toe — alleen `goedgekeurd` heeft een partiële unieke index.

**Regel:** claim eerst atomair in één transactie onder `pg_advisory_xact_lock(874201, werkgeverId)` en zet geclaimde rijen op tussenstatus `genererend`; doe de AI-aanroep daarna búiten de transactie (begrensde parallelliteit, max 4). Bij falen status terugzetten naar de vorige waarde (guard op `status='genererend'`).

**Why:** twee gelijktijdige bulk-runs lazen anders dezelfde "ontbrekend"-set en produceerden dubbele concepten (architect-afwijzing); lock vasthouden tijdens AI-aanroepen zou de pool leegtrekken.

**How to apply:** elke plek die Studio-modellen aanmaakt/genereert moet `genererend` behandelen: single-genereer geeft er 409 op, upsert hergebruikt de rij. Status is een text-kolom — geen migratie nodig, wel frontend STATUS_CONFIG. Referentiebestand is sinds aug 2026 optioneel: zonder referentie genereert AI op huisstijl.
