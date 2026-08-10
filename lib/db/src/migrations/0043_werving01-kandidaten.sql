-- WERVING_01: wervingsmodule — kandidaten, kernvragen per functie,
-- gespreksvragenlijst. Plus AVG-opschoonlog-teller voor verwijderde kandidaten.

CREATE TABLE IF NOT EXISTS werving_kandidaten (
  id serial PRIMARY KEY,
  functie_id integer NOT NULL REFERENCES functies(id),
  naam text NOT NULL,
  email text,
  telefoon text,
  kanaal text NOT NULL DEFAULT 'onbekend',
  status text NOT NULL DEFAULT 'ontvangen',
  toestemming_bewaring boolean NOT NULL DEFAULT false,
  procedure_afgerond_op timestamp,
  cv_object_path text,
  cv_bestandsnaam text,
  cv_mime text,
  toetsing jsonb,
  toetsing_op timestamp,
  eindconclusie text,
  aangemaakt_op timestamp NOT NULL DEFAULT now(),
  bijgewerkt_op timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS werving_kandidaten_functie_idx ON werving_kandidaten (functie_id);

CREATE TABLE IF NOT EXISTS functie_kernvragen (
  id serial PRIMARY KEY,
  functie_id integer NOT NULL REFERENCES functies(id) ON DELETE CASCADE,
  volgorde integer NOT NULL DEFAULT 0,
  vraag text NOT NULL,
  aangemaakt_op timestamp NOT NULL DEFAULT now(),
  bijgewerkt_op timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS functie_kernvragen_functie_idx ON functie_kernvragen (functie_id);

CREATE TABLE IF NOT EXISTS werving_vragen (
  id serial PRIMARY KEY,
  kandidaat_id integer NOT NULL REFERENCES werving_kandidaten(id) ON DELETE CASCADE,
  volgorde integer NOT NULL DEFAULT 0,
  bron text NOT NULL DEFAULT 'handmatig',
  vraag text NOT NULL,
  aantekening text,
  aangemaakt_op timestamp NOT NULL DEFAULT now(),
  bijgewerkt_op timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS werving_vragen_kandidaat_idx ON werving_vragen (kandidaat_id);

ALTER TABLE avg_opschoon_log
  ADD COLUMN IF NOT EXISTS kandidaten_verwijderd integer NOT NULL DEFAULT 0;
