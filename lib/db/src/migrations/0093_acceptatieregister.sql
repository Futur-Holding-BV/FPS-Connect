-- REGISTER_01: acceptatieregister — één regel per acceptatiepunt per opdracht.
-- Vervangt het te grove vinkje-per-opdracht (VOLLEDIGHEID_01 vervallen).
CREATE TABLE IF NOT EXISTS acceptatie_register (
  id SERIAL PRIMARY KEY,
  opdracht_code TEXT NOT NULL,
  punt_nummer INTEGER NOT NULL,
  omschrijving TEXT NOT NULL,
  -- gehaald | niet_gebouwd | onbewezen | wacht_op_rene
  stand TEXT NOT NULL DEFAULT 'onbewezen',
  bewijs_vindplaats TEXT,
  bron_bestand TEXT,
  toelichting TEXT,
  aangemaakt_op TIMESTAMP NOT NULL DEFAULT now(),
  bijgewerkt_op TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT acceptatie_register_uniek UNIQUE (opdracht_code, punt_nummer)
);
CREATE INDEX IF NOT EXISTS acceptatie_register_stand_idx ON acceptatie_register (stand);
