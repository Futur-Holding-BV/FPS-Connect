-- HERSTEL_01 §4 (besluit René, 08-08-2026): alleen werkvoorbereider en
-- projectleider mogen spots archiveren/verwijderen. Het preset Werkvoorbereider
-- gaat van voorzieningen 3 naar 4.
--
-- Bevoegdheden staan per gebruiker als jsonb; het bijwerken van het preset
-- raakt bestaande accounts niet (§4.1). Daarom hier expliciet:
-- 1) het systeem-preset in de profielen-tabel bijwerken;
-- 2) bestaande gebruikers met herkomst Werkvoorbereider verhogen —
--    alleen als hun voorzieningen-niveau nog op het oude preset-niveau (3)
--    staat, zodat een bewuste handmatige verlaging niet wordt overschreven.

UPDATE profielen
SET bevoegdheden = jsonb_set(bevoegdheden, '{voorzieningen}', '4')
WHERE naam = 'Werkvoorbereider'
  AND systeem = true
  AND (bevoegdheden->>'voorzieningen')::int = 3;

UPDATE gebruikers g
SET bevoegdheden = jsonb_set(g.bevoegdheden, '{voorzieningen}', '4')
FROM profielen p
WHERE p.naam = 'Werkvoorbereider'
  AND p.systeem = true
  AND g.herkomst_profiel_id = p.id
  AND (g.bevoegdheden->>'voorzieningen')::int = 3;
