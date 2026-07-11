-- Governance-integratie facturen — subtype veld voor creditnota/prijsafwijking
-- Uitgevoerd via directe SQL (geen drizzle push)
-- Reden: additieve nullable kolom, geen effect op bestaande rijen of queries

-- Voegt subtype toe aan facturenTable voor doelgericht goedkeuringsbeleid per factuursoort.
-- Geldige waarden: NULL (gewone inkoop/verkoopfactuur) | 'creditnota' | 'prijsafwijking'
ALTER TABLE facturen ADD COLUMN IF NOT EXISTS subtype text;
