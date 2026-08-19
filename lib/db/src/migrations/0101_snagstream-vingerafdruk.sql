-- SHA-256 van de PDF-inhoud. Bestaande rijen worden via de idempotente
-- Snagstream-backfill gevuld, omdat alleen de applicatie de objectopslag kan lezen.
ALTER TABLE snagstream_rapporten
  ADD COLUMN IF NOT EXISTS vingerafdruk text;

CREATE INDEX IF NOT EXISTS snagstream_rapporten_vingerafdruk_idx
  ON snagstream_rapporten (vingerafdruk)
  WHERE vingerafdruk IS NOT NULL;