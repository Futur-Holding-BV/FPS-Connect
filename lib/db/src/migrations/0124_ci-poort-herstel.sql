-- CI_POORT_HERSTEL_01
-- 1. Onthoudt wanneer de bestaande dagelijkse bewakingsloop voor het laatst
--    over een onafgebroken rode CI-periode heeft gemaild.
-- 2. Legt uitsluitend werkelijk noodfixgebruik append-only vast.

ALTER TABLE ci_rapporten
  ADD COLUMN IF NOT EXISTS aanhoudend_rood_mail_op timestamp;

CREATE TABLE IF NOT EXISTS noodfix_uitrol_gebruik (
  id             serial PRIMARY KEY,
  commit_sha     text NOT NULL,
  actor          text NOT NULL,
  reden          text NOT NULL,
  run_url        text NOT NULL,
  run_id         bigint NOT NULL,
  run_attempt    bigint NOT NULL,
  bypass_soort   text NOT NULL DEFAULT 'ci_en_predeploy',
  aangemaakt_op  timestamp NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS noodfix_uitrol_run_poging_uniek
  ON noodfix_uitrol_gebruik (run_id, run_attempt);

CREATE INDEX IF NOT EXISTS noodfix_uitrol_aangemaakt_idx
  ON noodfix_uitrol_gebruik (aangemaakt_op DESC);

CREATE OR REPLACE FUNCTION noodfix_uitrol_gebruik_append_only()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'noodfix_uitrol_gebruik is append-only: % is niet toegestaan', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS noodfix_uitrol_geen_update ON noodfix_uitrol_gebruik;
CREATE TRIGGER noodfix_uitrol_geen_update
  BEFORE UPDATE ON noodfix_uitrol_gebruik
  FOR EACH ROW EXECUTE FUNCTION noodfix_uitrol_gebruik_append_only();

DROP TRIGGER IF EXISTS noodfix_uitrol_geen_delete ON noodfix_uitrol_gebruik;
CREATE TRIGGER noodfix_uitrol_geen_delete
  BEFORE DELETE ON noodfix_uitrol_gebruik
  FOR EACH ROW EXECUTE FUNCTION noodfix_uitrol_gebruik_append_only();