-- NP_INKOOP_01 — Algemene inkoop (niet-projectgebonden) + eigen A-nummerreeks.
-- De bestaande inkooptabellen blijven ongemoeid (opdracht_id blijft NOT NULL).

CREATE SEQUENCE IF NOT EXISTS seq_nummer_a START WITH 1;

CREATE TABLE IF NOT EXISTS algemene_inkopen (
  id SERIAL PRIMARY KEY,
  nummer INTEGER NOT NULL DEFAULT nextval('seq_nummer_a'),
  soort TEXT NOT NULL,
  status TEXT NOT NULL,
  leverancier_id INTEGER REFERENCES leveranciers(id) ON DELETE SET NULL,
  leverancier_naam TEXT NOT NULL,
  omschrijving TEXT NOT NULL,
  kostensoort TEXT NOT NULL,
  verwacht_bedrag REAL,
  besteld_door_id INTEGER NOT NULL REFERENCES gebruikers(id) ON DELETE RESTRICT,
  betaalwijze TEXT,
  betaald_op TEXT,
  bedrag REAL,
  bon_pad TEXT,
  factuur_id INTEGER REFERENCES facturen(id) ON DELETE SET NULL,
  factuur_gekoppeld_op TIMESTAMP,
  opmerkingen TEXT,
  aangemaakt_op TIMESTAMP NOT NULL DEFAULT now(),
  bijgewerkt_op TIMESTAMP NOT NULL DEFAULT now()
);

-- Nummers zijn uniek binnen de A-reeks; snel opzoeken vanuit de factuurstroom.
CREATE UNIQUE INDEX IF NOT EXISTS algemene_inkopen_nummer_uniek ON algemene_inkopen (nummer);
CREATE INDEX IF NOT EXISTS algemene_inkopen_factuur_idx ON algemene_inkopen (factuur_id);
