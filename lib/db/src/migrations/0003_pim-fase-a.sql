-- PIM Fase A — Foundation migrations
-- Uitgevoerd: 2026-07-04 via directe SQL (geen drizzle push)
-- Reden: additieve kolom + partial unique index zijn niet via drizzle push uit te voeren

-- 1. Additieve kolom op opdrachten (nullable, geen impact op bestaande rijen)
ALTER TABLE opdrachten ADD COLUMN IF NOT EXISTS ai_fase text;

-- 2. PIM modellen tabel (1:1 aan opdracht)
CREATE TABLE IF NOT EXISTS pim_modellen (
  id serial PRIMARY KEY,
  opdracht_id integer NOT NULL UNIQUE REFERENCES opdrachten(id) ON DELETE CASCADE,
  aanvraag_via_one boolean NOT NULL DEFAULT false,
  aanvraag_context jsonb,
  advies_context jsonb,
  werkvoorbereiding_context jsonb,
  inkoop_context jsonb,
  uitvoerings_log jsonb,
  oplevering_context jsonb,
  aangemaakt_op timestamp NOT NULL DEFAULT now(),
  bijgewerkt_op timestamp NOT NULL DEFAULT now()
);

-- 3. PIM uitvoering stappen tabel
CREATE TABLE IF NOT EXISTS pim_uitvoering_stappen (
  id serial PRIMARY KEY,
  pim_id integer NOT NULL REFERENCES pim_modellen(id) ON DELETE CASCADE,
  volgorde integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open',
  werkpakket_sleutel text,
  instructie_json jsonb,
  antwoorden_json jsonb,
  foto_urls text[],
  ai_analyse_json jsonb,
  afwijking_json jsonb,
  voltooid_door_id integer REFERENCES gebruikers(id) ON DELETE SET NULL,
  voltooid_op timestamp,
  aangemaakt_op timestamp NOT NULL DEFAULT now(),
  bijgewerkt_op timestamp NOT NULL DEFAULT now()
);

-- 4. Partial unique index: één actief/afgeweken stap per pim_id
-- (Drizzle ondersteunt geen WHERE-clausule in unique constraints)
CREATE UNIQUE INDEX IF NOT EXISTS pim_stap_actief_uniq
  ON pim_uitvoering_stappen(pim_id)
  WHERE status IN ('actief', 'afgeweken');

-- 5. document_koppelingen CHECK-constraint uitbreiden met 'opdracht'
ALTER TABLE document_koppelingen
  DROP CONSTRAINT IF EXISTS document_koppelingen_doel_type_check;
ALTER TABLE document_koppelingen
  ADD CONSTRAINT document_koppelingen_doel_type_check
  CHECK (doel_type IN ('gebouw','klant','offerte','dossier','voorziening','opdracht'));
