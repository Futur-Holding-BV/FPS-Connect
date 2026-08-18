-- CALC-RECHTEN (René, 18-08-2026): Projectleider en Werkvoorbereider gaan voor
-- de module calculaties van niveau 1 (lezen) naar niveau 3 (aanmaken), zodat
-- zij zelf calculaties kunnen aanmaken. Commercieel (0) en Directie (1)
-- blijven bewust ongewijzigd.
--
-- Bevoegdheden staan per gebruiker opgeslagen (kopie bij preset-toepassing).
-- Naast de SYSTEEM-profielen worden bestaande accounts bijgewerkt, maar
-- uitsluitend wanneer hun volledige matrix exact gelijk is aan de OUDE preset
-- (niveau 0 == ontbrekende sleutel, zelfde semantiek als bevoegdhedenGelijk in
-- @workspace/permissies). herkomst_profiel_id alléén is niet betrouwbaar:
-- die koppeling blijft staan na handmatige aanpassingen, en een handmatig
-- verlaagd of afwijkend account mag hier nooit stilzwijgend verhoogd worden.
-- Zelf aangemaakte (niet-systeem) profielen met toevallig dezelfde naam
-- blijven eveneens ongemoeid. De aantallen worden via RAISE NOTICE in de
-- migratielog (deploy-log) gemeld.
DO $$
DECLARE
  n_profielen int;
  n_accounts int;
BEGIN
  UPDATE profielen
  SET bevoegdheden = jsonb_set(COALESCE(bevoegdheden, '{}'::jsonb), '{calculaties}', '3'::jsonb)
  WHERE systeem = true
    AND naam IN ('Projectleider', 'Werkvoorbereider')
    AND COALESCE((bevoegdheden->>'calculaties')::int, 0) < 3;
  GET DIAGNOSTICS n_profielen = ROW_COUNT;

  WITH oude_presets(naam, m) AS (VALUES
    ('Projectleider', '{"gebouwen":4,"voorzieningen":4,"inspecties":4,"onderhoud":4,"rapportages":4,"bibliotheek":3,"crm":3,"planning":3,"toolbox":3,"calculaties":1,"financieel":2,"goedkeuring":3,"declaraties":3,"projecten":3,"magazijn":2,"gereedschappen":2,"merk":1}'::jsonb),
    ('Werkvoorbereider', '{"gebouwen":3,"voorzieningen":4,"inspecties":2,"onderhoud":3,"rapportages":2,"bibliotheek":3,"crm":1,"financieel":3,"projecten":3,"calculaties":1,"magazijn":2,"gereedschappen":2,"planning":2}'::jsonb)
  )
  UPDATE gebruikers g
  SET bevoegdheden = jsonb_set(COALESCE(g.bevoegdheden, '{}'::jsonb), '{calculaties}', '3'::jsonb)
  FROM oude_presets op
  WHERE g.rol = 'gebruiker'
    AND COALESCE((g.bevoegdheden->>'calculaties')::int, 0) < 3
    AND NOT EXISTS (
      SELECT 1
      FROM (
        SELECT jsonb_object_keys(op.m) AS k
        UNION
        SELECT jsonb_object_keys(COALESCE(g.bevoegdheden, '{}'::jsonb)) AS k
      ) sleutels
      WHERE COALESCE((op.m->>sleutels.k)::int, 0)
        IS DISTINCT FROM COALESCE((g.bevoegdheden->>sleutels.k)::int, 0)
    );
  GET DIAGNOSTICS n_accounts = ROW_COUNT;

  RAISE NOTICE '[0081] systeem-profielen bijgewerkt: %, accounts met exact de oude preset-matrix bijgewerkt: %',
    n_profielen, n_accounts;
END $$;
