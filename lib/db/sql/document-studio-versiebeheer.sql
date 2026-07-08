-- Document Studio versiebeheer: exact één ACTIEF (status='goedgekeurd') model per
-- (werkgever_id, document_type); nieuwe uploads worden altijd een nieuwe concept-rij,
-- oude actieve rij wordt bij goedkeuren gearchiveerd (nooit overschreven/verwijderd).
-- Idempotent: veilig herhaaldelijk uit te voeren. drizzle push faalt non-interactief op
-- additieve UNIQUE-indexen; daarom hier via expliciete, geguarde DDL (zie werkgevers.sql).

-- 1. Kolommen voor archivering en herkomst.
ALTER TABLE document_studio_modellen ADD COLUMN IF NOT EXISTS gearchiveerd_op timestamp;
ALTER TABLE document_studio_modellen ADD COLUMN IF NOT EXISTS aangemaakt_door integer;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_studio_modellen_aangemaakt_door_fkey') THEN
    ALTER TABLE document_studio_modellen ADD CONSTRAINT document_studio_modellen_aangemaakt_door_fkey
      FOREIGN KEY (aangemaakt_door) REFERENCES gebruikers(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 2. Precies één goedgekeurd (actief) model per (werkgever_id, document_type).
-- Partial unique index: alleen rijen met status='goedgekeurd' tellen mee, dus concept-
-- en gearchiveerde rijen kunnen vrij naast elkaar bestaan (volledige versiehistorie).
CREATE UNIQUE INDEX IF NOT EXISTS document_studio_modellen_actief_uniek
  ON document_studio_modellen (werkgever_id, document_type)
  WHERE status = 'goedgekeurd';

-- 3. Pin: offertes onthouden met welke modelversie ze verzonden zijn, zodat een latere
-- nieuwe goedkeuring van het model reeds verzonden offertes niet met terugwerkende
-- kracht verandert (zelfde patroon als offertes.voorwaarden_snapshot).
ALTER TABLE offertes ADD COLUMN IF NOT EXISTS studio_model_id integer;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'offertes_studio_model_id_fkey') THEN
    ALTER TABLE offertes ADD CONSTRAINT offertes_studio_model_id_fkey
      FOREIGN KEY (studio_model_id) REFERENCES document_studio_modellen(id) ON DELETE SET NULL;
  END IF;
END $$;
