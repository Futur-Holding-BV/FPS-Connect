-- Idempotentie-guard: voorkom dubbele handtekeningen bij gelijktijdige indiening.
-- Veilig herhaaldelijk uitvoeren (idempotent via pg_constraint-check).
--
-- Achtergrond: één portaaltoken = één ondertekeningsbevoegdheid. Door een
-- UNIQUE-constraint op (offerte_id, portaal_token) kan de database nooit twee
-- handtekening-records voor dezelfde portaallink bevatten, ongeacht raceconditie.
-- NULL != NULL in PostgreSQL, dus rijen zonder portaal_token raken de
-- constraint nooit.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_handtekeningen_offerte_token'
      AND conrelid = 'offerte_handtekeningen'::regclass
  ) THEN
    ALTER TABLE offerte_handtekeningen
      ADD CONSTRAINT uq_handtekeningen_offerte_token
      UNIQUE (offerte_id, portaal_token);
  END IF;
END $$;
