-- ADMINISTRATIE_02 §3: crediteuren-betaalbatch met SEPA (pain.001)-bestand.
-- De functie staat achter een uitdrukkelijke akkoord-schakelaar
-- (app_instellingen.betaalbatch_actief, standaard uit) totdat René akkoord geeft.

CREATE TABLE IF NOT EXISTS "betaalbatches" (
  "id" serial PRIMARY KEY,
  "werkgever_id" integer NOT NULL REFERENCES "werkgevers"("id") ON DELETE CASCADE,
  "status" text NOT NULL DEFAULT 'concept', -- concept | bestand_aangemaakt | bevestigd | geannuleerd
  "uitvoerdatum" text NOT NULL,
  "debiteur_iban" text NOT NULL,
  "debiteur_naam" text NOT NULL,
  "totaal_bedrag" numeric(12,2) NOT NULL DEFAULT 0,
  "aantal_betalingen" integer NOT NULL DEFAULT 0,
  "bestand_referentie" text,
  "bestand_aangemaakt_op" timestamp,
  "bevestigd_op" timestamp,
  "bevestigd_door" integer REFERENCES "gebruikers"("id") ON DELETE SET NULL,
  "aangemaakt_door" integer REFERENCES "gebruikers"("id") ON DELETE SET NULL,
  "aangemaakt_op" timestamp NOT NULL DEFAULT now(),
  "bijgewerkt_op" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "betaalbatch_regels" (
  "id" serial PRIMARY KEY,
  "batch_id" integer NOT NULL REFERENCES "betaalbatches"("id") ON DELETE CASCADE,
  "factuur_id" integer NOT NULL REFERENCES "facturen"("id") ON DELETE CASCADE,
  "crediteur_naam" text NOT NULL,
  "crediteur_iban" text NOT NULL,
  "bedrag" numeric(12,2) NOT NULL,
  "omschrijving" text NOT NULL,
  "aangemaakt_op" timestamp NOT NULL DEFAULT now()
);

-- Eén factuur mag maar in één niet-geannuleerde batch zitten.
CREATE UNIQUE INDEX IF NOT EXISTS "betaalbatch_regels_factuur_uniek"
  ON "betaalbatch_regels" ("factuur_id");

ALTER TABLE "app_instellingen"
  ADD COLUMN IF NOT EXISTS "betaalbatch_actief" boolean NOT NULL DEFAULT false;
