-- NUMMER_01 — Kenmerkketen volgens de ENK-piramide
-- Sequences per soort (§4.2): nooit max(...)+1. Eén doorlopende reeks over alle
-- BV's (§4.7); alleen de fiscale factuurreeks is per BV (aparte teller-tabel).

CREATE SEQUENCE IF NOT EXISTS seq_nummer_g START 1;
CREATE SEQUENCE IF NOT EXISTS seq_nummer_m START 1;
CREATE SEQUENCE IF NOT EXISTS seq_nummer_c START 1;
CREATE SEQUENCE IF NOT EXISTS seq_nummer_o START 1;
CREATE SEQUENCE IF NOT EXISTS seq_nummer_i START 1;

-- ── G: bestaande gebouwen op aanmaakvolgorde nummeren in werknummer (§4.8/§4.9)
-- Alleen rijen zonder werknummer; bestaande waarden blijven staan.
WITH te_nummeren AS (
  SELECT id, row_number() OVER (ORDER BY aangemaakt_op, id) AS rn
  FROM gebouwen
  WHERE nullif(trim(werknummer), '') IS NULL
)
UPDATE gebouwen g
SET werknummer = 'G' || lpad(t.rn::text, 3, '0')
FROM te_nummeren t WHERE g.id = t.id;

SELECT setval('seq_nummer_g', GREATEST(
  (SELECT count(*) FROM gebouwen WHERE werknummer ~ '^G[0-9]+$'), 1),
  (SELECT count(*) FROM gebouwen WHERE werknummer ~ '^G[0-9]+$') > 0);

-- ── M: opnames.nummer
ALTER TABLE opnames ADD COLUMN IF NOT EXISTS nummer integer;
UPDATE opnames SET nummer = t.rn FROM (
  SELECT id, row_number() OVER (ORDER BY aangemaakt_op, id) AS rn FROM opnames
) t WHERE opnames.id = t.id AND opnames.nummer IS NULL;
SELECT setval('seq_nummer_m', GREATEST((SELECT coalesce(max(nummer),0) FROM opnames), 1),
              (SELECT coalesce(max(nummer),0) FROM opnames) > 0);
ALTER TABLE opnames ALTER COLUMN nummer SET DEFAULT nextval('seq_nummer_m');
ALTER TABLE opnames ALTER COLUMN nummer SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS opnames_nummer_uniek ON opnames (nummer);

-- ── C: calculaties.nummer + schakels (§4.4: calculaties.opname_id gekozen —
-- de piramide loopt meeting → calculatie, dus de calculatie draagt de verwijzing)
ALTER TABLE calculaties ADD COLUMN IF NOT EXISTS nummer integer;
UPDATE calculaties SET nummer = t.rn FROM (
  SELECT id, row_number() OVER (ORDER BY aangemaakt_op, id) AS rn FROM calculaties
) t WHERE calculaties.id = t.id AND calculaties.nummer IS NULL;
SELECT setval('seq_nummer_c', GREATEST((SELECT coalesce(max(nummer),0) FROM calculaties), 1),
              (SELECT coalesce(max(nummer),0) FROM calculaties) > 0);
ALTER TABLE calculaties ALTER COLUMN nummer SET DEFAULT nextval('seq_nummer_c');
ALTER TABLE calculaties ALTER COLUMN nummer SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS calculaties_nummer_uniek ON calculaties (nummer);
ALTER TABLE calculaties ADD COLUMN IF NOT EXISTS opname_id integer REFERENCES opnames(id) ON DELETE SET NULL;
ALTER TABLE calculaties ADD COLUMN IF NOT EXISTS gekopieerd_van_id integer REFERENCES calculaties(id) ON DELETE SET NULL;
ALTER TABLE calculaties ADD COLUMN IF NOT EXISTS verzonden_op timestamp;

-- ── O: offertes.nummer + echte FK op calculatie_id (§4.3) + kopie/bevries-velden (§4.10)
ALTER TABLE offertes ADD COLUMN IF NOT EXISTS nummer integer;
UPDATE offertes SET nummer = t.rn FROM (
  SELECT id, row_number() OVER (ORDER BY aangemaakt_op, id) AS rn FROM offertes
) t WHERE offertes.id = t.id AND offertes.nummer IS NULL;
SELECT setval('seq_nummer_o', GREATEST((SELECT coalesce(max(nummer),0) FROM offertes), 1),
              (SELECT coalesce(max(nummer),0) FROM offertes) > 0);
