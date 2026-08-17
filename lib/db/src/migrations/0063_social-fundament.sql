-- SOCIAL_01 — social media plannen, publiceren en meten.
-- Koppelingen per werkmaatschappij per kanaal; berichten met per-kanaal
-- varianten; statusmachine concept → klaar → gepland → geplaatst.

CREATE TABLE IF NOT EXISTS social_koppelingen (
  id serial PRIMARY KEY,
  werkgever_id integer NOT NULL REFERENCES werkgevers(id) ON DELETE CASCADE,
  kanaal text NOT NULL CHECK (kanaal IN ('linkedin','facebook','instagram','tiktok')),
  account_naam text NOT NULL,
  modus text NOT NULL DEFAULT 'klaarzetten' CHECK (modus IN ('publiceren','klaarzetten')),
  status text NOT NULL DEFAULT 'actief' CHECK (status IN ('actief','verlopen','ingetrokken')),
  access_token text,
  refresh_token text,
  verloopt_op timestamp,
  laatst_vernieuwd_op timestamp,
  laatste_fout text,
  verloop_taak_op timestamp,
  aangemaakt_door_id integer REFERENCES gebruikers(id) ON DELETE SET NULL,
  aangemaakt_op timestamp NOT NULL DEFAULT now(),
  bijgewerkt_op timestamp NOT NULL DEFAULT now(),
  CONSTRAINT social_koppelingen_wg_kanaal_uq UNIQUE (werkgever_id, kanaal)
);

CREATE TABLE IF NOT EXISTS social_berichten (
  id serial PRIMARY KEY,
  werkgever_id integer NOT NULL REFERENCES werkgevers(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'concept' CHECK (status IN ('concept','klaar','gepland','geplaatst')),
  tekst text NOT NULL DEFAULT '',
  media_pad text,
  media_type text CHECK (media_type IS NULL OR media_type IN ('beeld','video')),
  visual_id integer,
  gepland_op timestamp,
  campagne_id integer REFERENCES marketing_campagnes(id) ON DELETE SET NULL,
  crm_klant_id integer REFERENCES crm_klanten(id) ON DELETE SET NULL,
  gebouw_id integer REFERENCES gebouwen(id) ON DELETE SET NULL,
  maker_id integer REFERENCES gebruikers(id) ON DELETE SET NULL,
  planner_id integer REFERENCES gebruikers(id) ON DELETE SET NULL,
  klaar_op timestamp,
  geplaatst_op timestamp,
  aangemaakt_op timestamp NOT NULL DEFAULT now(),
  bijgewerkt_op timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS social_berichten_wg_gepland_idx ON social_berichten (werkgever_id, gepland_op);
CREATE INDEX IF NOT EXISTS social_berichten_status_gepland_idx ON social_berichten (status, gepland_op);

CREATE TABLE IF NOT EXISTS social_bericht_kanalen (
  id serial PRIMARY KEY,
  bericht_id integer NOT NULL REFERENCES social_berichten(id) ON DELETE CASCADE,
  kanaal text NOT NULL CHECK (kanaal IN ('linkedin','facebook','instagram','tiktok')),
  tekst_override text,
  plaatsing_status text NOT NULL DEFAULT 'wachtend' CHECK (plaatsing_status IN ('wachtend','geplaatst','concept_klaargezet','mislukt')),
  extern_id text,
  geplaatst_op timestamp,
  concept_klaargezet_op timestamp,
  pogingen integer NOT NULL DEFAULT 0,
  laatste_poging_op timestamp,
  laatste_fout text,
  taak_gemaakt boolean NOT NULL DEFAULT false,
  cijfers jsonb,
  cijfers_opgehaald_op timestamp,
  aangemaakt_op timestamp NOT NULL DEFAULT now(),
  bijgewerkt_op timestamp NOT NULL DEFAULT now(),
  CONSTRAINT social_bericht_kanalen_uq UNIQUE (bericht_id, kanaal)
);
CREATE INDEX IF NOT EXISTS social_bericht_kanalen_status_idx ON social_bericht_kanalen (plaatsing_status);
