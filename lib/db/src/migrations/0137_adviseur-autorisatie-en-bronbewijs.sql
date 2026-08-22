-- ASSISTENT_OVERAL_01 — ingetrokken rechten maken oude gesprekshistorie
-- onmiddellijk onbereikbaar; een feitelijk antwoord bewaart het daadwerkelijk
-- gebruikte, begrensde bronbewijs in dezelfde audittransactie.

ALTER TABLE "adviseur_gesprekken"
  ADD COLUMN IF NOT EXISTS "autorisatie_hash" text;

-- Legacygesprekken mogen nooit toevallig aan een actuele snapshot koppelen.
UPDATE "adviseur_gesprekken"
SET "autorisatie_hash" = 'legacy:' || "id"::text
WHERE "autorisatie_hash" IS NULL;

ALTER TABLE "adviseur_gesprekken"
  ALTER COLUMN "autorisatie_hash" SET NOT NULL;

DROP INDEX IF EXISTS "adviseur_gesprekken_actor_gebruiker_rol_uniq";

CREATE UNIQUE INDEX IF NOT EXISTS "adviseur_gesprekken_actor_gebruiker_rol_auth_uniq"
  ON "adviseur_gesprekken" ("actor_id", "gebruiker_id", "effectieve_rol", "autorisatie_hash");

ALTER TABLE "adviseur_audit"
  ADD COLUMN IF NOT EXISTS "autorisatie_hash" text,
  ADD COLUMN IF NOT EXISTS "bronbewijs" jsonb;