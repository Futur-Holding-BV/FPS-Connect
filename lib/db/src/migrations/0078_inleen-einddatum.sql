-- Migratie 0076: inleen-einddatum voor uitzend-/inhuurkrachten
-- Voegt een optioneel datumveld toe aan medewerkers voor het registreren van de
-- termijn waarop een inleen- of inhuurperiode formeel afloopt. Alleen relevant
-- bij dienstverband "uitzend" of "inhuur".
ALTER TABLE medewerkers ADD COLUMN IF NOT EXISTS inleen_einddatum text;
