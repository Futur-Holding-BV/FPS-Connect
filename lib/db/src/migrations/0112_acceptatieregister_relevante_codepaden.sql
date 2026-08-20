-- Hergrading-hardening: de actualiteitsgrens moet uit concrete codepaden
-- herleidbaar en opnieuw berekenbaar zijn, niet alleen uit een handmatig
-- opgeslagen datum of een opdrachtcode in een commitboodschap.
ALTER TABLE acceptatie_register
  ADD COLUMN IF NOT EXISTS relevante_codepaden TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE acceptatie_register
SET relevante_codepaden = CASE
  WHEN bewijs_vindplaats IS NOT NULL AND btrim(bewijs_vindplaats) <> ''
    THEN regexp_split_to_array(btrim(bewijs_vindplaats), E'\\s*;\\s*')
  WHEN bron_bestand IS NOT NULL AND btrim(bron_bestand) <> ''
    THEN ARRAY[bron_bestand]
  ELSE ARRAY[]::TEXT[]
END
WHERE cardinality(relevante_codepaden) = 0;

ALTER TABLE acceptatie_register
  DROP CONSTRAINT IF EXISTS acceptatie_register_gehaald_actueel_check,
  ADD CONSTRAINT acceptatie_register_gehaald_actueel_check CHECK (
    stand <> 'gehaald'
    OR (
      bewijs_vindplaats IS NOT NULL
      AND btrim(bewijs_vindplaats) <> ''
      AND bron_bestand IS NOT NULL
      AND btrim(bron_bestand) <> ''
      AND cardinality(relevante_codepaden) > 0
      AND bron_datum >= laatste_code_wijziging_op
    )
  );