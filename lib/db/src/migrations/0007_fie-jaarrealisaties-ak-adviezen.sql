-- FINANCIEEL_AI_01 — realisatiecijfers per boekjaar × werkmaatschappij en
-- AK-adviezen met controller-levenscyclus (nooit automatisch verval).

CREATE TABLE IF NOT EXISTS fie_jaarrealisaties (
  id serial PRIMARY KEY,
  boekjaar integer NOT NULL,
  werkgever_id integer REFERENCES werkgevers(id) ON DELETE SET NULL,
  omzet_gefactureerd real,
  ohw_mutatie real,
  personeelskosten_totaal real,
  bron text NOT NULL DEFAULT 'jaarrekening',
  opmerkingen text,
  aangemaakt_op timestamp NOT NULL DEFAULT now(),
  bijgewerkt_op timestamp NOT NULL DEFAULT now()
);

-- Eén realisatie per boekjaar per werkmaatschappij (NULL = geconsolideerd,
-- aparte partiële index omdat NULL != NULL in een gewone unique).
CREATE UNIQUE INDEX IF NOT EXISTS fie_jaarrealisaties_boekjaar_werkgever_uniek
  ON fie_jaarrealisaties (boekjaar, werkgever_id) WHERE werkgever_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS fie_jaarrealisaties_boekjaar_geheel_uniek
  ON fie_jaarrealisaties (boekjaar) WHERE werkgever_id IS NULL;

CREATE TABLE IF NOT EXISTS fie_ak_adviezen (
  id serial PRIMARY KEY,
  werkgever_id integer REFERENCES werkgevers(id) ON DELETE SET NULL,
  categorie text NOT NULL DEFAULT 'overig',
  titel text NOT NULL,
  advies text NOT NULL,
  vervolgstap text,
  bedrag real NOT NULL DEFAULT 0,
  cijfers text,
  bron_vermelding text,
  dedup_sleutel text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  afhandel_reden text,
  afgehandeld_door_id integer,
  afgehandeld_op timestamp,
  aangemaakt_op timestamp NOT NULL DEFAULT now(),
  bijgewerkt_op timestamp NOT NULL DEFAULT now()
);

-- Dedup: zolang een advies open of weggezet is, mag dezelfde bevinding niet
-- opnieuw worden aangemaakt (afgehandelde adviezen mogen wel terugkomen als
-- het patroon opnieuw optreedt).
CREATE UNIQUE INDEX IF NOT EXISTS fie_ak_adviezen_dedup_open_uniek
  ON fie_ak_adviezen (dedup_sleutel) WHERE status IN ('open', 'weggezet');
CREATE INDEX IF NOT EXISTS fie_ak_adviezen_status_bedrag_idx
  ON fie_ak_adviezen (status, bedrag DESC);
