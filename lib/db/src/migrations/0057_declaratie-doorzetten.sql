-- Declaratie doorzetten: een beoordelaar kan een ingediende declaratie bij
-- twijfel doorzetten naar een andere beoordelaar (bv. de hoofdbeheerder).
ALTER TABLE declaraties ADD COLUMN IF NOT EXISTS doorgezet_naar INTEGER REFERENCES gebruikers(id) ON DELETE SET NULL;
ALTER TABLE declaraties ADD COLUMN IF NOT EXISTS doorgezet_door INTEGER REFERENCES gebruikers(id) ON DELETE SET NULL;
ALTER TABLE declaraties ADD COLUMN IF NOT EXISTS doorgezet_op TIMESTAMP;
ALTER TABLE declaraties ADD COLUMN IF NOT EXISTS doorzet_toelichting TEXT;
