-- Gebruikergebonden, kortlevende registratie voor presigned Snagstream-uploads.
-- Hiermee accepteert de voltooi-route nooit een willekeurig objectpad uit de browser.
CREATE TABLE IF NOT EXISTS snagstream_uploads (
  id serial PRIMARY KEY,
  token text NOT NULL UNIQUE,
  object_path text NOT NULL,
  bestandsnaam text NOT NULL,
  vingerafdruk text NOT NULL,
  bestandsgrootte integer NOT NULL,
  gebruiker_id integer NOT NULL REFERENCES gebruikers(id) ON DELETE CASCADE,
  verloopt_op timestamp NOT NULL,
  aangemaakt_op timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS snagstream_uploads_verloopt_op_idx
  ON snagstream_uploads (verloopt_op);