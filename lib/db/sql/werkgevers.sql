-- Werkgever als hoofdentiteit (HRM doorontwikkeling — FPS Groep organisatiestructuur).
-- Idempotent: veilig herhaaldelijk uit te voeren. drizzle push faalt non-interactief op
-- additieve kolommen/constraints; daarom hier via expliciete, geguarde DDL.

-- 1. Hoofdtabel werkgevers.
CREATE TABLE IF NOT EXISTS werkgevers (
  id serial PRIMARY KEY,
  naam text NOT NULL UNIQUE,
  cao text NOT NULL DEFAULT 'Metaal & Techniek',
  logo_document_id integer REFERENCES documenten(id) ON DELETE SET NULL,
  briefpapier_document_id integer REFERENCES documenten(id) ON DELETE SET NULL,
  personeelsbeleid text,
  actief boolean NOT NULL DEFAULT true,
  aangemaakt_op timestamp NOT NULL DEFAULT now(),
  bijgewerkt_op timestamp NOT NULL DEFAULT now()
);

-- 2. Nullable werkgever_id FK op de child-tabellen (tekstveld werkmaatschappij blijft als legacy cache).
ALTER TABLE medewerkers ADD COLUMN IF NOT EXISTS werkgever_id integer;
ALTER TABLE functies ADD COLUMN IF NOT EXISTS werkgever_id integer;
ALTER TABLE verlofsoorten ADD COLUMN IF NOT EXISTS werkgever_id integer;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'medewerkers_werkgever_id_fkey') THEN
    ALTER TABLE medewerkers ADD CONSTRAINT medewerkers_werkgever_id_fkey
      FOREIGN KEY (werkgever_id) REFERENCES werkgevers(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'functies_werkgever_id_fkey') THEN
    ALTER TABLE functies ADD CONSTRAINT functies_werkgever_id_fkey
      FOREIGN KEY (werkgever_id) REFERENCES werkgevers(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'verlofsoorten_werkgever_id_fkey') THEN
    ALTER TABLE verlofsoorten ADD CONSTRAINT verlofsoorten_werkgever_id_fkey
      FOREIGN KEY (werkgever_id) REFERENCES werkgevers(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3. Seed de vier FPS-werkgevers met hun standaard-CAO.
INSERT INTO werkgevers (naam, cao) VALUES
  ('FPS Brandpreventie', 'Metaal & Techniek'),
  ('FPS Bouw', 'Metaal & Techniek'),
  ('FPS Bouw & Renovatie', 'Bouw & Infra'),
  ('FPS Onderhoud', 'Metaal & Techniek')
ON CONFLICT (naam) DO NOTHING;

-- 4. Backfill werkgever_id op basis van het bestaande werkmaatschappij-tekstveld.
UPDATE medewerkers m SET werkgever_id = w.id
  FROM werkgevers w WHERE m.werkgever_id IS NULL AND m.werkmaatschappij = w.naam;
UPDATE functies f SET werkgever_id = w.id
  FROM werkgevers w WHERE f.werkgever_id IS NULL AND f.werkmaatschappij = w.naam;
UPDATE verlofsoorten v SET werkgever_id = w.id
  FROM werkgevers w WHERE v.werkgever_id IS NULL AND v.werkmaatschappij = w.naam;
