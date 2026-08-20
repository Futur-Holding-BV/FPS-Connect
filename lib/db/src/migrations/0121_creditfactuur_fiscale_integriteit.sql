-- GELDSTROOM_01: een genummerde creditnota mag uitsluitend een herleidbare,
-- negatieve correctie met een volledige fiscale BV-snapshot zijn.
--
-- NOT VALID laat eventuele historische, al bestaande onvolledige creditnota's
-- ongemoeid, maar dwingt de invariant wel af voor iedere nieuwe insert/update.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'facturen_creditnota_fiscale_integriteit'
  ) THEN
    ALTER TABLE facturen
      ADD CONSTRAINT facturen_creditnota_fiscale_integriteit
      CHECK (
        subtype IS DISTINCT FROM 'creditnota'
        OR factuurnummer IS NULL
        OR (
          type = 'verkoop'
          AND oorspronkelijke_factuur_id IS NOT NULL
          AND werkgever_id IS NOT NULL
          AND werkgever_vastgelegd_op IS NOT NULL
          AND bedrag_excl_btw <= 0
          AND btw_bedrag <= 0
          AND bedrag_incl_btw <= 0
        )
      )
      NOT VALID;
  END IF;
END $$;