-- SCENARIO_01 — wat-als-scenario's op de jaarbegroting.
-- Een scenario is een kopie van een begroting met status 'scenario' (nieuwe
-- statuswaarde op de bestaande text-kolom, geen enum). Additieve kolommen:
--   scenario_van_id   verwijzing naar de basisbegroting (kopie-bron)
--   scenario_naam     korte naam ("4 monteurs zonder kantoorfuncties")
--   scenario_aannames JSON met expliciete aannames (monteurs, bezetting, tarief, ...)
ALTER TABLE fie_jaarbegrotingen
  ADD COLUMN IF NOT EXISTS scenario_van_id integer REFERENCES fie_jaarbegrotingen(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scenario_naam text,
  ADD COLUMN IF NOT EXISTS scenario_aannames text;

CREATE INDEX IF NOT EXISTS fie_jaarbegrotingen_status_idx ON fie_jaarbegrotingen (status);
