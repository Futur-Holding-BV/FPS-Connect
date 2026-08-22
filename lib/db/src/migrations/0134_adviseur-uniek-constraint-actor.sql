-- ADVISEUR_PERSIST_02 (task-1202 review) — versterk gespreksisolatie en audit.
--
-- 1. UNIQUE constraint op adviseur_gesprekken(gebruiker_id, effectieve_rol):
--    garandeert dat er slechts één gesprek per effectieve gebruiker+rol bestaat.
--    De applicatiecode gebruikt INSERT … ON CONFLICT DO NOTHING + re-select om
--    races te vermijden zonder een LOCK.
--
-- 2. actor_id in adviseur_audit: slaat de echte ingelogde gebruiker (actor) op
--    naast de effectieve gebruiker. Bij normale sessies zijn ze gelijk; bij
--    "bekijken als" (impersonatie) is actor_id de beheerder en gebruiker_id
--    het teamlid. Geen PII gekopieerd — alleen een referentie naar gebruikers.id.
--
-- Additief en idempotent (IF NOT EXISTS, ADD COLUMN IF NOT EXISTS).

-- ── Unieke index op gespreksisolatie (vervangt de gewone index) ──────────────
-- Maak de bestaande niet-unieke index veilig weg vóór we de unieke aanmaken.
DROP INDEX IF EXISTS "adviseur_gesprekken_gebruiker_rol_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "adviseur_gesprekken_gebruiker_rol_uniq"
  ON "adviseur_gesprekken" ("gebruiker_id", "effectieve_rol");

-- ── actor_id in adviseur_audit ───────────────────────────────────────────────
ALTER TABLE "adviseur_audit"
  ADD COLUMN IF NOT EXISTS "actor_id" integer REFERENCES "gebruikers"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "adviseur_audit_actor_idx"
  ON "adviseur_audit" ("actor_id", "aangemaakt_op");