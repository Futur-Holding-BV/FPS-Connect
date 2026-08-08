-- WAGENPARK_01 review-fix: race-vrije rit-dedupe.
-- Parallelle syncs (handmatig + bewakingsloop) konden dezelfde provider-rit
-- dubbel importeren (select-then-insert). Partiële unieke index + de code
-- gebruikt nu ON CONFLICT DO NOTHING.

-- Eerst bestaande duplicaten opruimen (oudste rij wint).
DELETE FROM wagenpark_ritten a
USING wagenpark_ritten b
WHERE a.provider_rit_id IS NOT NULL
  AND a.provider_rit_id = b.provider_rit_id
  AND a.id > b.id;

CREATE UNIQUE INDEX IF NOT EXISTS wagenpark_ritten_provider_rit_id_uniek
  ON wagenpark_ritten (provider_rit_id)
  WHERE provider_rit_id IS NOT NULL;
