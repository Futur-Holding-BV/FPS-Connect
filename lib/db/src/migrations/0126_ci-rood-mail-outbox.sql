-- CI_POORT_HERSTEL_01 — duurzame, per-ontvanger verzendstatus voor de
-- dagelijkse rode-CI-waarschuwing. Dit voorkomt dat een reeds bereikte
-- hoofdbeheerder opnieuw mail krijgt wanneer een andere ontvanger faalt.

CREATE TABLE IF NOT EXISTS ci_rood_mail_verzendingen (
  id serial PRIMARY KEY,
  ci_rapport_id integer NOT NULL REFERENCES ci_rapporten(id) ON DELETE CASCADE,
  periode integer NOT NULL CHECK (periode >= 1),
  gebruiker_id integer NOT NULL REFERENCES gebruikers(id),
  ontvanger_email text NOT NULL,
  ontvanger_naam text,
  status text NOT NULL DEFAULT 'wachtend'
    CHECK (status IN ('wachtend', 'verzenden', 'mislukt', 'verzonden')),
  claim_op timestamp,
  pogingen integer NOT NULL DEFAULT 0,
  laatste_fout text,
  verzonden_op timestamp,
  aangemaakt_op timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ci_rood_mail_periode_ontvanger_uniek
  ON ci_rood_mail_verzendingen (ci_rapport_id, periode, gebruiker_id);

CREATE INDEX IF NOT EXISTS ci_rood_mail_openstaand_idx
  ON ci_rood_mail_verzendingen (ci_rapport_id, periode, status)
  WHERE verzonden_op IS NULL;