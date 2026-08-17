-- CALC_KERN_01 §2 — geldvelden van de calculatiemodule van real (float4) naar
-- exact numeric(12,2). Normtijden en hoeveelheden blijven bewust gebroken
-- getallen (real). Stapsgewijs en fail-closed in één transactie:
--   1. nieuwe kolommen aanmaken;
--   2. vullen met round(oud::numeric, 2);
--   3. per calculatie de som oud vs. nieuw vergelijken — wijkt één calculatie
--      meer dan een halve cent per regel af, dan stopt de migratie hard;
--   4. pas daarna de oude kolommen weg en de nieuwe hernoemen.
-- De RAISE NOTICE-regels vormen het opleverbewijs (aantallen omgezet/afwijkend).

DO $$
DECLARE
  v_afw RECORD;
  v_regels int;
  v_calcs int;
  v_tarieven int;
  v_artikelen int;
  v_items int;
  v_afwijkingen int := 0;
BEGIN
  -- Stap 1: nieuwe kolommen
  ALTER TABLE mod_calc_tarieven    ADD COLUMN tarief_num numeric(12,2);
  ALTER TABLE mod_calc_artikelen   ADD COLUMN inkoopprijs_num numeric(12,2),
                                   ADD COLUMN verkoopprijs_num numeric(12,2);
  ALTER TABLE mod_calc_headers     ADD COLUMN opslag_materiaal_num numeric(12,2),
                                   ADD COLUMN opslag_arbeid_num numeric(12,2),
                                   ADD COLUMN opslag_ak_num numeric(12,2),
                                   ADD COLUMN opslag_abk_num numeric(12,2),
                                   ADD COLUMN opslag_risico_num numeric(12,2),
                                   ADD COLUMN opslag_winst_num numeric(12,2),
                                   ADD COLUMN korting_num numeric(12,2);
  ALTER TABLE mod_calc_regels      ADD COLUMN tarief_num numeric(12,2),
                                   ADD COLUMN totaal_num numeric(12,2),
                                   ADD COLUMN arbeids_tarief_num numeric(12,2),
                                   ADD COLUMN onderaanneming_bedrag_num numeric(12,2);
  ALTER TABLE mod_calc_inkoop_items ADD COLUMN prijs_num numeric(12,2),
                                    ADD COLUMN bedrag_num numeric(12,2);

  -- Stap 2: vullen
  UPDATE mod_calc_tarieven  SET tarief_num = round(tarief::numeric, 2);
  UPDATE mod_calc_artikelen SET inkoopprijs_num = round(inkoopprijs::numeric, 2),
                                verkoopprijs_num = round(verkoopprijs::numeric, 2);
  UPDATE mod_calc_headers   SET opslag_materiaal_num = round(opslag_materiaal::numeric, 2),
                                opslag_arbeid_num    = round(opslag_arbeid::numeric, 2),
                                opslag_ak_num        = round(opslag_ak::numeric, 2),
                                opslag_abk_num       = round(opslag_abk::numeric, 2),
                                opslag_risico_num    = round(opslag_risico::numeric, 2),
                                opslag_winst_num     = round(opslag_winst::numeric, 2),
                                korting_num          = round(korting::numeric, 2);
  UPDATE mod_calc_regels    SET tarief_num = round(tarief::numeric, 2),
                                totaal_num = round(totaal::numeric, 2),
                                arbeids_tarief_num = round(arbeids_tarief::numeric, 2),
                                onderaanneming_bedrag_num = round(onderaanneming_bedrag::numeric, 2);
  UPDATE mod_calc_inkoop_items SET prijs_num = round(prijs::numeric, 2),
                                   bedrag_num = round(bedrag::numeric, 2);

  -- Stap 3: fail-closed vergelijking per calculatie (som van regeltotalen).
  -- Toegestane marge: een halve cent per regel (afrondverschil float→exact).
  FOR v_afw IN
    SELECT r.calculatie_id,
           h.nummer,
           count(*) AS n,
           abs(sum(r.totaal::numeric) - sum(r.totaal_num)) AS verschil
    FROM mod_calc_regels r
    JOIN mod_calc_headers h ON h.id = r.calculatie_id
    GROUP BY r.calculatie_id, h.nummer
    HAVING abs(sum(r.totaal::numeric) - sum(r.totaal_num)) > count(*) * 0.005
  LOOP
    v_afwijkingen := v_afwijkingen + 1;
    RAISE WARNING 'Afwijking calculatie % (id %): verschil EUR % over % regels',
      v_afw.nummer, v_afw.calculatie_id, v_afw.verschil, v_afw.n;
  END LOOP;
  IF v_afwijkingen > 0 THEN
    RAISE EXCEPTION 'CALC_KERN_01-migratie gestopt: % calculatie(s) wijken af; niets omgezet.', v_afwijkingen;
  END IF;

  -- Stap 4: oude kolommen weg, nieuwe hernoemen, defaults/not-null herstellen.
  ALTER TABLE mod_calc_tarieven DROP COLUMN tarief;
  ALTER TABLE mod_calc_tarieven RENAME COLUMN tarief_num TO tarief;
  ALTER TABLE mod_calc_tarieven ALTER COLUMN tarief SET DEFAULT 0,
                                ALTER COLUMN tarief SET NOT NULL;

  ALTER TABLE mod_calc_artikelen DROP COLUMN inkoopprijs, DROP COLUMN verkoopprijs;
  ALTER TABLE mod_calc_artikelen RENAME COLUMN inkoopprijs_num TO inkoopprijs;
  ALTER TABLE mod_calc_artikelen RENAME COLUMN verkoopprijs_num TO verkoopprijs;
  ALTER TABLE mod_calc_artikelen ALTER COLUMN inkoopprijs SET DEFAULT 0,
                                 ALTER COLUMN inkoopprijs SET NOT NULL,
                                 ALTER COLUMN verkoopprijs SET DEFAULT 0,
                                 ALTER COLUMN verkoopprijs SET NOT NULL;

  ALTER TABLE mod_calc_headers DROP COLUMN opslag_materiaal, DROP COLUMN opslag_arbeid,
                               DROP COLUMN opslag_ak, DROP COLUMN opslag_abk,
                               DROP COLUMN opslag_risico, DROP COLUMN opslag_winst,
                               DROP COLUMN korting;
  ALTER TABLE mod_calc_headers RENAME COLUMN opslag_materiaal_num TO opslag_materiaal;
  ALTER TABLE mod_calc_headers RENAME COLUMN opslag_arbeid_num TO opslag_arbeid;
  ALTER TABLE mod_calc_headers RENAME COLUMN opslag_ak_num TO opslag_ak;
  ALTER TABLE mod_calc_headers RENAME COLUMN opslag_abk_num TO opslag_abk;
  ALTER TABLE mod_calc_headers RENAME COLUMN opslag_risico_num TO opslag_risico;
  ALTER TABLE mod_calc_headers RENAME COLUMN opslag_winst_num TO opslag_winst;
  ALTER TABLE mod_calc_headers RENAME COLUMN korting_num TO korting;
  ALTER TABLE mod_calc_headers ALTER COLUMN opslag_materiaal SET DEFAULT 0,  ALTER COLUMN opslag_materiaal SET NOT NULL,
                               ALTER COLUMN opslag_arbeid    SET DEFAULT 0,  ALTER COLUMN opslag_arbeid SET NOT NULL,
                               ALTER COLUMN opslag_ak        SET DEFAULT 15, ALTER COLUMN opslag_ak SET NOT NULL,
                               ALTER COLUMN opslag_abk       SET DEFAULT 10, ALTER COLUMN opslag_abk SET NOT NULL,
                               ALTER COLUMN opslag_risico    SET DEFAULT 5,  ALTER COLUMN opslag_risico SET NOT NULL,
                               ALTER COLUMN opslag_winst     SET DEFAULT 10, ALTER COLUMN opslag_winst SET NOT NULL,
                               ALTER COLUMN korting          SET DEFAULT 0,  ALTER COLUMN korting SET NOT NULL;

  ALTER TABLE mod_calc_regels DROP COLUMN tarief, DROP COLUMN totaal,
                              DROP COLUMN arbeids_tarief, DROP COLUMN onderaanneming_bedrag;
  ALTER TABLE mod_calc_regels RENAME COLUMN tarief_num TO tarief;
  ALTER TABLE mod_calc_regels RENAME COLUMN totaal_num TO totaal;
  ALTER TABLE mod_calc_regels RENAME COLUMN arbeids_tarief_num TO arbeids_tarief;
  ALTER TABLE mod_calc_regels RENAME COLUMN onderaanneming_bedrag_num TO onderaanneming_bedrag;
  ALTER TABLE mod_calc_regels ALTER COLUMN tarief SET DEFAULT 0, ALTER COLUMN tarief SET NOT NULL,
                              ALTER COLUMN totaal SET DEFAULT 0, ALTER COLUMN totaal SET NOT NULL,
                              ALTER COLUMN arbeids_tarief SET DEFAULT 0, ALTER COLUMN arbeids_tarief SET NOT NULL,
                              ALTER COLUMN onderaanneming_bedrag SET DEFAULT 0, ALTER COLUMN onderaanneming_bedrag SET NOT NULL;

  ALTER TABLE mod_calc_inkoop_items DROP COLUMN prijs, DROP COLUMN bedrag;
  ALTER TABLE mod_calc_inkoop_items RENAME COLUMN prijs_num TO prijs;
  ALTER TABLE mod_calc_inkoop_items RENAME COLUMN bedrag_num TO bedrag;

  -- Opleverbewijs
  SELECT count(*) INTO v_regels    FROM mod_calc_regels;
  SELECT count(*) INTO v_calcs     FROM mod_calc_headers;
  SELECT count(*) INTO v_tarieven  FROM mod_calc_tarieven;
  SELECT count(*) INTO v_artikelen FROM mod_calc_artikelen;
  SELECT count(*) INTO v_items     FROM mod_calc_inkoop_items;
  RAISE NOTICE 'CALC_KERN_01: omgezet naar numeric(12,2): % calculaties, % regels, % tarieven, % artikelen, % inkoopitems; afwijkende calculaties: %',
    v_calcs, v_regels, v_tarieven, v_artikelen, v_items, v_afwijkingen;
END $$;
