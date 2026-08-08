-- 0009 — MAIL_01: de mailomgeving als samenwerkomgeving.
--
-- Kern: een mailbox wordt organisatiebezit in plaats van bezit van één
-- gebruiker. Toegang loopt via de koppeltabel werk_inbox_mailbox_toegang
-- (recht: lezen | behandelen | beheren). Berichten, notities en koppelingen
-- worden gedeelde toestand per mailbox in plaats van per gebruiker.
--
-- Migratiegarantie (opdracht §3): NIEMAND verliest toegang. Elke bestaande
-- (gebruiker, adres)-rij wordt één toegangsregel 'beheren' voor die gebruiker
-- op de samengevoegde mailbox; elke gekoppelde Microsoft-account krijgt zijn
-- persoonlijke mailbox als rij met toegang 'beheren'.
--
-- Modusveld (opdracht §4): de vlaggen is_factuurmailbox / is_aanvraagmailbox
-- BLIJVEN BESTAAN als verfijning binnen de modus 'verwerken' (gekozen optie,
-- gedocumenteerd hier en in docs/changelog.md). De modus zelf bepaalt het
-- AI-gedrag: verwerken | ondersteunen | registreren.

-- ── 1. Mailboxen: modus + eigenaarschap loskoppelen ─────────────────────────
ALTER TABLE werk_inbox_mailboxen ADD COLUMN IF NOT EXISTS modus text NOT NULL DEFAULT 'ondersteunen';
ALTER TABLE werk_inbox_mailboxen ALTER COLUMN gebruiker_id DROP NOT NULL;

-- Adressen normaliseren vóór samenvoegen
UPDATE werk_inbox_mailboxen SET email_adres = lower(email_adres);
UPDATE werk_inbox_mails SET mailbox_adres = lower(mailbox_adres);

-- ── 2. Toegangstabel ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS werk_inbox_mailbox_toegang (
  id            serial PRIMARY KEY,
  mailbox_id    integer NOT NULL REFERENCES werk_inbox_mailboxen(id) ON DELETE CASCADE,
  gebruiker_id  integer NOT NULL REFERENCES gebruikers(id) ON DELETE CASCADE,
  recht         text NOT NULL DEFAULT 'behandelen',
  aangemaakt_op timestamp NOT NULL DEFAULT now(),
  CONSTRAINT werk_inbox_toegang_uq UNIQUE (mailbox_id, gebruiker_id),
  CONSTRAINT werk_inbox_toegang_recht_chk CHECK (recht IN ('lezen', 'behandelen', 'beheren'))
);
CREATE INDEX IF NOT EXISTS werk_inbox_toegang_gebruiker_idx ON werk_inbox_mailbox_toegang (gebruiker_id);

-- ── 3. Migratie: dubbele adressen samenvoegen, eigenaren worden toegang ─────
DO $$
DECLARE
  mailboxen_voor integer;
  mailboxen_na integer;
  toegang_na integer;
BEGIN
  SELECT count(*) INTO mailboxen_voor FROM werk_inbox_mailboxen;

  -- 3a. Elke bestaande eigenaar krijgt een toegangsregel 'beheren' op de
  --     canonieke mailbox (laagste id per adres).
  INSERT INTO werk_inbox_mailbox_toegang (mailbox_id, gebruiker_id, recht)
  SELECT canon.id, m.gebruiker_id, 'beheren'
  FROM werk_inbox_mailboxen m
  JOIN LATERAL (
    SELECT min(id) AS id FROM werk_inbox_mailboxen m2 WHERE m2.email_adres = m.email_adres
  ) canon ON true
  WHERE m.gebruiker_id IS NOT NULL
  ON CONFLICT (mailbox_id, gebruiker_id) DO NOTHING;

  -- 3b. Vlaggen en actief-status samenvoegen op de canonieke rij.
  UPDATE werk_inbox_mailboxen canon SET
    is_factuurmailbox  = agg.factuur,
    is_aanvraagmailbox = agg.aanvraag,
    actief             = agg.actief,
    label              = COALESCE(canon.label, agg.label)
  FROM (
    SELECT email_adres,
           bool_or(is_factuurmailbox)  AS factuur,
           bool_or(is_aanvraagmailbox) AS aanvraag,
           bool_or(actief)             AS actief,
           max(label)                  AS label
    FROM werk_inbox_mailboxen GROUP BY email_adres
  ) agg
  WHERE canon.email_adres = agg.email_adres
    AND canon.id = (SELECT min(id) FROM werk_inbox_mailboxen m2 WHERE m2.email_adres = canon.email_adres);

  -- 3c. Duplicaten verwijderen (toegangsregels staan al op de canonieke rij).
  DELETE FROM werk_inbox_mailboxen m
  WHERE m.id <> (SELECT min(id) FROM werk_inbox_mailboxen m2 WHERE m2.email_adres = m.email_adres);

  -- 3d. Persoonlijke mailboxen van gekoppelde Microsoft-accounts als rij.
  INSERT INTO werk_inbox_mailboxen (gebruiker_id, email_adres, label, modus, actief)
  SELECT NULL, lower(t.microsoft_email), 'Persoonlijke mailbox', 'ondersteunen', true
  FROM werk_inbox_tokens t
  WHERE NOT EXISTS (SELECT 1 FROM werk_inbox_mailboxen m WHERE m.email_adres = lower(t.microsoft_email))
  GROUP BY lower(t.microsoft_email);

  INSERT INTO werk_inbox_mailbox_toegang (mailbox_id, gebruiker_id, recht)
  SELECT m.id, t.gebruiker_id, 'beheren'
  FROM werk_inbox_tokens t
  JOIN werk_inbox_mailboxen m ON m.email_adres = lower(t.microsoft_email)
  ON CONFLICT (mailbox_id, gebruiker_id) DO NOTHING;

  -- 3e. Modus initialiseren: functionele mailboxen (factuur/aanvraag) draaien
  --     in 'verwerken'; de rest blijft 'ondersteunen'.
  UPDATE werk_inbox_mailboxen SET modus = 'verwerken'
  WHERE (is_factuurmailbox OR is_aanvraagmailbox) AND modus = 'ondersteunen';

  SELECT count(*) INTO mailboxen_na FROM werk_inbox_mailboxen;
  SELECT count(*) INTO toegang_na FROM werk_inbox_mailbox_toegang;
  RAISE NOTICE 'MAIL_01 migratietelling: mailboxen % -> %, toegangsregels %', mailboxen_voor, mailboxen_na, toegang_na;
