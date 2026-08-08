---
name: Importmodule (IMPORT_01)
description: Rechtenafleiding, controle→uitvoeren-cachekoppeling en terugdraai-regels van de importmodule
---

- Importrecht per type = niveau 4 op de doelmodule (crm/magazijn/personeel/gebouwen/calculaties/financieel); geen aparte rechtenlijst. Logboek = leesrecht ≥1 op één van die zes. Frontend-spiegel in `import-rechten.ts`.
- **Cache-koppeling (in-memory `bestandCache`)**: bestand_id is gebonden aan de uploader (403 voor anderen), uitvoeren zet een `inUitvoering`-grendel (409 bij dubbel verzoek; loslaten in catch), en vlak vóór de inserts wordt de dubbelen-set vers herladen — rijen die ná de controle elders zijn toegevoegd worden nooit stil dubbel geïmporteerd (alleen bij expliciete keuze "als_nieuw").
- **Terugdraaien**: log-claim atomair via `UPDATE … WHERE teruggedraaid_op IS NULL RETURNING` (nooit check-dan-schrijf); "gewijzigd na import" per rij bepalen (bijgewerkt_op > aangemaakt_op + 2s), nooit op basis van log-tijd + marge.
- Bronbestand opslaan is verplicht vóór er records geschreven worden; bij opslagfout wordt de log verwijderd en faalt de import expliciet (geen stille voortzetting).
- **Why:** architect-review vond dat de eerste versie onder concurrentie dubbelen kon maken en terugdraaien onnauwkeurig was; deze vier regels zijn de reparatie.
- **How to apply:** elke wijziging aan `routes/import.ts` (nieuw importtype, extra stap) moet deze vier garanties intact laten; gedragsbewijs herdraaien via `scripts/src/verificatie-import01.ts`.
