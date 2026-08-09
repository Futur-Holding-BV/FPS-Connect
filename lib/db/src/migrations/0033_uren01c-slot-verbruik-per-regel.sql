-- UREN_01 §4 (hardening): slotverbruik per urenregel vastleggen zodat
-- 1) een PATCH exact het eerder geboekte deel kent (geen herberekening) en
-- 2) een DELETE het verbruikte plafond kan teruggeven aan het slot.
ALTER TABLE uren_registraties ADD COLUMN IF NOT EXISTS overwerk_slot_id integer REFERENCES overwerk_sloten(id) ON DELETE SET NULL;
ALTER TABLE uren_registraties ADD COLUMN IF NOT EXISTS overwerk_slot_uren real NOT NULL DEFAULT 0;
