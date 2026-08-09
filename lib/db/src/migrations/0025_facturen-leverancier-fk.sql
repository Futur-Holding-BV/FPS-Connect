-- LEVERANCIER_01 — facturen.leverancier_id wijst voortaan hard naar het
-- leveranciersregister (FK, on delete set null).
--
-- Datamigratie (§3.2): historische leverancier_id-waarden waren crm_klanten-id's.
-- Per gevulde verwijzing zoeken we de crm-naam op en proberen we die op
-- genormaliseerde naam terug te vinden in `leveranciers`:
--   gevonden  → omzetten naar het leveranciers-id;
--   niet gevonden → leeg laten en vastleggen in het migratierapport.
-- Er wordt niets gegokt en er worden geen leveranciersrijen aangemaakt.
-- Meting op productie (2026-08-09): 0 leveranciers, 0 crm_klanten, 0 facturen —
-- het rapport blijft daar dus leeg, maar de migratie is defensief geschreven.

-- Migratierapport: blijvend tabelletje zodat de uitkomst controleerbaar is.
CREATE TABLE IF NOT EXISTS migratie_0025_leverancier_rapport (
  id SERIAL PRIMARY KEY,
  factuur_id INTEGER NOT NULL,
  oude_crm_id INTEGER,
  crm_naam TEXT,
  nieuwe_leverancier_id INTEGER,
  uitkomst TEXT NOT NULL, -- 'omgezet' | 'leeggelaten_geen_match' | 'leeggelaten_meerdere_matches' | 'leeggelaten_crm_onbekend'
  gemigreerd_op TIMESTAMP NOT NULL DEFAULT now()
);

DO $$
DECLARE
  f RECORD;
  crm_naam TEXT;
  genorm TEXT;
  lev_ids INTEGER[];
BEGIN
  FOR f IN SELECT id, leverancier_id FROM facturen WHERE leverancier_id IS NOT NULL LOOP
    SELECT k.naam INTO crm_naam FROM crm_klanten k WHERE k.id = f.leverancier_id;
    IF crm_naam IS NULL THEN
      INSERT INTO migratie_0025_leverancier_rapport (factuur_id, oude_crm_id, crm_naam, nieuwe_leverancier_id, uitkomst)
      VALUES (f.id, f.leverancier_id, NULL, NULL, 'leeggelaten_crm_onbekend');
      UPDATE facturen SET leverancier_id = NULL WHERE id = f.id;
      CONTINUE;
    END IF;
    genorm := lower(trim(regexp_replace(crm_naam, '\s*(b\.?\s?v\.?|v\.?o\.?f\.?|n\.?v\.?)\s*$', '', 'i')));
    SELECT array_agg(l.id) INTO lev_ids FROM leveranciers l
      WHERE lower(trim(regexp_replace(l.naam, '\s*(b\.?\s?v\.?|v\.?o\.?f\.?|n\.?v\.?)\s*$', '', 'i'))) = genorm;
    IF lev_ids IS NULL OR array_length(lev_ids, 1) = 0 THEN
      INSERT INTO migratie_0025_leverancier_rapport (factuur_id, oude_crm_id, crm_naam, nieuwe_leverancier_id, uitkomst)
      VALUES (f.id, f.leverancier_id, crm_naam, NULL, 'leeggelaten_geen_match');
      UPDATE facturen SET leverancier_id = NULL WHERE id = f.id;
    ELSIF array_length(lev_ids, 1) > 1 THEN
      INSERT INTO migratie_0025_leverancier_rapport (factuur_id, oude_crm_id, crm_naam, nieuwe_leverancier_id, uitkomst)
      VALUES (f.id, f.leverancier_id, crm_naam, NULL, 'leeggelaten_meerdere_matches');
      UPDATE facturen SET leverancier_id = NULL WHERE id = f.id;
    ELSE
      INSERT INTO migratie_0025_leverancier_rapport (factuur_id, oude_crm_id, crm_naam, nieuwe_leverancier_id, uitkomst)
      VALUES (f.id, f.leverancier_id, crm_naam, lev_ids[1], 'omgezet');
      UPDATE facturen SET leverancier_id = lev_ids[1] WHERE id = f.id;
    END IF;
  END LOOP;
END $$;

-- Nu alle waarden geldig zijn: de echte FK.
ALTER TABLE facturen
  DROP CONSTRAINT IF EXISTS facturen_leverancier_id_leveranciers_id_fk;
ALTER TABLE facturen
  ADD CONSTRAINT facturen_leverancier_id_leveranciers_id_fk
  FOREIGN KEY (leverancier_id) REFERENCES leveranciers(id) ON DELETE SET NULL;

-- §3.5 — optionele verwijzing: één partij die zowel klant als leverancier is
-- blijft twee rijen in twee registers; dit veld maakt de relatie zichtbaar.
ALTER TABLE leveranciers
  ADD COLUMN IF NOT EXISTS crm_relatie_id INTEGER REFERENCES crm_klanten(id) ON DELETE SET NULL;