ALTER TABLE offertes ALTER COLUMN nummer SET DEFAULT nextval('seq_nummer_o');
ALTER TABLE offertes ALTER COLUMN nummer SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS offertes_nummer_uniek ON offertes (nummer);
DO $$ BEGIN
  ALTER TABLE offertes
    ADD CONSTRAINT offertes_calculatie_id_fk
    FOREIGN KEY (calculatie_id) REFERENCES calculaties(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE offertes ADD COLUMN IF NOT EXISTS gekopieerd_van_id integer REFERENCES offertes(id) ON DELETE SET NULL;
-- Vastgevroren kenmerk-momentopname bij versturen (§4.3): berekend, daarna bevroren.
ALTER TABLE offertes ADD COLUMN IF NOT EXISTS kenmerk text;

-- ── I: één gedeelde reeks over projectinkoop (inkoopbonnen) en voorraadinkoop
-- (magazijn_inkooporders); de ouder verschilt (§4.5).
ALTER TABLE inkoopbonnen ADD COLUMN IF NOT EXISTS nummer integer DEFAULT nextval('seq_nummer_i');
UPDATE inkoopbonnen SET nummer = nextval('seq_nummer_i') WHERE nummer IS NULL;
ALTER TABLE inkoopbonnen ALTER COLUMN nummer SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS inkoopbonnen_nummer_uniek ON inkoopbonnen (nummer);
ALTER TABLE inkoopbonnen ADD COLUMN IF NOT EXISTS offerte_id integer REFERENCES offertes(id) ON DELETE SET NULL;
ALTER TABLE inkoopbonnen ADD COLUMN IF NOT EXISTS herziening integer NOT NULL DEFAULT 0;

ALTER TABLE magazijn_inkooporders ADD COLUMN IF NOT EXISTS inkoopnummer integer DEFAULT nextval('seq_nummer_i');
UPDATE magazijn_inkooporders SET inkoopnummer = nextval('seq_nummer_i') WHERE inkoopnummer IS NULL;
ALTER TABLE magazijn_inkooporders ALTER COLUMN inkoopnummer SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS magazijn_inkooporders_inkoopnummer_uniek ON magazijn_inkooporders (inkoopnummer);
ALTER TABLE magazijn_inkooporders ADD COLUMN IF NOT EXISTS gebouw_id integer REFERENCES gebouwen(id) ON DELETE SET NULL;
ALTER TABLE magazijn_inkooporders ADD COLUMN IF NOT EXISTS herziening integer NOT NULL DEFAULT 0;
-- Het magazijn is een eigen gebouw (besluit 10): instelbaar in magazijn_instellingen.
ALTER TABLE magazijn_instellingen ADD COLUMN IF NOT EXISTS magazijn_gebouw_id integer REFERENCES gebouwen(id) ON DELETE SET NULL;

-- Herziene inkoopopdrachten overschrijven de vorige niet (§4.5): momentopnames.
CREATE TABLE IF NOT EXISTS inkoop_versies (
  id serial PRIMARY KEY,
  bron_tabel text NOT NULL,             -- 'inkoopbonnen' | 'magazijn_inkooporders'
  bron_id integer NOT NULL,
  herziening integer NOT NULL,          -- de versie die hier bevroren is (0 = origineel)
  kenmerk text NOT NULL,                -- bv. O405/I088a zoals verstuurd
  snapshot jsonb NOT NULL,
  aangemaakt_door_id integer REFERENCES gebruikers(id) ON DELETE SET NULL,
  aangemaakt_op timestamp NOT NULL DEFAULT now(),
  UNIQUE (bron_tabel, bron_id, herziening)
);

-- ── F: kenmerk-volgnummer per offerte + verwijzing (§4.6)
ALTER TABLE facturen ADD COLUMN IF NOT EXISTS offerte_id integer REFERENCES offertes(id) ON DELETE SET NULL;
ALTER TABLE facturen ADD COLUMN IF NOT EXISTS nummer integer; -- F-deel, per offerte vanaf 1; géén factuurnummer
CREATE UNIQUE INDEX IF NOT EXISTS facturen_offerte_nummer_uniek
  ON facturen (offerte_id, nummer) WHERE offerte_id IS NOT NULL AND nummer IS NOT NULL;
ALTER TABLE facturen ADD COLUMN IF NOT EXISTS kenmerk text; -- bevroren bij definitief maken

-- Fiscale factuurreeks per BV (§4.6): teller onder slot, pas bij definitief maken.
CREATE TABLE IF NOT EXISTS factuurnummer_tellers (
  werkgever_id integer PRIMARY KEY REFERENCES werkgevers(id) ON DELETE CASCADE,
  laatste_nummer integer NOT NULL DEFAULT 0,
  bijgewerkt_op timestamp NOT NULL DEFAULT now()
);
