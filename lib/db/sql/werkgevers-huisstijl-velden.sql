-- Huisstijlvelden op werkgevers t.b.v. Document Studio AI-huisstijlvoorstel
-- (Documentopmaak neemt IBAN, koptekst-/voettekstpositie en marges over uit een
-- geüpload referentiedocument als accepteer/wijzig/weiger-voorstel).
-- Idempotent: veilig herhaaldelijk uit te voeren (zie werkgevers.sql voor het patroon).

ALTER TABLE werkgevers ADD COLUMN IF NOT EXISTS iban text;
ALTER TABLE werkgevers ADD COLUMN IF NOT EXISTS koptekst_positie text;
ALTER TABLE werkgevers ADD COLUMN IF NOT EXISTS voettekst_positie text;
ALTER TABLE werkgevers ADD COLUMN IF NOT EXISTS marge_boven numeric(6, 2);
ALTER TABLE werkgevers ADD COLUMN IF NOT EXISTS marge_onder numeric(6, 2);
ALTER TABLE werkgevers ADD COLUMN IF NOT EXISTS marge_links numeric(6, 2);
ALTER TABLE werkgevers ADD COLUMN IF NOT EXISTS marge_rechts numeric(6, 2);
