-- BOUW_01 §1 — splitsing van de modulesleutel 'offertes'.
-- opdrachten.ts en werkvoorbereiding.ts vallen voortaan onder de nieuwe sleutel
-- 'projecten' (1 = lezen zonder bedragen, 2 = lezen mét bedragen, 3 = schrijven).
--
-- Bestaande rechten mogen niet stilzwijgend wegvallen: iedereen die nu via
-- 'offertes' bij opdrachten/werkvoorbereiding kan, krijgt het equivalente
-- 'projecten'-niveau erbij:
--   offertes 1        → projecten 2  (kon lezen mét bedragen)
--   offertes >= 2     → projecten 3  (kon schrijven)
-- Alleen als 'projecten' nog niet gezet is (idempotent, geen degradatie).

-- 1) Opgeslagen gebruikersmatrices
UPDATE gebruikers
SET bevoegdheden = jsonb_set(
      bevoegdheden,
      '{projecten}',
      to_jsonb(CASE WHEN (bevoegdheden->>'offertes')::int >= 2 THEN 3 ELSE 2 END)
    )
WHERE bevoegdheden ? 'offertes'
  AND COALESCE((bevoegdheden->>'offertes')::int, 0) >= 1
  AND COALESCE((bevoegdheden->>'projecten')::int, 0) = 0;

-- 2) Profielen (presets in de database; de nieuwe systeem-preset-waarden
--    worden daarnaast door synchroniseer-standaard/PRESETS-code gezet, maar
--    handmatig aangemaakte of aangepaste profielen lopen alleen via deze regel)
UPDATE profielen
SET bevoegdheden = jsonb_set(
      bevoegdheden,
      '{projecten}',
      to_jsonb(CASE WHEN (bevoegdheden->>'offertes')::int >= 2 THEN 3 ELSE 2 END)
    )
WHERE bevoegdheden ? 'offertes'
  AND COALESCE((bevoegdheden->>'offertes')::int, 0) >= 1
  AND COALESCE((bevoegdheden->>'projecten')::int, 0) = 0;
