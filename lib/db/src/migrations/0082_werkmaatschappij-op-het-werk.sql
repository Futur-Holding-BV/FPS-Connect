-- ADMINISTRATIE_01 fase 3 (René, 18-08-2026): de werkmaatschappij hangt aan
-- de OFFERTE/OPDRACHT (het werk), niet aan het gebouw. Het gebouw levert
-- alleen de standaardwaarde; de BV is op het werk zelf wijzigbaar en wordt
-- dáár vastgelegd (één pand kan werk van meerdere BV's hebben; gebouwveld
-- mag leeg zijn).
--
-- Backfill: bestaande offertes/opdrachten erven eenmalig de BV van hun
-- gebouw (de tot nu toe geldende afleiding); opdrachten met offerte erven
-- van de offerte. Leeg blijft leeg — nooit raden.

ALTER TABLE offertes
  ADD COLUMN IF NOT EXISTS werkmaatschappij_id integer
    REFERENCES werkgevers(id) ON DELETE SET NULL;

ALTER TABLE opdrachten
  ADD COLUMN IF NOT EXISTS werkmaatschappij_id integer
    REFERENCES werkgevers(id) ON DELETE SET NULL;

UPDATE offertes o
SET werkmaatschappij_id = g.werkgever_id
FROM gebouwen g
WHERE o.werkmaatschappij_id IS NULL
  AND o.gebouw_id = g.id
  AND g.werkgever_id IS NOT NULL;

UPDATE opdrachten op
SET werkmaatschappij_id = ofr.werkmaatschappij_id
FROM offertes ofr
WHERE op.werkmaatschappij_id IS NULL
  AND op.offerte_id = ofr.id
  AND ofr.werkmaatschappij_id IS NOT NULL;

UPDATE opdrachten op
SET werkmaatschappij_id = g.werkgever_id
FROM gebouwen g
WHERE op.werkmaatschappij_id IS NULL
  AND op.gebouw_id = g.id
  AND g.werkgever_id IS NOT NULL;

-- AccountView: vastleggen voor welke BV deze koppeling/administratie boekt.
-- Bewust GEEN backfill: zolang dit leeg is weigert de export fail-closed.
ALTER TABLE accountview_instellingen
  ADD COLUMN IF NOT EXISTS werkgever_id integer
    REFERENCES werkgevers(id) ON DELETE SET NULL;
