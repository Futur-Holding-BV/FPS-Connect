-- ADMINISTRATIE_02 §1: btw-codes per administratie (werkmaatschappij).
-- Btw-code was overal vrije tekst (facturen, factuurregels, leveranciers,
-- eenheidsprijzen, aangeleerde voorkeuren). Deze tabel wordt de enige
-- keuzelijst: code + omschrijving + percentage, per werkmaatschappij (BV),
-- gevuld via AccountView-sync of een ingelezen lijst. Boeken met een code
-- buiten het schema wordt door de exportservice geweigerd zodra het schema
-- van die BV gevuld is (zelfde besluit als het rekeningschema: leeg schema
-- laat door, anders valt de boekingsstroom stil vóór het schema bestaat).
CREATE TABLE IF NOT EXISTS btw_codes (
  id serial PRIMARY KEY,
  werkgever_id integer NOT NULL REFERENCES werkgevers(id) ON DELETE CASCADE,
  code text NOT NULL,
  omschrijving text NOT NULL DEFAULT '',
  percentage real,
  actief boolean NOT NULL DEFAULT true,
  bron text NOT NULL DEFAULT 'import',
  aangemaakt_op timestamp NOT NULL DEFAULT now(),
  bijgewerkt_op timestamp NOT NULL DEFAULT now(),
  CONSTRAINT btw_codes_wg_code_uniek UNIQUE (werkgever_id, code)
);
CREATE INDEX IF NOT EXISTS btw_codes_wg_idx ON btw_codes (werkgever_id);
