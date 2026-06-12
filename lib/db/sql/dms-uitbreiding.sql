-- DMS-uitbreiding (additief, idempotent).
-- Drizzle "db push" faalt onder non-TTY (interactieve truncate-prompt); pas daarom
-- additief toe via: psql "$DATABASE_URL" -f lib/db/sql/dms-uitbreiding.sql
-- Moet één-op-één overeenkomen met lib/db/src/schema/{documenten,dossiers}.ts.

-- ── documenten: nieuwe kolommen ──
ALTER TABLE documenten ADD COLUMN IF NOT EXISTS bestands_hash text;
ALTER TABLE documenten ADD COLUMN IF NOT EXISTS bestandsgrootte integer;
ALTER TABLE documenten ADD COLUMN IF NOT EXISTS geldig_tot date;
ALTER TABLE documenten ADD COLUMN IF NOT EXISTS goedkeuring_status text NOT NULL DEFAULT 'goedgekeurd';

-- ── document_koppelingen (polymorf) ──
CREATE TABLE IF NOT EXISTS document_koppelingen (
  id serial PRIMARY KEY,
  document_id integer NOT NULL REFERENCES documenten(id) ON DELETE CASCADE,
  doel_type text NOT NULL,
  doel_id integer NOT NULL,
  aangemaakt_door_id integer REFERENCES gebruikers(id) ON DELETE SET NULL,
  aangemaakt_op timestamp NOT NULL DEFAULT now(),
  CONSTRAINT document_koppelingen_uniek UNIQUE (document_id, doel_type, doel_id),
  CONSTRAINT document_koppelingen_doel_type_check
    CHECK (doel_type IN ('gebouw','klant','offerte','dossier','voorziening'))
);
CREATE INDEX IF NOT EXISTS document_koppelingen_doel_idx ON document_koppelingen (doel_type, doel_id);

-- ── document_goedkeuringen (goedkeuringsflow-log) ──
CREATE TABLE IF NOT EXISTS document_goedkeuringen (
  id serial PRIMARY KEY,
  document_id integer NOT NULL REFERENCES documenten(id) ON DELETE CASCADE,
  actie text NOT NULL,
  door_id integer REFERENCES gebruikers(id) ON DELETE SET NULL,
  opmerking text,
  tijdstip timestamp NOT NULL DEFAULT now()
);

-- ── document_logboek (toegang/audittrail) ──
CREATE TABLE IF NOT EXISTS document_logboek (
  id serial PRIMARY KEY,
  document_id integer REFERENCES documenten(id) ON DELETE SET NULL,
  document_naam text,
  gebruiker_id integer REFERENCES gebruikers(id) ON DELETE SET NULL,
  gebruiker_naam text,
  actie text NOT NULL,
  detail text,
  tijdstip timestamp NOT NULL DEFAULT now()
);

-- ── dossier_documenten: bevriezing ──
ALTER TABLE dossier_documenten ADD COLUMN IF NOT EXISTS bevroren_revisie_nummer integer;
ALTER TABLE dossier_documenten ADD COLUMN IF NOT EXISTS bevroren_pdf_url text;
ALTER TABLE dossier_documenten ADD COLUMN IF NOT EXISTS bevroren_op timestamp;
