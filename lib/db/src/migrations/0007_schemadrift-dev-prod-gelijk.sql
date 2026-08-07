-- 0007 — Los de bekende schemaverschillen tussen ontwikkel- en productieomgeving op.
--
-- Onderzoek (7 aug 2026, live vergelijking dev én prod tegen schema-verwachting.txt):
-- de 13 eerder gerapporteerde timestamp-with/without-time-zone-verschillen bestaan
-- niet meer — productie komt daarvoor al overeen met de verwachting. Wat resteert:
--
-- 1. fie_leermomenten.correctie_factor heeft op dev default "1.0" en op prod "1"
--    (zelfde numerieke waarde, andere defaultexpressie → drift-check-ruis).
--    We normaliseren beide naar 1.0, conform de Drizzle-schemadefinitie
--    (real("correctie_factor").notNull().default(1.0)). Bestaande data raakt
--    dit niet: alleen de default-expressie wijzigt.
--
-- 2. De unieke index facturen_mailstroom_bijlage_uniek bestaat live op dev én
--    prod maar zit niet in de migratieketen/verwachting. We leggen hem hier
--    idempotent vast zodat de keten weer de bron van waarheid is.

ALTER TABLE fie_leermomenten ALTER COLUMN correctie_factor SET DEFAULT 1.0;

CREATE UNIQUE INDEX IF NOT EXISTS facturen_mailstroom_bijlage_uniek
  ON facturen (mail_message_id, bestandsnaam)
  WHERE bron = 'mailbox' AND mail_message_id IS NOT NULL AND bestandsnaam IS NOT NULL;
