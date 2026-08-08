-- LOON_01 — Loonstroom sluiten (additief, geen destructieve wijzigingen)
--
-- 1. sepa_bestanden: herkomst uit de mailintake vastleggen (bron + bronmail)
--    en een expliciete onvolledig-markering wanneer werkgever of periode niet
--    met zekerheid bepaald kon worden (nooit gokken).
-- 2. verlofaanvragen: verwerkingsmarkering voor de boekhouder, zodat een
--    goedgekeurde verlofpost niet dubbel op de loonstrook belandt.
-- 3. werk_inbox_mails: claimkolom voor de SEPA-loonintake (zelfde patroon als
--    factuur_verwerkt_op / aanvraag_verwerkt_op).

ALTER TABLE sepa_bestanden ADD COLUMN IF NOT EXISTS bron text NOT NULL DEFAULT 'upload';
ALTER TABLE sepa_bestanden ADD COLUMN IF NOT EXISTS bron_mail_message_id text;
ALTER TABLE sepa_bestanden ADD COLUMN IF NOT EXISTS bron_mailbox_adres text;
ALTER TABLE sepa_bestanden ADD COLUMN IF NOT EXISTS onvolledig boolean NOT NULL DEFAULT false;

ALTER TABLE verlofaanvragen ADD COLUMN IF NOT EXISTS boekhouder_verwerkt_op timestamp;
ALTER TABLE verlofaanvragen ADD COLUMN IF NOT EXISTS boekhouder_verwerkt_door_id integer REFERENCES gebruikers(id) ON DELETE SET NULL;

ALTER TABLE werk_inbox_mails ADD COLUMN IF NOT EXISTS sepa_verwerkt_op timestamp;
