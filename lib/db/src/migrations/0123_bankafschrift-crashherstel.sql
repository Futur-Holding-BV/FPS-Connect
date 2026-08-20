-- BANK_01 — crashherstel voor mailboxclaims en AccountView-bankexport.
-- Additief en achterwaarts compatibel.

ALTER TABLE "bank_mailbijlage_claims"
  ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'bezig',
  ADD COLUMN IF NOT EXISTS "claim_token" text,
  ADD COLUMN IF NOT EXISTS "lease_tot" timestamp,
  ADD COLUMN IF NOT EXISTS "fout" text,
  ADD COLUMN IF NOT EXISTS "bijgewerkt_op" timestamp NOT NULL DEFAULT now();

-- Bestaande claims hadden twee bewezen betekenissen:
-- met import_id = verwerkt, zonder import_id = permanente fout.
UPDATE "bank_mailbijlage_claims"
SET
  "status" = CASE WHEN "import_id" IS NOT NULL THEN 'verwerkt' ELSE 'mislukt' END,
  "bijgewerkt_op" = now()
WHERE "claim_token" IS NULL
  AND "lease_tot" IS NULL;

ALTER TABLE "bank_mailbijlage_claims"
  DROP CONSTRAINT IF EXISTS "bank_mailbijlage_claims_status_check";
ALTER TABLE "bank_mailbijlage_claims"
  ADD CONSTRAINT "bank_mailbijlage_claims_status_check"
  CHECK ("status" IN ('bezig', 'verwerkt', 'mislukt'));

CREATE INDEX IF NOT EXISTS "bank_mailbijlage_claims_lease_idx"
  ON "bank_mailbijlage_claims" ("status", "lease_tot")
  WHERE "status" = 'bezig';

ALTER TABLE "bank_mutaties"
  ADD COLUMN IF NOT EXISTS "accountview_claim_token" text,
  ADD COLUMN IF NOT EXISTS "accountview_claim_op" timestamp;

CREATE INDEX IF NOT EXISTS "bank_mutaties_accountview_claim_idx"
  ON "bank_mutaties" ("accountview_status", "accountview_claim_op")
  WHERE "accountview_status" = 'bezig';