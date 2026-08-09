-- UREN_01 §6b: uren boeken op uurcodes uit de werkbegroting + beheerbare indirecte werkzaamheden.

-- 1. Uurcode direct op de werkbegrotingsregel (gekopieerd uit de calculatieregel).
ALTER TABLE werkbegroting_regels ADD COLUMN IF NOT EXISTS normtijd_id integer REFERENCES mod_calc_normtijden(id) ON DELETE SET NULL;

-- Backfill: bestaande regels erven de uurcode van hun calculatieregel.
UPDATE werkbegroting_regels wr
SET normtijd_id = cr.normtijd_id
FROM mod_calc_regels cr
WHERE wr.calc_regel_id = cr.id AND wr.normtijd_id IS NULL AND cr.normtijd_id IS NOT NULL;

-- 2. Indirecte werkzaamheden: beheerd in een scherm, nooit hard verwijderen als gebruikt.
CREATE TABLE IF NOT EXISTS indirecte_werkzaamheden (
  id serial PRIMARY KEY,
  naam text NOT NULL,
  actief boolean NOT NULL DEFAULT true,
  volgorde integer NOT NULL DEFAULT 0,
  aangemaakt_op timestamp NOT NULL DEFAULT now(),
  bijgewerkt_op timestamp NOT NULL DEFAULT now()
);

-- Startlijst (René maakt af in het beheerscherm); idempotent.
INSERT INTO indirecte_werkzaamheden (naam, volgorde)
SELECT v.naam, v.volgorde FROM (VALUES
  ('Opruimen en werkruimte creëren', 1),
  ('Rondgang met de opdrachtgever', 2),
  ('Materiaal ophalen (tussentijds)', 3),
  ('Reistijd', 4),
  ('Wachttijd', 5),
  ('Mobiliseren en demobiliseren', 6),
  ('Werkoverleg en toolbox', 7),
  ('Veiligheid en afzetting', 8)
) AS v(naam, volgorde)
WHERE NOT EXISTS (SELECT 1 FROM indirecte_werkzaamheden);

-- 3. Uurcode-verwijzing op de urenregel (vervangt vrije tekst voor uren op een opdracht).
ALTER TABLE uren_registraties ADD COLUMN IF NOT EXISTS normtijd_id integer REFERENCES mod_calc_normtijden(id) ON DELETE SET NULL;
ALTER TABLE uren_registraties ADD COLUMN IF NOT EXISTS indirecte_werkzaamheid_id integer REFERENCES indirecte_werkzaamheden(id) ON DELETE SET NULL;
ALTER TABLE uren_registraties ADD COLUMN IF NOT EXISTS niet_in_begroting boolean NOT NULL DEFAULT false;
ALTER TABLE uren_registraties ADD COLUMN IF NOT EXISTS niet_in_begroting_omschrijving text;
