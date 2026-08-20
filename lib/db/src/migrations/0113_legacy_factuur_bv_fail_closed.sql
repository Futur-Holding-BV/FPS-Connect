-- Correctie op 0102: een historische fiscale BV mag niet worden afgeleid uit
-- een actuele, muteerbare offerte/opdracht/gebouw-koppeling. 0102 en 0103
-- worden in productie in dezelfde migratierun uitgevoerd, vóór de nieuwe API
-- start. Daarom worden de best-effort waarden hier bewust teruggenomen.
--
-- Vanaf deze migratie schrijven /definitief en /crediteren werkgever_id samen
-- met werkgever_vastgelegd_op. Zonder marker blijft legacy fail-closed totdat
-- een aparte, auditeerbare herstelactie de uitgevende BV expliciet vastlegt.
ALTER TABLE facturen
  ADD COLUMN IF NOT EXISTS werkgever_vastgelegd_op timestamptz;

UPDATE facturen
SET werkgever_id = NULL,
    werkgever_vastgelegd_op = NULL
WHERE werkgever_id IS NOT NULL
  AND werkgever_vastgelegd_op IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'facturen_werkgever_snapshot_compleet_check'
  ) THEN
    ALTER TABLE facturen
      ADD CONSTRAINT facturen_werkgever_snapshot_compleet_check
      CHECK (
        (werkgever_id IS NULL AND werkgever_vastgelegd_op IS NULL)
        OR
        (werkgever_id IS NOT NULL AND werkgever_vastgelegd_op IS NOT NULL)
      );
  END IF;
END $$;