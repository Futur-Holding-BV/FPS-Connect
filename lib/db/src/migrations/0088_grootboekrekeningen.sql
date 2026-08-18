-- ADMINISTRATIE_01 aanvulling: rekeningschema per werkmaatschappij.
-- Grootboekrekening was overal vrije tekst (facturen, factuurregels,
-- leveranciers, instellingen). Dit schema wordt de enige keuzelijst:
-- nummer + omschrijving + soort, per werkmaatschappij (BV), gevuld via
-- AccountView-sync of een ingelezen lijst. Boeken op een rekening buiten
-- het schema wordt door de exportservice geweigerd zodra het schema van
-- die BV gevuld is.
CREATE TABLE IF NOT EXISTS grootboekrekeningen (
  id serial PRIMARY KEY,
  werkgever_id integer NOT NULL REFERENCES werkgevers(id) ON DELETE CASCADE,
  nummer text NOT NULL,
  omschrijving text NOT NULL DEFAULT '',
  soort text,
  actief boolean NOT NULL DEFAULT true,
  bron text NOT NULL DEFAULT 'import',
  aangemaakt_op timestamp NOT NULL DEFAULT now(),
  bijgewerkt_op timestamp NOT NULL DEFAULT now(),
  CONSTRAINT grootboekrekeningen_wg_nummer_uniek UNIQUE (werkgever_id, nummer)
);
CREATE INDEX IF NOT EXISTS grootboekrekeningen_wg_idx ON grootboekrekeningen (werkgever_id);
