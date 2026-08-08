-- 0010: notities en koppelingen mailbox-scopen (review MAIL_01)
--
-- message_id is alleen uniek binnen (mailbox_adres, message_id). Notities en
-- koppelingen droegen alleen message_id; bij een Graph-id-botsing tussen twee
-- mailboxen zou gedeelde context tussen mailboxen lekken. Daarom krijgen beide
-- tabellen het mailbox-adres erbij (gebackfilld uit de mails-tabel).

BEGIN;

-- ── Notities ──────────────────────────────────────────────────────────────────
ALTER TABLE werk_inbox_notities ADD COLUMN IF NOT EXISTS mailbox_adres text;

UPDATE werk_inbox_notities n
SET mailbox_adres = m.mailbox_adres
FROM werk_inbox_mails m
WHERE n.mailbox_adres IS NULL AND m.message_id = n.message_id;

DO $$
DECLARE aantal integer;
BEGIN
  SELECT count(*) INTO aantal FROM werk_inbox_notities WHERE mailbox_adres IS NULL;
  RAISE NOTICE 'migratie 0010: % notities zonder herleidbare mailbox (blijven NULL, alleen leesbaar via hun bericht)', aantal;
END $$;

CREATE INDEX IF NOT EXISTS werk_inbox_notities_mailbox_idx
  ON werk_inbox_notities (mailbox_adres, message_id);

-- ── Koppelingen ───────────────────────────────────────────────────────────────
ALTER TABLE werk_inbox_koppelingen ADD COLUMN IF NOT EXISTS mailbox_adres text;

UPDATE werk_inbox_koppelingen k
SET mailbox_adres = m.mailbox_adres
FROM werk_inbox_mails m
WHERE k.mailbox_adres IS NULL AND m.message_id = k.message_id;

-- Uniciteit voortaan inclusief mailbox: zelfde entiteit mag aan hetzelfde
-- message_id in twee verschillende mailboxen gekoppeld zijn.
ALTER TABLE werk_inbox_koppelingen DROP CONSTRAINT IF EXISTS werk_inbox_koppelingen_msg_uq;
CREATE UNIQUE INDEX IF NOT EXISTS werk_inbox_koppelingen_msg_uq
  ON werk_inbox_koppelingen (coalesce(mailbox_adres, ''), message_id, entity_type, entity_id);

CREATE INDEX IF NOT EXISTS werk_inbox_koppelingen_mailbox_idx
  ON werk_inbox_koppelingen (mailbox_adres, message_id);

COMMIT;
