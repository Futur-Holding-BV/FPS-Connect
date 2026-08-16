-- 0055: Snapshot van de mutatie-set per SCAB-mail.
-- Bij genereren wordt vastgelegd wélke salarismutaties in de mail zaten;
-- bij verzenden worden uitsluitend de declaraties uit die snapshot als
-- "verwerkt" gemarkeerd (nooit later toegevoegde mutaties).
ALTER TABLE scab_mails
  ADD COLUMN IF NOT EXISTS mutatie_ids jsonb;
