-- UREN_01 §6c — de mandagstaat (mandagenregister) die met de factuur meegaat.
-- Additief en genummerd (drift-gecheckt, GEEN drizzle push), zoals 0040/0041.
--
-- §6c.2: per opdracht instelbaar of een mandagstaat vereist is; standaard uit.
ALTER TABLE opdrachten
  ADD COLUMN IF NOT EXISTS mandagstaat_vereist boolean NOT NULL DEFAULT false;

-- §6c.3: elke generatie vastleggen — wie/wanneer/welk werk (opdracht + week).
-- BEWUST GEEN BSN in deze log; het BSN mag alleen op het document zelf staan.
CREATE TABLE IF NOT EXISTS mandagstaat_logs (
  id                   SERIAL PRIMARY KEY,
  opdracht_id          integer NOT NULL REFERENCES opdrachten(id) ON DELETE CASCADE,
  jaar                 integer NOT NULL,
  week_nummer          integer NOT NULL,
  gegenereerd_door_id  integer REFERENCES gebruikers(id) ON DELETE SET NULL,
  gegenereerd_op       timestamp NOT NULL DEFAULT now(),
  medewerker_aantal    integer NOT NULL DEFAULT 0,
  uren_totaal          numeric(10,2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS mandagstaat_logs_opdracht_idx
  ON mandagstaat_logs (opdracht_id, jaar, week_nummer);
