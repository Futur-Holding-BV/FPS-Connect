-- MATERIAAL_01 fase 3 (keuze A, René 2026-08-10): goedkeuring van een
-- materiaal-aanvraag maakt automatisch een concept-inkoopbon op de opdracht.
-- De aanvraag houdt een verwijzing naar het resultaat (harde eis §7.5).

ALTER TABLE materiaal_aanvragen
  ADD COLUMN IF NOT EXISTS inkoopbon_id integer REFERENCES inkoopbonnen(id) ON DELETE SET NULL;

-- Eén automatische bon hoort bij precies één aanvraag (nooit-tweede-bon op
-- DB-niveau, naast de conditionele claim in de goedkeurings-transactie).
CREATE UNIQUE INDEX IF NOT EXISTS materiaal_aanvragen_inkoopbon_id_uniek
  ON materiaal_aanvragen (inkoopbon_id) WHERE inkoopbon_id IS NOT NULL;
