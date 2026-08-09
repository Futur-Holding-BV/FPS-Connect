-- UREN_01 §6b — alle veld-presets (groep Uitvoering) krijgen minimaal
-- 'projecten': 1 (lezen zonder bedragen), zodat de uurcodelijst per opdracht
-- bereikbaar is bij het urenschrijven. Monteur (1) en Uitvoerder (2) hadden dit
-- al; Timmerman, Onderhoudsmonteur, Controleur en Externe inhuur nog niet.
-- Idempotent: niveaus worden alleen verhoogd, nooit verlaagd.

CREATE OR REPLACE FUNCTION uren01_verhoog(bev jsonb, sleutel text, niveau int)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN COALESCE((bev->>sleutel)::int, 0) >= niveau THEN bev
    ELSE jsonb_set(bev, ARRAY[sleutel], to_jsonb(niveau), true)
  END;
$$;

UPDATE profielen SET bevoegdheden = uren01_verhoog(bevoegdheden, 'projecten', 1)
WHERE naam IN ('Timmerman', 'Onderhoudsmonteur', 'Controleur', 'Externe inhuur')
  AND systeem = true;

-- Gebruikers die uit zo'n preset zijn afgeleid, tillen we mee (alleen omhoog).
UPDATE gebruikers g SET bevoegdheden = uren01_verhoog(g.bevoegdheden, 'projecten', 1)
WHERE g.herkomst_profiel_id IN (
  SELECT id FROM profielen
  WHERE naam IN ('Timmerman', 'Onderhoudsmonteur', 'Controleur', 'Externe inhuur')
    AND systeem = true
);

DROP FUNCTION uren01_verhoog(jsonb, text, int);
