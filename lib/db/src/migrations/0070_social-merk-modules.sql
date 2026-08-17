-- #1037 — eigen modules "social" en "merk" in de bevoegdheden-matrix
-- (akkoord René 17-08-2026): losgekoppeld van crm, zelfde aanpak als 0069.
--   Social (plannen, plaatsen, cijfers):
--     - preset Commercieel: social 3 (opstellen en klaarzetten)
--     - preset Directie:    social 4 (plaatsen en koppelingen beheren)
--   Merk (merkenkast + beeldbank, altijd samen gebruikt):
--     - presets Commercieel en Directie: merk 3 (zoeken, downloaden, uploaden)
--     - presets Calculatie, Administratie en Projectleider: merk 1 (alleen
--       zoeken/downloaden — logo's en projectfoto's voor offertes, brieven
--       en rapportages)
--   Veldprofielen krijgen niets; huisstijl beheren blijft organisatiebeheer.
-- Idempotent: niveaus worden alleen verhoogd, nooit verlaagd.
-- Handmatig aangemaakte/aangepaste profielen blijven op 0 (fail-closed).

CREATE OR REPLACE FUNCTION socialmerk_verhoog(bev jsonb, sleutel text, niveau int)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN COALESCE((bev->>sleutel)::int, 0) >= niveau THEN bev
    ELSE jsonb_set(bev, ARRAY[sleutel], to_jsonb(niveau), true)
  END;
$$;

-- Social
UPDATE profielen SET bevoegdheden = socialmerk_verhoog(bevoegdheden, 'social', 3)
WHERE naam = 'Commercieel' AND systeem = true;
UPDATE profielen SET bevoegdheden = socialmerk_verhoog(bevoegdheden, 'social', 4)
WHERE naam = 'Directie' AND systeem = true;

-- Merk
UPDATE profielen SET bevoegdheden = socialmerk_verhoog(bevoegdheden, 'merk', 3)
WHERE naam IN ('Commercieel', 'Directie') AND systeem = true;
UPDATE profielen SET bevoegdheden = socialmerk_verhoog(bevoegdheden, 'merk', 1)
WHERE naam IN ('Calculatie', 'Administratie', 'Projectleider') AND systeem = true;

-- Gebruikers die hun bevoegdheden van deze systeem-presets afleiden
UPDATE gebruikers g SET bevoegdheden = socialmerk_verhoog(g.bevoegdheden, 'social', 3)
FROM profielen p
WHERE g.herkomst_profiel_id = p.id AND p.systeem = true AND p.naam = 'Commercieel'
  AND g.bevoegdheden IS NOT NULL;
UPDATE gebruikers g SET bevoegdheden = socialmerk_verhoog(g.bevoegdheden, 'social', 4)
FROM profielen p
WHERE g.herkomst_profiel_id = p.id AND p.systeem = true AND p.naam = 'Directie'
  AND g.bevoegdheden IS NOT NULL;
UPDATE gebruikers g SET bevoegdheden = socialmerk_verhoog(g.bevoegdheden, 'merk', 3)
FROM profielen p
WHERE g.herkomst_profiel_id = p.id AND p.systeem = true AND p.naam IN ('Commercieel', 'Directie')
  AND g.bevoegdheden IS NOT NULL;
UPDATE gebruikers g SET bevoegdheden = socialmerk_verhoog(g.bevoegdheden, 'merk', 1)
FROM profielen p
WHERE g.herkomst_profiel_id = p.id AND p.systeem = true
  AND p.naam IN ('Calculatie', 'Administratie', 'Projectleider')
  AND g.bevoegdheden IS NOT NULL;

DROP FUNCTION socialmerk_verhoog(jsonb, text, int);
