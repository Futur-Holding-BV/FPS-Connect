-- GELDSTROOM_01: creditfacturen corrigeren een definitieve verkoopfactuur
-- zonder het fiscale brondocument te wijzigen.
ALTER TABLE facturen
  ADD COLUMN IF NOT EXISTS oorspronkelijke_factuur_id integer;

ALTER TABLE factuur_regels
  ADD COLUMN IF NOT EXISTS oorspronkelijke_factuur_regel_id integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'facturen_oorspronkelijke_factuur_fk'
  ) THEN
    ALTER TABLE facturen
      ADD CONSTRAINT facturen_oorspronkelijke_factuur_fk
      FOREIGN KEY (oorspronkelijke_factuur_id)
      REFERENCES facturen(id)
      ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'factuur_regels_oorspronkelijke_regel_fk'
  ) THEN
    ALTER TABLE factuur_regels
      ADD CONSTRAINT factuur_regels_oorspronkelijke_regel_fk
      FOREIGN KEY (oorspronkelijke_factuur_regel_id)
      REFERENCES factuur_regels(id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS facturen_oorspronkelijke_factuur_idx
  ON facturen (oorspronkelijke_factuur_id)
  WHERE oorspronkelijke_factuur_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS factuur_regels_een_credit_per_bronregel_uq
  ON factuur_regels (oorspronkelijke_factuur_regel_id)
  WHERE oorspronkelijke_factuur_regel_id IS NOT NULL;