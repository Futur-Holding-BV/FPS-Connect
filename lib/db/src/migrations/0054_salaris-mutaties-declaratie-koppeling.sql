-- 0054: Koppeling declaraties → loonverwerking.
-- Goedgekeurde declaraties worden automatisch een salarismutatie; via deze
-- FK weten we welke declaratie bij welke mutatie hoort, zodat de declaratie
-- automatisch op "verwerkt" kan zodra de loonaanlevering (SCAB-mail) verzonden is.
ALTER TABLE salaris_mutaties
  ADD COLUMN IF NOT EXISTS declaratie_id integer REFERENCES declaraties(id) ON DELETE SET NULL;

-- Eén mutatie per declaratie (dubbel goedkeuren/races kunnen geen tweede rij maken).
CREATE UNIQUE INDEX IF NOT EXISTS salaris_mutaties_declaratie_id_uniek
  ON salaris_mutaties (declaratie_id)
  WHERE declaratie_id IS NOT NULL;
