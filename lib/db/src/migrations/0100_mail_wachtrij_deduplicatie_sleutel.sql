-- Permanente, domein-specifieke deduplicatie voor periodieke systeemmails.
-- De bestaande index ziet alleen dubbele items die nog 'wachtend' zijn.
ALTER TABLE mail_wachtrij
  ADD COLUMN IF NOT EXISTS deduplicatie_sleutel text;

CREATE UNIQUE INDEX IF NOT EXISTS mail_wachtrij_deduplicatie_sleutel_uniek
  ON mail_wachtrij (deduplicatie_sleutel)
  WHERE deduplicatie_sleutel IS NOT NULL;