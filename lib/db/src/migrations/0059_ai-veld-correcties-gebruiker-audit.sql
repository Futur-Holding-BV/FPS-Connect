-- AI_01 vervolg (17-08-2026) — audit-kolom voor de generieke leerlus:
-- vastleggen wélke gebruiker een AI-veld-correctie insloeg (review-bevinding:
-- leerdata-vergiftiging moet herleidbaar zijn). Additief, geen bestaande data
-- geraakt; ON DELETE SET NULL zodat offboarding/verwijdering niet blokkeert.
ALTER TABLE ai_veld_correcties
  ADD COLUMN IF NOT EXISTS gebruiker_id integer REFERENCES gebruikers(id) ON DELETE SET NULL;
