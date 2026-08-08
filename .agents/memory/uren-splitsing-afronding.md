---
name: Urenverhouding AK-dashboard — afronding
description: Dekking/percentages op ruwe sommen berekenen; afronden alleen voor weergave.
---
Regel: bij aggregaties over `netto_uren` (real) moeten dekkingsvlaggen ("dekkend", "geen uren geregistreerd") en percentages uit de ONafgeronde sommen komen; alleen de getoonde uren op 1 decimaal afronden.

**Why:** 0,25 uur rondt naar 0 hele uren → vals "geen uren geregistreerd", en code review wijst dat af. Bovendien: als twee paden (bevinding vs. tabel) elk hun eigen berekening doen, kunnen ze elkaar tegenspreken — één gedeelde berekenfunctie (`berekenUrenSplitsingJaar` in akEigenCijfers.ts) voorkomt dat.

**How to apply:** nieuwe uren-/geldaggregaties: pure berekenfunctie met ruwe input + unit-test op fractionele waarden; route-paden delen die functie. Let op: `uren_registraties.datum` is een tekstkolom — jaar via `substr(datum,1,4)`, niet `extract(year from …)`.
