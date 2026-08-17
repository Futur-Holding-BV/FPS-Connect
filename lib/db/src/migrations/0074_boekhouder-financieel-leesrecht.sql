-- RECHTEN_BOEKHOUDER_01
--
-- Het systeemprofiel "Externe boekhouder" krijgt leesrecht (niveau 1) op
-- financieel en financieel_vertrouwelijk, zodat de boekhouder facturen,
-- onderhanden werk en de jaarrekening kan inzien. Salarisarchief-,
-- salaris_mutaties- en boekhouder_portaal-rechten blijven ongewijzigd;
-- projecten, offertes en opdrachten blijven dicht.
--
-- De preset-wijziging in code (@workspace/permissies) verandert bestaande
-- DB-rijen niet vanzelf; daarom hier deployment-safe:
--  1. het systeemprofiel zelf,
--  2. de gebruikers die uit dit profiel voortkomen (herkomst_profiel_id).
-- We verhogen alleen (GREATEST), zodat handmatig hoger gezette rechten
-- nooit worden verlaagd, en de migratie idempotent is.

UPDATE profielen
SET bevoegdheden = jsonb_set(
      jsonb_set(
        bevoegdheden,
        '{financieel}',
        to_jsonb(GREATEST(COALESCE((bevoegdheden->>'financieel')::int, 0), 1))
      ),
      '{financieel_vertrouwelijk}',
      to_jsonb(GREATEST(COALESCE((bevoegdheden->>'financieel_vertrouwelijk')::int, 0), 1))
    )
WHERE naam = 'Externe boekhouder' AND systeem = true;

UPDATE gebruikers
SET bevoegdheden = jsonb_set(
      jsonb_set(
        bevoegdheden,
        '{financieel}',
        to_jsonb(GREATEST(COALESCE((bevoegdheden->>'financieel')::int, 0), 1))
      ),
      '{financieel_vertrouwelijk}',
      to_jsonb(GREATEST(COALESCE((bevoegdheden->>'financieel_vertrouwelijk')::int, 0), 1))
    )
WHERE herkomst_profiel_id IN (
  SELECT id FROM profielen WHERE naam = 'Externe boekhouder' AND systeem = true
);
