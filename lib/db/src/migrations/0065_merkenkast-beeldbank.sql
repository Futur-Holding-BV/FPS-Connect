-- MERK_01 — Merkenkast en beeldbank per werkmaatschappij.
-- Deel A: de werkgever-huisstijl (de ene bron voor documentopmaak) wordt
-- uitgebreid met logo-varianten, merkkleuren, lettertype en bedrijfsomschrijvingen.
-- Geen tweede plek: de merkenkast leest deze zelfde kolommen.
ALTER TABLE werkgevers
  ADD COLUMN IF NOT EXISTS logo_varianten jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS merk_kleuren jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS lettertype text,
  ADD COLUMN IF NOT EXISTS omschrijving_kort text,
  ADD COLUMN IF NOT EXISTS omschrijving_lang text;

-- Deel B: handmatige uploads in de beeldbank. Automatische bronnen (spot-,
-- opname- en inspectiefoto's) worden live geaggregeerd, niet gekopieerd.
CREATE TABLE IF NOT EXISTS beeldbank_uploads (
  id serial PRIMARY KEY,
  object_path text NOT NULL,
  bijschrift text,
  gebouw_id integer REFERENCES gebouwen(id) ON DELETE SET NULL,
  opdracht_id integer REFERENCES opdrachten(id) ON DELETE SET NULL,
  werksoort text,
  gemaakt_door_id integer REFERENCES gebruikers(id) ON DELETE SET NULL,
  aangemaakt_op timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS beeldbank_uploads_gebouw_idx ON beeldbank_uploads (gebouw_id);
