-- VGE (Visual Guidance Engine) — guidance_context + visuele bibliotheek
-- Uitgevoerd: 2026-07-05 via directe SQL (geen drizzle push)
-- Reden: additieve kolom + nieuwe tabellen zijn veilig additief
--
-- Tabel-definities zijn exact afgeleid van lib/db/src/schema/vge.ts (Drizzle bron van waarheid).
-- bron_type waarden matchen GELDIGE_BRON_TYPES in artifacts/api-server/src/lib/vgeService.ts.

-- 1. Guidance-context kolom op uitvoeringsstappen (nullable JSONB)
ALTER TABLE pim_uitvoering_stappen ADD COLUMN IF NOT EXISTS guidance_context jsonb;

-- 2. Centrale visuele bibliotheek
-- actief=false (default) — beheerder moet expliciet activeren voor VGE.
CREATE TABLE IF NOT EXISTS fps_visuals (
  id serial PRIMARY KEY,
  naam text NOT NULL,
  visual_type text NOT NULL,
  bron_type text NOT NULL CHECK (bron_type IN (
    'projecttekening', 'ETA', 'DoP', 'montagevoorschrift',
    'fps_standaard', 'praktijkfoto', 'productblad'
  )),
  bron_referentie text,
  object_path text NOT NULL,
  thumbnail_path text,
  spot_type text[] NOT NULL DEFAULT '{}',
  artikel_id integer REFERENCES artikelen(id) ON DELETE SET NULL,
  bedrijfsstandaard_id integer REFERENCES fps_bedrijfsstandaarden(id) ON DELETE SET NULL,
  taal text NOT NULL DEFAULT 'nl',
  actief boolean NOT NULL DEFAULT false,
  aangemaakt_op timestamp NOT NULL DEFAULT now(),
  bijgewerkt_op timestamp
);

CREATE INDEX IF NOT EXISTS idx_fps_visuals_visual_type
  ON fps_visuals (visual_type);

CREATE INDEX IF NOT EXISTS idx_fps_visuals_actief
  ON fps_visuals (actief);

-- GIN-index voor snelle spot_type array-overlap zoekopdrachten
CREATE INDEX IF NOT EXISTS idx_fps_visuals_spot_type
  ON fps_visuals USING GIN (spot_type);

-- 3. AI-annotaties als aparte laag (nooit commingled met bronbestanden)
-- Drizzle schema: lib/db/src/schema/vge.ts fpsVisualAnnotatiesTable
CREATE TABLE IF NOT EXISTS fps_visual_annotaties (
  id serial PRIMARY KEY,
  originele_foto_path text NOT NULL,
  annotatie_path text NOT NULL,
  context text NOT NULL,
  afwijking_status text NOT NULL,
  bevindingen text[],
  pim_stap_id integer REFERENCES pim_uitvoering_stappen(id) ON DELETE SET NULL,
  gegenereerd_door_model text,
  gegenereerd_op timestamp NOT NULL DEFAULT now(),
  CONSTRAINT annotaties_paden_verschillend CHECK (originele_foto_path <> annotatie_path)
);

-- 4. Effectiviteitslog (leerlaag — schrijft NOOIT naar spec-tabellen)
-- pim_stap_id NOT NULL + CASCADE zodat log-rijen mee-cascaden als stap verwijderd wordt.
-- Drizzle schema: lib/db/src/schema/vge.ts vgeEffectiviteitslogTable
CREATE TABLE IF NOT EXISTS vge_effectiviteitslog (
  id serial PRIMARY KEY,
  visual_id integer NOT NULL REFERENCES fps_visuals(id) ON DELETE CASCADE,
  pim_stap_id integer NOT NULL REFERENCES pim_uitvoering_stappen(id) ON DELETE CASCADE,
  stap_type text NOT NULL,
  spot_type text NOT NULL,
  herstelwerk_nodig boolean NOT NULL,
  stap_duur_seconden integer,
  monteur_vraag_gesteld boolean NOT NULL DEFAULT false,
  kwaliteit_resultaat text,
  aangemaakt_op timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vge_log_visual_spot_stap
  ON vge_effectiviteitslog (visual_id, spot_type, stap_type);
