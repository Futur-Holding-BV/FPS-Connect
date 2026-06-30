-- AI-upload uitbreiding voor bedrijfsdocumenten (additief, idempotent).
-- Drizzle "db push" faalt onder non-TTY; pas toe via:
--   psql "$DATABASE_URL" -f lib/db/sql/bedrijfsdocumenten-ai-upload.sql
-- Moet overeenkomen met lib/db/src/schema/organisatie.ts.

-- ── org_bedrijfsdocumenten: bestand_hash voor dubbelingsdetectie ──
ALTER TABLE org_bedrijfsdocumenten ADD COLUMN IF NOT EXISTS bestand_hash text;

-- ── org_bedrijfsdocumenten: bestand_pad voor opslag in object storage ──
ALTER TABLE org_bedrijfsdocumenten ADD COLUMN IF NOT EXISTS bestand_pad text;

-- ── ai_categorie_correcties: leermechanisme voor de analyseer-route ──
CREATE TABLE IF NOT EXISTS ai_categorie_correcties (
  id           serial      PRIMARY KEY,
  hash         text,
  tekst_fragment text,
  ai_voorstel  text        NOT NULL,
  gekozen      text        NOT NULL,
  aangemaakt_op timestamptz NOT NULL DEFAULT now()
);
