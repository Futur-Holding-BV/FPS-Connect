-- AANVRAAG_01 — databasepoort voor gelijktijdig dubbel uploaden.
--
-- De vroege applicatiecheck geeft snel 409 bij een gewone herhaling, maar twee
-- gelijktijdige verzoeken kunnen die check allebei passeren. Daarom blijft
-- mail_message_id ook in de database uniek. De DO-vorm is herstelbaar voor een
-- omgeving waarin de unieke index al bestaat maar nog niet als constraint is
-- gekoppeld.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'aanvraag_voorstellen_mail_uq'
      AND conrelid = 'aanvraag_voorstellen'::regclass
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_class
      WHERE relname = 'aanvraag_voorstellen_mail_uq'
        AND relkind = 'i'
    ) THEN
      CREATE UNIQUE INDEX aanvraag_voorstellen_mail_uq
        ON aanvraag_voorstellen(mail_message_id);
    END IF;

    ALTER TABLE aanvraag_voorstellen
      ADD CONSTRAINT aanvraag_voorstellen_mail_uq
      UNIQUE USING INDEX aanvraag_voorstellen_mail_uq;
  END IF;
END
$$;