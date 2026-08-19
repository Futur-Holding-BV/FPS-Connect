-- Camera-telling: server-side binding van uitgegeven upload-paden aan telling +
-- aanvrager. Vakken aanmaken accepteert alleen een eigen, nog ongebruikt
-- geclaimd pad — nooit een willekeurig client-aangeleverd objectpad.
CREATE TABLE voorraad_telling_foto_claims (
  id                  serial PRIMARY KEY,
  telling_id          integer NOT NULL REFERENCES voorraad_tellingen(id) ON DELETE CASCADE,
  object_path         text NOT NULL UNIQUE,
  aangevraagd_door_id integer REFERENCES gebruikers(id) ON DELETE SET NULL,
  gebruikt            boolean NOT NULL DEFAULT false,
  aangemaakt_op       timestamp NOT NULL DEFAULT now()
);

CREATE INDEX voorraad_telling_foto_claims_telling_idx ON voorraad_telling_foto_claims(telling_id);
