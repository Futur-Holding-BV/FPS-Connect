-- CI_POORT_HERSTEL_01 — korte database-lease voor de dagelijkse rode-CI-mail.
-- De succesvolle verzendtijd blijft apart staan; bij een procescrash mag een
-- verlopen claim opnieuw worden opgepakt zonder een hele waarschuwingsdag over
-- te slaan.

ALTER TABLE ci_rapporten
  ADD COLUMN IF NOT EXISTS aanhoudend_rood_mail_claim_op timestamp;