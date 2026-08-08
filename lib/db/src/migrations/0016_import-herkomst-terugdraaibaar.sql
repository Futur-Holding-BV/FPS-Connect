-- IMPORT_01: elke geïmporteerde rij draagt een importnummer (import_id) en
-- een bron-label, zodat imports zichtbaar en in hun geheel terug te draaien zijn.

-- Importnummer op alle importdoelen (nullable; alleen gevuld bij import)
ALTER TABLE leveranciers        ADD COLUMN IF NOT EXISTS import_id integer REFERENCES import_logs(id) ON DELETE SET NULL;
ALTER TABLE artikelen           ADD COLUMN IF NOT EXISTS import_id integer REFERENCES import_logs(id) ON DELETE SET NULL;
ALTER TABLE crm_klanten         ADD COLUMN IF NOT EXISTS import_id integer REFERENCES import_logs(id) ON DELETE SET NULL;
ALTER TABLE crm_contactpersonen ADD COLUMN IF NOT EXISTS import_id integer REFERENCES import_logs(id) ON DELETE SET NULL;
ALTER TABLE medewerkers         ADD COLUMN IF NOT EXISTS import_id integer REFERENCES import_logs(id) ON DELETE SET NULL;
ALTER TABLE gebouwen            ADD COLUMN IF NOT EXISTS import_id integer REFERENCES import_logs(id) ON DELETE SET NULL;
ALTER TABLE eenheidsprijzen     ADD COLUMN IF NOT EXISTS import_id integer REFERENCES import_logs(id) ON DELETE SET NULL;
ALTER TABLE facturen            ADD COLUMN IF NOT EXISTS import_id integer REFERENCES import_logs(id) ON DELETE SET NULL;

-- Bron-label waar het nog ontbrak (leveranciers/artikelen/facturen hebben het al)
ALTER TABLE crm_klanten         ADD COLUMN IF NOT EXISTS bron text NOT NULL DEFAULT 'handmatig';
ALTER TABLE crm_contactpersonen ADD COLUMN IF NOT EXISTS bron text NOT NULL DEFAULT 'handmatig';
ALTER TABLE medewerkers         ADD COLUMN IF NOT EXISTS bron text NOT NULL DEFAULT 'handmatig';
ALTER TABLE gebouwen            ADD COLUMN IF NOT EXISTS bron text NOT NULL DEFAULT 'handmatig';
ALTER TABLE eenheidsprijzen     ADD COLUMN IF NOT EXISTS bron text NOT NULL DEFAULT 'handmatig';

-- Indexen voor terugdraaien (alleen geïmporteerde rijen)
CREATE INDEX IF NOT EXISTS leveranciers_import_id_idx        ON leveranciers (import_id)        WHERE import_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS artikelen_import_id_idx           ON artikelen (import_id)           WHERE import_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS crm_klanten_import_id_idx         ON crm_klanten (import_id)         WHERE import_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS crm_contactpersonen_import_id_idx ON crm_contactpersonen (import_id) WHERE import_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS medewerkers_import_id_idx         ON medewerkers (import_id)         WHERE import_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS gebouwen_import_id_idx            ON gebouwen (import_id)            WHERE import_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS eenheidsprijzen_import_id_idx     ON eenheidsprijzen (import_id)     WHERE import_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS facturen_import_id_idx            ON facturen (import_id)            WHERE import_id IS NOT NULL;

-- Importlog uitbreiden: bestand bewaren, dubbel-keuze en terugdraai-administratie
ALTER TABLE import_logs ADD COLUMN IF NOT EXISTS bestand_pad text;
ALTER TABLE import_logs ADD COLUMN IF NOT EXISTS rijen_dubbel integer NOT NULL DEFAULT 0;
ALTER TABLE import_logs ADD COLUMN IF NOT EXISTS keuze_dubbelen text;
ALTER TABLE import_logs ADD COLUMN IF NOT EXISTS teruggedraaid_op timestamp;
ALTER TABLE import_logs ADD COLUMN IF NOT EXISTS teruggedraaid_door integer;
ALTER TABLE import_logs ADD COLUMN IF NOT EXISTS terugdraai_detail jsonb;
