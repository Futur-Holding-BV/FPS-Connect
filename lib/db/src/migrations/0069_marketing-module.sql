-- MARKETING_02 — eigen module "marketing" in de bevoegdheden-matrix
-- (akkoord René 17-08-2026): losgekoppeld van crm.
--   - preset Commercieel: marketing 3 (beheren + proefverzenden)
--   - preset Directie:    marketing 4 (ook écht verzenden/stoppen)
-- Idempotent: niveaus worden alleen verhoogd, nooit verlaagd.
-- Handmatig aangemaakte/aangepaste profielen blijven op 0 (fail-closed);
-- een beheerder kent het recht bewust toe via Rollen & Rechten.

CREATE OR REPLACE FUNCTION marketing02_verhoog(bev jsonb, sleutel text, niveau int)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN COALESCE((bev->>sleutel)::int, 0) >= niveau THEN bev
    ELSE jsonb_set(bev, ARRAY[sleutel], to_jsonb(niveau), true)
  END;
$$;

UPDATE profielen SET bevoegdheden = marketing02_verhoog(bevoegdheden, 'marketing', 3)
WHERE naam = 'Commercieel' AND systeem = true;

UPDATE profielen SET bevoegdheden = marketing02_verhoog(bevoegdheden, 'marketing', 4)
WHERE naam = 'Directie' AND systeem = true;

-- Gebruikers die uit deze presets zijn afgeleid, tillen we mee (alleen omhoog).
UPDATE gebruikers g SET bevoegdheden = marketing02_verhoog(g.bevoegdheden, 'marketing', 3)
WHERE g.herkomst_profiel_id IN (
  SELECT id FROM profielen WHERE naam = 'Commercieel' AND systeem = true
);

UPDATE gebruikers g SET bevoegdheden = marketing02_verhoog(g.bevoegdheden, 'marketing', 4)
WHERE g.herkomst_profiel_id IN (
  SELECT id FROM profielen WHERE naam = 'Directie' AND systeem = true
);

DROP FUNCTION marketing02_verhoog(jsonb, text, int);
