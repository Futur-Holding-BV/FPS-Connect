-- WERKBAK_01: één werkbak per persoon + logboek van bewakingsdraaien.
-- Additief; bestaande signaal-/meldingtabellen blijven ongewijzigd de detailbron.

CREATE TABLE IF NOT EXISTS werkbak_items (
  id serial PRIMARY KEY,
  soort text NOT NULL,
  bron text NOT NULL,
  titel text NOT NULL,
  omschrijving text,
  gebruiker_id integer REFERENCES gebruikers(id) ON DELETE CASCADE,
  vereiste_module text,
  vereist_niveau integer,
  alleen_hoofdbeheerder boolean NOT NULL DEFAULT false,
  gewicht integer NOT NULL DEFAULT 0,
  actie_pad text,
  actie_type text,
  herkomst_type text NOT NULL,
  herkomst_id integer,
  dedup_sleutel text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  afgehandeld_door_id integer REFERENCES gebruikers(id) ON DELETE SET NULL,
  afgehandeld_op timestamp,
  weggezet_reden text,
  aangemaakt_op timestamp NOT NULL DEFAULT now(),
  bijgewerkt_op timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS werkbak_items_open_dedup_uq
  ON werkbak_items (dedup_sleutel) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS werkbak_items_status_idx ON werkbak_items (status);
CREATE INDEX IF NOT EXISTS werkbak_items_gebruiker_idx ON werkbak_items (gebruiker_id);

CREATE TABLE IF NOT EXISTS bewaking_draaien (
  id serial PRIMARY KEY,
  gestart_op timestamp NOT NULL DEFAULT now(),
  klaar_op timestamp,
  status text NOT NULL DEFAULT 'bezig',
  samenvatting jsonb,
  fout text
);
