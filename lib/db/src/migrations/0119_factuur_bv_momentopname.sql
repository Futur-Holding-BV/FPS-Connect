-- Fiscale momentopname van de uitgevende BV. De werk-koppelingen blijven
-- bruikbaar voor concepten, maar mogen na nummeruitgifte de administratie niet
-- meer stil wijzigen.
ALTER TABLE facturen
  ADD COLUMN IF NOT EXISTS werkgever_id integer;

-- Best-effort backfill voor bestaande definitieve dossiers. Vanaf deze migratie
-- schrijft /definitief de waarde atomair weg; legacy-dossiers zonder enige
-- herleidbare werkmaatschappij blijven bewust NULL en falen gesloten.
UPDATE facturen f
SET werkgever_id = COALESCE(
  (SELECT o.werkmaatschappij_id FROM offertes o WHERE o.id = f.offerte_id),
  (SELECT op.werkmaatschappij_id FROM opdrachten op WHERE op.id = f.opdracht_id),
  (SELECT g.werkgever_id FROM gebouwen g WHERE g.id = f.gebouw_id)
)
WHERE f.werkgever_id IS NULL
  AND f.factuurnummer IS NOT NULL
  AND COALESCE(
    (SELECT o.werkmaatschappij_id FROM offertes o WHERE o.id = f.offerte_id),
    (SELECT op.werkmaatschappij_id FROM opdrachten op WHERE op.id = f.opdracht_id),
    (SELECT g.werkgever_id FROM gebouwen g WHERE g.id = f.gebouw_id)
  ) IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'facturen_werkgever_fk'
  ) THEN
    ALTER TABLE facturen
      ADD CONSTRAINT facturen_werkgever_fk
      FOREIGN KEY (werkgever_id)
      REFERENCES werkgevers(id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS facturen_werkgever_idx
  ON facturen (werkgever_id)
  WHERE werkgever_id IS NOT NULL;