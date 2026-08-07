-- FACTUUR_01 — uitzendbureaukoppeling (additief, idempotent)
-- Voegt de verwijzing naar crm_klanten toe op gebruikers en medewerkers.
-- Het oude tekstveld bedrijf_uitzendbureau blijft bewust bestaan (naam-cache);
-- verwijdering volgt in een aparte, latere opdracht.

ALTER TABLE gebruikers  ADD COLUMN IF NOT EXISTS uitzendbureau_id integer;
ALTER TABLE medewerkers ADD COLUMN IF NOT EXISTS uitzendbureau_id integer;

-- FK-constraints (gebruikers krijgt de constraint hier omdat drizzle de
-- verwijzing daar niet kan declareren vanwege een importcyclus).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gebruikers_uitzendbureau_id_fk') THEN
    ALTER TABLE gebruikers ADD CONSTRAINT gebruikers_uitzendbureau_id_fk
      FOREIGN KEY (uitzendbureau_id) REFERENCES crm_klanten(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'medewerkers_uitzendbureau_id_crm_klanten_id_fk') THEN
    ALTER TABLE medewerkers ADD CONSTRAINT medewerkers_uitzendbureau_id_crm_klanten_id_fk
      FOREIGN KEY (uitzendbureau_id) REFERENCES crm_klanten(id) ON DELETE SET NULL;
  END IF;
END $$;
