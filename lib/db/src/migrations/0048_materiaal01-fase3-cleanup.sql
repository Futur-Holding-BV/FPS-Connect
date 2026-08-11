-- MATERIAAL_01 fase 3 cleanup: verwijder de verkeerde kolom die door het
-- tijdelijk aanwezige bestand 0043_materiaal01-fase3-inkoopbon.sql werd
-- aangemaakt. De definitieve kolom is inkoopbon_id (migratie 0044).
-- IF NOT EXISTS: veilig in omgevingen die 0043_materiaal01 nooit hebben gedraaid.
ALTER TABLE materiaal_aanvragen
  DROP COLUMN IF EXISTS resultaat_inkoopbon_id;
