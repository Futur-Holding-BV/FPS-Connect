-- ASSISTENT_OVERAL_01 — isoleer gesprekken ook op de echte actor.
-- Zonder actor in de sleutel zou een beheerder bij "bekijken als" het
-- persoonlijke gesprek van de effectieve gebruiker kunnen openen.

ALTER TABLE "adviseur_gesprekken"
  ADD COLUMN IF NOT EXISTS "actor_id" integer REFERENCES "gebruikers"("id") ON DELETE CASCADE;

UPDATE "adviseur_gesprekken"
SET "actor_id" = "gebruiker_id"
WHERE "actor_id" IS NULL;

ALTER TABLE "adviseur_gesprekken"
  ALTER COLUMN "actor_id" SET NOT NULL;

DROP INDEX IF EXISTS "adviseur_gesprekken_gebruiker_rol_uniq";

CREATE UNIQUE INDEX IF NOT EXISTS "adviseur_gesprekken_actor_gebruiker_rol_uniq"
  ON "adviseur_gesprekken" ("actor_id", "gebruiker_id", "effectieve_rol");