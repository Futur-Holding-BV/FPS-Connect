-- REGISTER_01 hergrading: ieder oordeel krijgt een herleidbare bron en een
-- expliciete actualiteitsgrens. De vier bestaande standen blijven ongewijzigd.
ALTER TABLE acceptatie_register
  ADD COLUMN IF NOT EXISTS bron_soort TEXT,
  ADD COLUMN IF NOT EXISTS bron_datum TIMESTAMP,
  ADD COLUMN IF NOT EXISTS laatste_code_wijziging_op TIMESTAMP,
  ADD COLUMN IF NOT EXISTS beoordeeld_op TIMESTAMP;

-- Bestaande oordelen worden alleen technisch gemigreerd. De herbeoordelings-
-- motor vervangt dit bootstrap-oordeel door de werkelijke brondata. Tot die
-- tijd is de oorspronkelijke registervulling van 19 augustus de herleidbare
-- beoordelingsdatum; er wordt niet gedaan alsof een ouder document toen nieuw
-- is gemeten.
UPDATE acceptatie_register
SET
  bron_soort = CASE
    WHEN bewijs_vindplaats LIKE '%scripts/src/%' THEN 'bewijsscript'
    WHEN bewijs_vindplaats LIKE '%docs/metingen/%' THEN 'meetrapport'
    WHEN bewijs_vindplaats LIKE '%docs/antwoorden/%'
      OR bron_bestand IS NOT NULL THEN 'antwoorddocument'
    ELSE 'code'
  END,
  bron_datum = COALESCE(bron_datum, aangemaakt_op),
  laatste_code_wijziging_op = COALESCE(laatste_code_wijziging_op, aangemaakt_op),
  beoordeeld_op = COALESCE(beoordeeld_op, bijgewerkt_op)
WHERE bron_soort IS NULL
   OR bron_datum IS NULL
   OR laatste_code_wijziging_op IS NULL
   OR beoordeeld_op IS NULL;

ALTER TABLE acceptatie_register
  ALTER COLUMN bron_soort SET NOT NULL,
  ALTER COLUMN bron_datum SET NOT NULL,
  ALTER COLUMN laatste_code_wijziging_op SET NOT NULL,
  ALTER COLUMN beoordeeld_op SET NOT NULL,
  ALTER COLUMN beoordeeld_op SET DEFAULT now();

ALTER TABLE acceptatie_register
  DROP CONSTRAINT IF EXISTS acceptatie_register_bron_soort_check,
  ADD CONSTRAINT acceptatie_register_bron_soort_check
    CHECK (bron_soort IN ('bewijsscript', 'code', 'meetrapport', 'antwoorddocument')),
  DROP CONSTRAINT IF EXISTS acceptatie_register_gehaald_actueel_check,
  ADD CONSTRAINT acceptatie_register_gehaald_actueel_check CHECK (
    stand <> 'gehaald'
    OR (
      bewijs_vindplaats IS NOT NULL
      AND btrim(bewijs_vindplaats) <> ''
      AND bron_bestand IS NOT NULL
      AND btrim(bron_bestand) <> ''
      AND bron_datum >= laatste_code_wijziging_op
    )
  );

CREATE INDEX IF NOT EXISTS acceptatie_register_bron_datum_idx
  ON acceptatie_register (bron_datum);

-- Voor iedere wacht_op_rene-regel bestaat precies één open hoofdbeheerder-item.
-- Een trigger bewaakt ook mutaties buiten de API of scripts om.
CREATE OR REPLACE FUNCTION sync_acceptatieregister_werkbak()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  sleutel TEXT := 'acceptatieregister:' || NEW.opdracht_code || ':' || NEW.punt_nummer;
BEGIN
  IF NEW.stand = 'wacht_op_rene' THEN
    INSERT INTO werkbak_items (
      soort,
      bron,
      titel,
      omschrijving,
      alleen_hoofdbeheerder,
      gewicht,
      actie_pad,
      herkomst_type,
      herkomst_id,
      dedup_sleutel
    ) VALUES (
      'doen',
      'acceptatieregister',
      'Acceptatiebesluit nodig: ' || NEW.opdracht_code || ' punt ' || NEW.punt_nummer,
      NEW.omschrijving,
      true,
      80,
      '/beheer/acceptatieregister',
      'acceptatieregister',
      NEW.id,
      sleutel
    )
    ON CONFLICT (dedup_sleutel) WHERE status = 'open'
    DO UPDATE SET
      titel = EXCLUDED.titel,
      omschrijving = EXCLUDED.omschrijving,
      herkomst_id = EXCLUDED.herkomst_id,
      bijgewerkt_op = now();
  ELSE
    UPDATE werkbak_items
    SET status = 'afgehandeld',
        afgehandeld_op = now(),
        bijgewerkt_op = now()
    WHERE dedup_sleutel = sleutel
      AND status = 'open';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS acceptatieregister_werkbak_sync ON acceptatie_register;
CREATE TRIGGER acceptatieregister_werkbak_sync
AFTER INSERT OR UPDATE OF stand, omschrijving
ON acceptatie_register
FOR EACH ROW
EXECUTE FUNCTION sync_acceptatieregister_werkbak();

-- Eerste synchronisatie van reeds bestaande wachtpunten.
INSERT INTO werkbak_items (
  soort,
  bron,
  titel,
  omschrijving,
  alleen_hoofdbeheerder,
  gewicht,
  actie_pad,
  herkomst_type,
  herkomst_id,
  dedup_sleutel
)
SELECT
  'doen',
  'acceptatieregister',
  'Acceptatiebesluit nodig: ' || ar.opdracht_code || ' punt ' || ar.punt_nummer,
  ar.omschrijving,
  true,
  80,
  '/beheer/acceptatieregister',
  'acceptatieregister',
  ar.id,
  'acceptatieregister:' || ar.opdracht_code || ':' || ar.punt_nummer
FROM acceptatie_register ar
WHERE ar.stand = 'wacht_op_rene'
ON CONFLICT (dedup_sleutel) WHERE status = 'open'
DO UPDATE SET
  titel = EXCLUDED.titel,
  omschrijving = EXCLUDED.omschrijving,
  herkomst_id = EXCLUDED.herkomst_id,
  bijgewerkt_op = now();