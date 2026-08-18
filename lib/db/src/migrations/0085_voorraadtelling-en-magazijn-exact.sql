-- VOORRAADTELLING fase 1 — bevroren telling met verschillenlijst.
-- Deel A: bestaande magazijn-aantallen en de drie artikelprijzen van real
--         (float4) naar exact numeric(12,2), fail-closed met vergelijkbewijs
--         (zelfde aanpak als 0077 voor de calculatiemodule).
-- Deel B: nieuwe tabellen voorraad_tellingen + voorraad_telling_regels.

DO $$
DECLARE
  v_afw RECORD;
  v_voorraad int;
  v_mutaties int;
  v_artikelen int;
  v_afwijkingen int := 0;
BEGIN
  -- ── Deel A, stap 1: nieuwe kolommen ──────────────────────────────────────
  ALTER TABLE voorraad ADD COLUMN hoeveelheid_num  numeric(12,2),
                       ADD COLUMN gereserveerd_num numeric(12,2),
                       ADD COLUMN besteld_num      numeric(12,2);
  ALTER TABLE voorraad_mutaties ADD COLUMN hoeveelheid_num numeric(12,2),
                                ADD COLUMN delta_num       numeric(12,2);
  ALTER TABLE artikelen ADD COLUMN inkoopprijs_num           numeric(12,2),
                        ADD COLUMN gemiddeld_inkoopprijs_num numeric(12,2),
                        ADD COLUMN laatste_inkoopprijs_num   numeric(12,2);

  -- ── Stap 2: vullen ───────────────────────────────────────────────────────
  UPDATE voorraad SET hoeveelheid_num  = round(hoeveelheid::numeric, 2),
                      gereserveerd_num = round(gereserveerd::numeric, 2),
                      besteld_num      = round(besteld::numeric, 2);
  UPDATE voorraad_mutaties SET hoeveelheid_num = round(hoeveelheid::numeric, 2),
                               delta_num       = round(delta::numeric, 2);
  UPDATE artikelen SET inkoopprijs_num           = round(inkoopprijs::numeric, 2),
                       gemiddeld_inkoopprijs_num = round(gemiddeld_inkoopprijs::numeric, 2),
                       laatste_inkoopprijs_num   = round(laatste_inkoopprijs::numeric, 2);

  -- ── Stap 3: fail-closed vergelijking ─────────────────────────────────────
  -- Per artikel de som van de voorraadstanden oud vs. nieuw; toegestane marge
  -- een halve cent per rij (afrondverschil float→exact).
  FOR v_afw IN
    SELECT artikel_id, count(*) AS n,
           abs(sum(hoeveelheid::numeric) - sum(hoeveelheid_num)) AS verschil
    FROM voorraad
    GROUP BY artikel_id
    HAVING abs(sum(hoeveelheid::numeric) - sum(hoeveelheid_num)) > count(*) * 0.005
  LOOP
    v_afwijkingen := v_afwijkingen + 1;
    RAISE WARNING 'Afwijking voorraad artikel %: verschil % over % rijen',
      v_afw.artikel_id, v_afw.verschil, v_afw.n;
  END LOOP;

  -- Mutatiespoor: som van de delta's per artikel oud vs. nieuw.
  FOR v_afw IN
    SELECT artikel_id, count(*) AS n,
           abs(sum(delta::numeric) - sum(delta_num)) AS verschil
    FROM voorraad_mutaties
    GROUP BY artikel_id
    HAVING abs(sum(delta::numeric) - sum(delta_num)) > count(*) * 0.005
  LOOP
    v_afwijkingen := v_afwijkingen + 1;
    RAISE WARNING 'Afwijking mutaties artikel %: verschil % over % rijen',
      v_afw.artikel_id, v_afw.verschil, v_afw.n;
  END LOOP;

  -- Artikelprijzen: per artikel mag elke prijs maximaal een halve cent verschuiven.
  FOR v_afw IN
    SELECT id AS artikel_id, 1 AS n,
           greatest(
             coalesce(abs(inkoopprijs::numeric           - inkoopprijs_num), 0),
             coalesce(abs(gemiddeld_inkoopprijs::numeric - gemiddeld_inkoopprijs_num), 0),
             coalesce(abs(laatste_inkoopprijs::numeric   - laatste_inkoopprijs_num), 0)
           ) AS verschil
    FROM artikelen
    WHERE greatest(
             coalesce(abs(inkoopprijs::numeric           - inkoopprijs_num), 0),
             coalesce(abs(gemiddeld_inkoopprijs::numeric - gemiddeld_inkoopprijs_num), 0),
             coalesce(abs(laatste_inkoopprijs::numeric   - laatste_inkoopprijs_num), 0)
           ) > 0.005
  LOOP
    v_afwijkingen := v_afwijkingen + 1;
    RAISE WARNING 'Afwijking artikelprijs artikel %: verschil EUR %',
      v_afw.artikel_id, v_afw.verschil;
  END LOOP;

  IF v_afwijkingen > 0 THEN
    RAISE EXCEPTION 'VOORRAADTELLING-migratie gestopt: % afwijking(en); niets omgezet.', v_afwijkingen;
  END IF;

  -- ── Stap 4: oude kolommen weg, nieuwe hernoemen, defaults/not-null ───────
  ALTER TABLE voorraad DROP COLUMN hoeveelheid, DROP COLUMN gereserveerd, DROP COLUMN besteld;
  ALTER TABLE voorraad RENAME COLUMN hoeveelheid_num  TO hoeveelheid;
  ALTER TABLE voorraad RENAME COLUMN gereserveerd_num TO gereserveerd;
  ALTER TABLE voorraad RENAME COLUMN besteld_num      TO besteld;
  ALTER TABLE voorraad ALTER COLUMN hoeveelheid  SET DEFAULT 0, ALTER COLUMN hoeveelheid  SET NOT NULL,
                       ALTER COLUMN gereserveerd SET DEFAULT 0, ALTER COLUMN gereserveerd SET NOT NULL,
                       ALTER COLUMN besteld      SET DEFAULT 0, ALTER COLUMN besteld      SET NOT NULL;

  ALTER TABLE voorraad_mutaties DROP COLUMN hoeveelheid, DROP COLUMN delta;
  ALTER TABLE voorraad_mutaties RENAME COLUMN hoeveelheid_num TO hoeveelheid;
  ALTER TABLE voorraad_mutaties RENAME COLUMN delta_num       TO delta;
  ALTER TABLE voorraad_mutaties ALTER COLUMN hoeveelheid SET NOT NULL,
                                ALTER COLUMN delta       SET NOT NULL;

  ALTER TABLE artikelen DROP COLUMN inkoopprijs, DROP COLUMN gemiddeld_inkoopprijs, DROP COLUMN laatste_inkoopprijs;
  ALTER TABLE artikelen RENAME COLUMN inkoopprijs_num           TO inkoopprijs;
  ALTER TABLE artikelen RENAME COLUMN gemiddeld_inkoopprijs_num TO gemiddeld_inkoopprijs;
  ALTER TABLE artikelen RENAME COLUMN laatste_inkoopprijs_num   TO laatste_inkoopprijs;

  -- Opleverbewijs
  SELECT count(*) INTO v_voorraad  FROM voorraad;
  SELECT count(*) INTO v_mutaties  FROM voorraad_mutaties;
  SELECT count(*) INTO v_artikelen FROM artikelen;
  RAISE NOTICE 'VOORRAADTELLING: omgezet naar numeric(12,2): % voorraadrijen, % mutaties, % artikelen; afwijkingen: %',
    v_voorraad, v_mutaties, v_artikelen, v_afwijkingen;
