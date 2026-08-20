-- CI_POORT_HERSTEL_01 — een ontvanger die vóór (her)verzending geen actieve
-- hoofdbeheerder meer is wordt terminal overgeslagen.

ALTER TABLE ci_rood_mail_verzendingen
  DROP CONSTRAINT IF EXISTS ci_rood_mail_verzendingen_status_check;

ALTER TABLE ci_rood_mail_verzendingen
  ADD CONSTRAINT ci_rood_mail_verzendingen_status_check
  CHECK (status IN ('wachtend', 'verzenden', 'mislukt', 'verzonden', 'overgeslagen'));