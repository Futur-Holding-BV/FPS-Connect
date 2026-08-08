-- NOTITIE_01: losse aantekeningen bij een gebouw + initialen op de gebruiker
-- Aantekeningen zijn losse regels (nooit overschrijven), soft delete = doorhalen.

CREATE TABLE IF NOT EXISTS gebouw_notities (
  id serial PRIMARY KEY,
  gebouw_id integer NOT NULL REFERENCES gebouwen(id) ON DELETE CASCADE,
  gebruiker_id integer NOT NULL REFERENCES gebruikers(id) ON DELETE CASCADE,
  tekst text NOT NULL,
  type text NOT NULL DEFAULT 'algemeen',
  beller_naam text,
  aangemaakt_op timestamp NOT NULL DEFAULT now(),
  bewerkt_op timestamp,
  verwijderd_op timestamp,
  verwijderd_door_id integer REFERENCES gebruikers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS gebouw_notities_gebouw_id_idx ON gebouw_notities (gebouw_id, aangemaakt_op DESC);

ALTER TABLE gebruikers ADD COLUMN IF NOT EXISTS initialen text;
