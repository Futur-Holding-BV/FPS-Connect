-- AKKOORD_01 §2+§4: akkoord- en conditievelden op de opdracht.
-- Additief; bestaande opdrachten hebben (nog) geen vastgelegd akkoord.
ALTER TABLE opdrachten
  ADD COLUMN IF NOT EXISTS akkoord_grond text,
  ADD COLUMN IF NOT EXISTS akkoord_door_id integer REFERENCES gebruikers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS akkoord_op timestamp,
  ADD COLUMN IF NOT EXISTS akkoord_document_id integer REFERENCES documenten(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS akkoord_herkomst text,
  ADD COLUMN IF NOT EXISTS conditie_betaaltermijn_dagen integer,
  ADD COLUMN IF NOT EXISTS conditie_garantietermijn text,
  ADD COLUMN IF NOT EXISTS conditie_meerwerk text,
  ADD COLUMN IF NOT EXISTS conditie_oplevering text,
  ADD COLUMN IF NOT EXISTS conditie_boete_korting text,
  ADD COLUMN IF NOT EXISTS conditie_voorwaarden_set_id integer REFERENCES offerte_voorwaarden_sets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS conditie_voorwaarden_tekst text;
