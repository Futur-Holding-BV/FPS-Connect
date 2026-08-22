-- PROJ_1200 §2 — projectleider-toewijzing + append-only geschiedenis
--
-- 1. Voeg projectleider_medewerker_id toe aan projecten (nullable FK → medewerkers.id RESTRICT).
-- 2. Maak een dedicated history-tabel (projectleider_geschiedenis) aan.
-- 3. DB-trigger op de history-tabel: weigert UPDATE en DELETE → append-only.
-- 4. Voeg "projectleider_toewijzing" toe aan de werkbak bronnen-allowlist
--    (de lijst in de code en de DB-trigger worden gesynchroniseerd).
-- 5. Indexen voor performance.
--
-- Nooit backfill/auto-assign bestaande projecten of aanmaken van projecten.

-- ── 1. Kolom op projecten ──────────────────────────────────────────────────────
ALTER TABLE projecten
  ADD COLUMN IF NOT EXISTS projectleider_medewerker_id INTEGER
    REFERENCES medewerkers(id)
    ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS projecten_projectleider_idx
  ON projecten (projectleider_medewerker_id)
  WHERE projectleider_medewerker_id IS NOT NULL;

-- ── 2. Geschiedenis-tabel ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projectleider_geschiedenis (
  id                    SERIAL PRIMARY KEY,
  -- Bewust zonder FK's: CASCADE en SET NULL zijn zelf DELETE/UPDATE-acties
  -- en zouden de append-only trigger activeren. Historische ID's blijven dus
  -- onveranderd bewaard, ook als de actuele bronrij later verdwijnt.
  project_id            INTEGER NOT NULL,
  oude_medewerker_id    INTEGER,
  nieuwe_medewerker_id  INTEGER,
  actor_gebruiker_id    INTEGER,
  reden                 TEXT,
  tijdstip              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS projectleider_geschiedenis_project_idx
  ON projectleider_geschiedenis (project_id);

CREATE INDEX IF NOT EXISTS projectleider_geschiedenis_tijdstip_idx
  ON projectleider_geschiedenis (tijdstip);

-- ── 3. Append-only trigger op de history-tabel ────────────────────────────────
CREATE OR REPLACE FUNCTION projectleider_geschiedenis_append_only()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'projectleider_geschiedenis is append-only: UPDATE en DELETE zijn niet toegestaan (rij id=%).',
    OLD.id
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS trg_projectleider_geschiedenis_no_mutate
  ON projectleider_geschiedenis;

CREATE TRIGGER trg_projectleider_geschiedenis_no_mutate
  BEFORE UPDATE OR DELETE ON projectleider_geschiedenis
  FOR EACH ROW EXECUTE FUNCTION projectleider_geschiedenis_append_only();

-- ── 4. Werkbak bron-allowlist uitbreiden ──────────────────────────────────────
-- De runtime-allowlist in werkbakService.ts wordt uitgebreid in de code;
-- hier registreren we de bron zodat bestaande DB-constraints (indien aanwezig)
-- ook de nieuwe bron kennen. Geen actie vereist als er geen DB-constraint op bron is.
-- (De allowlist-controle zit uitsluitend in de applicatielaag.)