END $$;

-- ── Deel B: tellingtabellen ─────────────────────────────────────────────────

CREATE TABLE voorraad_tellingen (
  id                  serial PRIMARY KEY,
  peildatum           text NOT NULL,
  grondslag           text NOT NULL,           -- inkoopprijs | laatste_inkoopprijs | gewogen_gemiddelde
  status              text NOT NULL DEFAULT 'open',   -- open | vastgesteld
  omschrijving        text,
  aangemaakt_door_id  integer REFERENCES gebruikers(id) ON DELETE SET NULL,
  aangemaakt_op       timestamp NOT NULL DEFAULT now(),
  vastgesteld_door_id integer REFERENCES gebruikers(id) ON DELETE SET NULL,
  vastgesteld_op      timestamp
);

CREATE TABLE voorraad_telling_regels (
  id                       serial PRIMARY KEY,
  telling_id               integer NOT NULL REFERENCES voorraad_tellingen(id) ON DELETE CASCADE,
  artikel_id               integer REFERENCES artikelen(id) ON DELETE SET NULL,
  artikel_naam             text NOT NULL,
  artikel_code             text,
  eenheid                  text NOT NULL DEFAULT 'st',
  locatie_id               integer REFERENCES magazijn_locaties(id) ON DELETE SET NULL,
  locatie_naam             text,
  geteld_aantal            numeric(12,2) NOT NULL DEFAULT 0,
  administratieve_voorraad numeric(12,2),
  prijs                    numeric(12,2),
  waarde                   numeric(12,2),
  laatste_beweging_op      timestamp,
  bevestigd                boolean NOT NULL DEFAULT false,
  geteld_door_id           integer REFERENCES gebruikers(id) ON DELETE SET NULL,
  geteld_op                timestamp,
  aangemaakt_op            timestamp NOT NULL DEFAULT now(),
  CONSTRAINT telling_regel_artikel_locatie UNIQUE (telling_id, artikel_id, locatie_id)
);
