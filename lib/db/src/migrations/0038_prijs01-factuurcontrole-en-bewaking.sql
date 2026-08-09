-- PRIJS_01 §6 + §7 — factuurcontrole tegen prijsafspraken en bewaking van
-- aflopende afspraken. Additieve migratie (genummerd, drift-gecheckt zoals 0037;
-- GEEN drizzle push).
--
-- §6: een kleine cache van het toetsresultaat per factuur, zodat het
-- factuurdetail en het maandtotaal de laatste uitkomst kunnen tonen zonder
-- opnieuw te toetsen. De factuurregel zelf wordt NOOIT gewijzigd (§9); dit is
-- puur een cache naast de factuur.
ALTER TABLE facturen
  ADD COLUMN IF NOT EXISTS prijscontrole jsonb;

-- §7: instelbare termijn (in dagen) waarbinnen een aflopende prijsafspraak een
-- werkbak-item oplevert. Default 60 dagen.
ALTER TABLE app_instellingen
  ADD COLUMN IF NOT EXISTS prijsafspraak_bewaking_dagen integer NOT NULL DEFAULT 60;
