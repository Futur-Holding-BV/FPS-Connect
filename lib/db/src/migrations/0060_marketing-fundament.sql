-- MARKETING_01 — Fase 1 fundament
-- 1) Toestemming, afmelding en onbestelbaar-markering op contactpersonen.
-- 2) Doelgroepen, sjablonen, campagnes en campagne-ontvangers.

ALTER TABLE crm_contactpersonen
  ADD COLUMN IF NOT EXISTS mail_toestemming boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mail_toestemming_op timestamp,
  ADD COLUMN IF NOT EXISTS mail_toestemming_bron text,
  ADD COLUMN IF NOT EXISTS mail_afgemeld_op timestamp,
  ADD COLUMN IF NOT EXISTS mail_onbestelbaar_op timestamp,
  ADD COLUMN IF NOT EXISTS mail_onbestelbaar_reden text;

CREATE TABLE IF NOT EXISTS marketing_doelgroepen (
  id serial PRIMARY KEY,
  naam text NOT NULL,
  omschrijving text,
  criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
  aangemaakt_door_id integer REFERENCES gebruikers(id) ON DELETE SET NULL,
  aangemaakt_op timestamp NOT NULL DEFAULT now(),
  bijgewerkt_op timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketing_sjablonen (
  id serial PRIMARY KEY,
  naam text NOT NULL,
  onderwerp text NOT NULL,
  inhoud text NOT NULL,
  aangemaakt_door_id integer REFERENCES gebruikers(id) ON DELETE SET NULL,
  aangemaakt_op timestamp NOT NULL DEFAULT now(),
  bijgewerkt_op timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketing_campagnes (
  id serial PRIMARY KEY,
  naam text NOT NULL,
  doel text,
  doelgroep_id integer REFERENCES marketing_doelgroepen(id) ON DELETE SET NULL,
  sjabloon_id integer REFERENCES marketing_sjablonen(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'concept',
  gepland_op timestamp,
  proef_verzonden_op timestamp,
  proef_verzonden_door_id integer REFERENCES gebruikers(id) ON DELETE SET NULL,
  gestart_op timestamp,
  afgerond_op timestamp,
  gestopt_op timestamp,
  gestopt_reden text,
  aangemaakt_door_id integer REFERENCES gebruikers(id) ON DELETE SET NULL,
  aangemaakt_op timestamp NOT NULL DEFAULT now(),
  bijgewerkt_op timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketing_campagne_ontvangers (
  id serial PRIMARY KEY,
  campagne_id integer NOT NULL REFERENCES marketing_campagnes(id) ON DELETE CASCADE,
  contactpersoon_id integer NOT NULL REFERENCES crm_contactpersonen(id) ON DELETE CASCADE,
  klant_id integer REFERENCES crm_klanten(id) ON DELETE SET NULL,
  email text NOT NULL,
  afmeld_token text NOT NULL,
  status text NOT NULL DEFAULT 'gepland',
  verzonden_op timestamp,
  geopend_op timestamp,
  geklikt_op timestamp,
  gebounced_op timestamp,
  afgemeld_op timestamp,
  aangemaakt_op timestamp NOT NULL DEFAULT now(),
  CONSTRAINT marketing_campagne_ontvangers_uq UNIQUE (campagne_id, contactpersoon_id),
  CONSTRAINT marketing_campagne_ontvangers_token_uq UNIQUE (afmeld_token)
);

CREATE INDEX IF NOT EXISTS marketing_campagne_ontvangers_campagne_idx
  ON marketing_campagne_ontvangers (campagne_id);