END $$;

-- Eigenaarschap is nu volledig vervangen door toegang.
ALTER TABLE werk_inbox_mailboxen DROP COLUMN IF EXISTS gebruiker_id;
ALTER TABLE werk_inbox_mailboxen ADD CONSTRAINT werk_inbox_mailboxen_adres_uq UNIQUE (email_adres);
ALTER TABLE werk_inbox_mailboxen ADD CONSTRAINT werk_inbox_mailboxen_modus_chk CHECK (modus IN ('verwerken', 'ondersteunen', 'registreren'));

-- ── 4. Mails: gedeelde toestand per mailbox ─────────────────────────────────
ALTER TABLE werk_inbox_mails ADD COLUMN IF NOT EXISTS toegewezen_aan integer REFERENCES gebruikers(id) ON DELETE SET NULL;
ALTER TABLE werk_inbox_mails ADD COLUMN IF NOT EXISTS samenwerk_status text NOT NULL DEFAULT 'open';
ALTER TABLE werk_inbox_mails ADD COLUMN IF NOT EXISTS beantwoord_op timestamp;
ALTER TABLE werk_inbox_mails ADD CONSTRAINT werk_inbox_mails_status_chk CHECK (samenwerk_status IN ('open', 'toegewezen', 'wacht_op_antwoord', 'afgehandeld'));

-- 4a. Dedupliceren per (mailbox_adres, message_id): status samenvoegen, dan
--     de nieuwste rij behouden.
UPDATE werk_inbox_mails m SET afgehandeld_op = agg.afgehandeld
FROM (
  SELECT mailbox_adres, message_id, max(afgehandeld_op) AS afgehandeld
  FROM werk_inbox_mails GROUP BY mailbox_adres, message_id
) agg
WHERE m.mailbox_adres = agg.mailbox_adres AND m.message_id = agg.message_id
  AND agg.afgehandeld IS NOT NULL AND m.afgehandeld_op IS NULL;

DELETE FROM werk_inbox_mails m
WHERE m.id <> (
  SELECT id FROM werk_inbox_mails m2
  WHERE m2.mailbox_adres = m.mailbox_adres AND m2.message_id = m.message_id
  ORDER BY m2.bijgewerkt_op DESC, m2.id DESC LIMIT 1
);

ALTER TABLE werk_inbox_mails DROP CONSTRAINT IF EXISTS werk_inbox_mails_gebruiker_message_uq;
ALTER TABLE werk_inbox_mails ADD CONSTRAINT werk_inbox_mails_mailbox_message_uq UNIQUE (mailbox_adres, message_id);
CREATE INDEX IF NOT EXISTS werk_inbox_mails_toegewezen_idx ON werk_inbox_mails (toegewezen_aan);
CREATE INDEX IF NOT EXISTS werk_inbox_mails_status_idx ON werk_inbox_mails (mailbox_adres, samenwerk_status);

-- 4b. Gezamenlijke status initialiseren uit bestaande velden.
UPDATE werk_inbox_mails SET samenwerk_status = 'afgehandeld' WHERE afgehandeld_op IS NOT NULL;

-- ── 5. Koppelingen: gedeeld per bericht ──────────────────────────────────────
DELETE FROM werk_inbox_koppelingen k
WHERE k.id <> (
  SELECT min(id) FROM werk_inbox_koppelingen k2
  WHERE k2.message_id = k.message_id AND k2.entity_type = k.entity_type AND k2.entity_id = k.entity_id
);
ALTER TABLE werk_inbox_koppelingen DROP CONSTRAINT IF EXISTS werk_inbox_koppelingen_uq;
ALTER TABLE werk_inbox_koppelingen ADD CONSTRAINT werk_inbox_koppelingen_msg_uq UNIQUE (message_id, entity_type, entity_id);
