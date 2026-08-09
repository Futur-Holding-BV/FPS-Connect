-- BOUW_01 §1 — veld-presets krijgen de nieuwe sleutel 'projecten'
-- (1 = lezen zonder bedragen, 2 = lezen mét bedragen, 3 = schrijven)
-- plus de bijbehorende magazijn/gereedschappen/calculaties/planning-niveaus.
-- Idempotent: niveaus worden alleen verhoogd, nooit verlaagd.

CREATE OR REPLACE FUNCTION bouw01_verhoog(bev jsonb, sleutel text, niveau int)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN COALESCE((bev->>sleutel)::int, 0) >= niveau THEN bev
    ELSE jsonb_set(bev, ARRAY[sleutel], to_jsonb(niveau), true)
  END;
$$;

UPDATE profielen SET bevoegdheden =
  bouw01_verhoog(bouw01_verhoog(bouw01_verhoog(bevoegdheden,
    'projecten',1),'magazijn',1),'gereedschappen',1)
WHERE naam = 'Monteur' AND systeem = true;

UPDATE profielen SET bevoegdheden =
  bouw01_verhoog(bouw01_verhoog(bouw01_verhoog(bevoegdheden,
    'projecten',2),'magazijn',1),'gereedschappen',1)
WHERE naam = 'Uitvoerder' AND systeem = true;

UPDATE profielen SET bevoegdheden =
  bouw01_verhoog(bouw01_verhoog(bouw01_verhoog(bouw01_verhoog(bouw01_verhoog(bevoegdheden,
    'projecten',3),'calculaties',1),'magazijn',2),'gereedschappen',2),'planning',2)
WHERE naam = 'Werkvoorbereider' AND systeem = true;

UPDATE profielen SET bevoegdheden =
  bouw01_verhoog(bouw01_verhoog(bouw01_verhoog(bevoegdheden,
    'projecten',3),'magazijn',2),'gereedschappen',2)
WHERE naam = 'Projectleider' AND systeem = true;

-- Gebruikers die uit zo'n preset zijn afgeleid, tillen we mee (alleen omhoog).
UPDATE gebruikers g SET bevoegdheden = (
  SELECT bouw01_verhoog(bouw01_verhoog(bouw01_verhoog(bouw01_verhoog(bouw01_verhoog(g.bevoegdheden,
    'projecten', COALESCE((p.bevoegdheden->>'projecten')::int,0)),
    'magazijn', COALESCE((p.bevoegdheden->>'magazijn')::int,0)),
    'gereedschappen', COALESCE((p.bevoegdheden->>'gereedschappen')::int,0)),
    'calculaties', COALESCE((p.bevoegdheden->>'calculaties')::int,0)),
    'planning', COALESCE((p.bevoegdheden->>'planning')::int,0))
  FROM profielen p WHERE p.id = g.herkomst_profiel_id
)
WHERE g.herkomst_profiel_id IN (
  SELECT id FROM profielen WHERE naam IN ('Monteur','Uitvoerder','Werkvoorbereider','Projectleider') AND systeem = true
);

DROP FUNCTION bouw01_verhoog(jsonb, text, int);
