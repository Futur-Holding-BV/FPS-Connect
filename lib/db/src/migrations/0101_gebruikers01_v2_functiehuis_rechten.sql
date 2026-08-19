-- GEBRUIKERS_01 v2 — Functiehuis globalisering, afwijkingstabel en log
-- Niet-destructief: bestaande IDs blijven intact, rijen worden gedeactiveerd
-- in plaats van verwijderd, BV-koppeling wordt geneutraliseerd.
--
-- Terugdraaibaarheid:
--   Alle wijzigingen zijn additief of soft-updates (actief=false).
--   Functies 8 en 9 worden op actief=false gezet maar niet verwijderd.
--   Werkgever_id én werkmaatschappij van alle functies worden geneutraliseerd.
--   Snapshot (stap 0) legt de volledige begintoestand vast in een JSON-tabel.

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Snapshot-tabel aanmaken en vullen VÓÓR alle mutaties
--    Additieve snapshot: JSON van functies + medewerker/aanstellingverwijzingen.
--    Kan worden gebruikt voor rollback-analyse of audit na de migratie.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gebruikers01_v2_snapshot (
  id           serial PRIMARY KEY,
  object_type  text        NOT NULL,  -- 'functie' | 'medewerker_aanstelling_ref'
  object_id    integer     NOT NULL,
  snapshot     jsonb       NOT NULL,
  vastgelegd_op timestamp  NOT NULL DEFAULT NOW(),
  UNIQUE (object_type, object_id)
);

CREATE INDEX IF NOT EXISTS g01v2snap_type_idx ON gebruikers01_v2_snapshot (object_type);

-- Snapshot functies (complete rij)
INSERT INTO gebruikers01_v2_snapshot (object_type, object_id, snapshot)
SELECT 'functie', f.id, row_to_json(f)::jsonb
FROM functies f
ON CONFLICT (object_type, object_id) DO NOTHING;

-- Snapshot medewerker→functie verwijzingen (medewerkers.functie_id)
INSERT INTO gebruikers01_v2_snapshot (object_type, object_id, snapshot)
SELECT 'medewerker_functie_ref', m.id,
  jsonb_build_object(
    'medewerker_id',  m.id,
    'gebruiker_id',   m.gebruiker_id,
    'functie_id',     m.functie_id
  )
FROM medewerkers m
WHERE m.functie_id IS NOT NULL
ON CONFLICT (object_type, object_id) DO NOTHING;

-- Snapshot aanstelling→functie verwijzingen
INSERT INTO gebruikers01_v2_snapshot (object_type, object_id, snapshot)
SELECT 'aanstelling_functie_ref', ma.id,
  jsonb_build_object(
    'aanstelling_id', ma.id,
    'medewerker_id',  ma.medewerker_id,
    'functie_id',     ma.functie_id,
    'is_hoofd',       ma.is_hoofd
  )
FROM medewerker_aanstellingen ma
WHERE ma.functie_id IS NOT NULL
ON CONFLICT (object_type, object_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Functies globaliseren: werkgever_id én werkmaatschappij neutraliseren
--    voor ALLE bestaande functies (niet alleen BV-gebonden).
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE functies
SET werkgever_id = NULL,
    werkmaatschappij = '',
    bijgewerkt_op = NOW();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Functies 8 en 9 inactiveren (niet verwijderen)
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE functies SET actief = false, bijgewerkt_op = NOW()
WHERE id IN (8, 9);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. FAIL-CLOSED: alle 18 verwachte profielen MOETEN al bestaan.
--    De profiel-inventaris bewees dat alle 18 er zijn, met echte rechten-
--    matrices. Deze migratie mag NOOIT stil een profiel met lege rechten ('{}')
--    aanmaken — dat zou een bestaande matrix kunnen maskeren of een rechtloos
--    profiel introduceren. In plaats daarvan verifiëren we het bestaan en
--    breken we de migratie af als er één ontbreekt.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  verwacht text[] := ARRAY[
    'Monteur','Timmerman','Uitvoerder','Onderhoudsmonteur','Controleur',
    'Externe inhuur','Projectleider','Werkvoorbereider','Project-admin',
    'Planner','Commercieel','Calculatie','HRM-adviseur','Directie',
    'Administratie','Externe boekhouder','Magazijnbeheerder','Wagenparkbeheerder'
  ];
  ontbrekend text[];
BEGIN
  SELECT array_agg(n) INTO ontbrekend
  FROM unnest(verwacht) AS n
  WHERE NOT EXISTS (SELECT 1 FROM profielen WHERE profielen.naam = n);

  IF ontbrekend IS NOT NULL AND array_length(ontbrekend, 1) > 0 THEN
    RAISE EXCEPTION
      'GEBRUIKERS_01 v2 migratie afgebroken: verwachte profielen ontbreken: %. '
      'Deze migratie maakt bewust GEEN lege profielen aan; herstel de profiel-'
      'inventaris eerst.', array_to_string(ontbrekend, ', ');
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. De 16 nieuwe globale functies aanmaken (ZONDER Project-admin en Administratie
--    — die bestaan al als ID10 en ID11 en worden hieronder gekoppeld).
--    De werkelijk ingevoegde rijen krijgen een eigen snapshot-type, zodat een
--    inverse herstelactie precies deze functies kan inactiveren en nooit later
--    handmatig toegevoegde functies raakt.
-- ─────────────────────────────────────────────────────────────────────────────
WITH ingevoegd AS (
  INSERT INTO functies (naam, werkmaatschappij, werkgever_id, omschrijving, uitvoerend, actief, aangemaakt_op, bijgewerkt_op)
  SELECT f.naam, '', NULL, f.omschrijving, f.uitvoerend, true, NOW(), NOW()
  FROM (VALUES
    ('Monteur',            'Veldmedewerker brandpreventie',         true),
    ('Timmerman',          'Timmerman / bouwkundig monteur',        true),
    ('Uitvoerder',         'Uitvoerend voorman op de werkvloer',   true),
    ('Onderhoudsmonteur',  'Onderhoudsmonteur installaties',       true),
    ('Controleur',         'Kwaliteitscontroleur en inspecteur',   false),
    ('Externe inhuur',     'Extern ingehuurd uitvoerend personeel',false),
    ('Projectleider',      'Projectleider bouw en installatie',    false),
    ('Werkvoorbereider',   'Werkvoorbereider en planner',          false),
    ('Planner',            'Planner roosters en capaciteit',       false),
    ('Commercieel',        'Commercieel medewerker en verkoop',    false),
    ('Calculatie',         'Calculator en begrotingsspecialist',   false),
    ('HRM-adviseur',       'HRM-adviseur en personeelszaken',      false),
    ('Directie',           'Directie en management',               false),
    ('Externe boekhouder', 'Externe boekhouder en accountant',     false),
    ('Magazijnbeheerder',  'Magazijnbeheerder en voorraadbeheer',  false),
    ('Wagenparkbeheerder', 'Wagenparkbeheerder en vlootbeheer',    false)
  ) AS f(naam, omschrijving, uitvoerend)
  WHERE NOT EXISTS (
    SELECT 1 FROM functies WHERE naam = f.naam AND actief = true
  )
  RETURNING *
)
INSERT INTO gebruikers01_v2_snapshot (object_type, object_id, snapshot)
SELECT 'nieuwe_functie', i.id, row_to_json(i)::jsonb
FROM ingevoegd i
ON CONFLICT (object_type, object_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. ID10 (Project Administratie) koppelen aan profiel 'Project-admin'
--    ID11 (Algemene Administratie) koppelen aan profiel 'Administratie'
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE functies SET
  profiel_id = (SELECT id FROM profielen WHERE naam = 'Project-admin' LIMIT 1),
  bijgewerkt_op = NOW()
WHERE id = 10 AND profiel_id IS NULL;

UPDATE functies SET
  profiel_id = (SELECT id FROM profielen WHERE naam = 'Administratie' LIMIT 1),
  bijgewerkt_op = NOW()
WHERE id = 11 AND profiel_id IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Koppel alle overige actieve functies aan gelijknamig profiel (idempotent)
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE functies f
SET profiel_id = p.id, bijgewerkt_op = NOW()
FROM profielen p
WHERE f.naam = p.naam
  AND f.actief = true
  AND f.profiel_id IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Afwijkingstabel per gebruiker/module
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gebruiker_bevoegdheid_afwijkingen (
  id              serial PRIMARY KEY,
  gebruiker_id    integer NOT NULL REFERENCES gebruikers(id) ON DELETE CASCADE,
  module_id       text    NOT NULL,
  niveau          integer NOT NULL,
  reden           text    NOT NULL,
  actor_id        integer REFERENCES gebruikers(id) ON DELETE SET NULL,
  actor_naam      text,
  aangemaakt_op   timestamp NOT NULL DEFAULT NOW(),
  UNIQUE (gebruiker_id, module_id)
);

CREATE INDEX IF NOT EXISTS gba_gebruiker_idx ON gebruiker_bevoegdheid_afwijkingen (gebruiker_id);
CREATE INDEX IF NOT EXISTS gba_module_idx    ON gebruiker_bevoegdheid_afwijkingen (module_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Append-only audit-log voor bevoegdheidswijzigingen
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bevoegdheid_audit_log (
  id              serial PRIMARY KEY,
  gebruiker_id    integer NOT NULL REFERENCES gebruikers(id) ON DELETE CASCADE,
  module_id       text,
  oud_niveau      integer,
  nieuw_niveau    integer,
  actie           text    NOT NULL,
  reden           text,
  actor_id        integer REFERENCES gebruikers(id) ON DELETE SET NULL,
  actor_naam      text,
  tijdstip        timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bal_gebruiker_idx ON bevoegdheid_audit_log (gebruiker_id);
CREATE INDEX IF NOT EXISTS bal_tijdstip_idx  ON bevoegdheid_audit_log (tijdstip DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8b. Append-only DB-borging: UPDATE en DELETE op de audit-log worden geweigerd
--     door een trigger. Alleen INSERT is toegestaan. Dit borgt de append-only
--     semantiek op databaseniveau, onafhankelijk van de applicatielaag.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION bevoegdheid_audit_log_append_only()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'bevoegdheid_audit_log is append-only: % is niet toegestaan', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bal_geen_update ON bevoegdheid_audit_log;
CREATE TRIGGER bal_geen_update
  BEFORE UPDATE ON bevoegdheid_audit_log
  FOR EACH ROW EXECUTE FUNCTION bevoegdheid_audit_log_append_only();

DROP TRIGGER IF EXISTS bal_geen_delete ON bevoegdheid_audit_log;
CREATE TRIGGER bal_geen_delete
  BEFORE DELETE ON bevoegdheid_audit_log
  FOR EACH ROW EXECUTE FUNCTION bevoegdheid_audit_log_append_only();

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Backfill: bestaande opgeslagen bevoegdheden vastleggen als expliciete
--    afwijkingen t.o.v. de functie-baseline (medewerker.functie_id + ALLE
--    medewerker_aanstellingen; max-per-module).
--
--    Implementatie (vermijdt dubbele jsonb_object_keys SRF):
--      - baseline per gebruiker/module = MAX niveau over alle actieve functies
--        (via profiel), verkregen met jsonb_each_text in een LATERAL join;
--      - stored per gebruiker/module = jsonb_each_text over gebruikers.bevoegdheden;
--      - FULL OUTER JOIN op (gebruiker, module) levert de union van keys;
--      - afwijking opslaan als stored != baseline (ontbrekende zijde telt als 0,
--        zodat een expliciete downward 0 óók behouden blijft);
--      - ON CONFLICT DO NOTHING (idempotent).
-- ─────────────────────────────────────────────────────────────────────────────
WITH stored AS (
  -- Per gebruiker/module de opgeslagen (legacy) rechten.
  SELECT u.id AS gebruiker_id,
         kv.key AS module_id,
         kv.value::integer AS niveau
  FROM gebruikers u
  CROSS JOIN LATERAL jsonb_each_text(u.bevoegdheden) AS kv(key, value)
  WHERE u.bevoegdheden IS NOT NULL
    AND u.bevoegdheden::text NOT IN ('{}', 'null')
),
functiebronnen AS (
  -- Alle actieve functies (via profiel) per gebruiker: uit medewerker.functie_id
  -- én uit alle aanstellingen. UNION dedupliceert dubbele functie-koppelingen.
  SELECT med.gebruiker_id, f.profiel_id
  FROM medewerkers med
  JOIN functies f ON f.id = med.functie_id
   AND f.actief = true AND f.profiel_id IS NOT NULL
  WHERE med.gebruiker_id IS NOT NULL

  UNION

  SELECT med.gebruiker_id, f.profiel_id
  FROM medewerkers med
  JOIN medewerker_aanstellingen ma ON ma.medewerker_id = med.id AND ma.functie_id IS NOT NULL
  JOIN functies f ON f.id = ma.functie_id
   AND f.actief = true AND f.profiel_id IS NOT NULL
  WHERE med.gebruiker_id IS NOT NULL
),
baseline AS (
  -- Per gebruiker/module het MAX niveau over alle gekoppelde profielen.
  SELECT fb.gebruiker_id,
         kv.key AS module_id,
         MAX(kv.value::integer) AS niveau
  FROM functiebronnen fb
  JOIN profielen pr ON pr.id = fb.profiel_id
   AND pr.bevoegdheden IS NOT NULL
   AND pr.bevoegdheden::text NOT IN ('{}', 'null')
  CROSS JOIN LATERAL jsonb_each_text(pr.bevoegdheden) AS kv(key, value)
  GROUP BY fb.gebruiker_id, kv.key
),
verschil AS (
  -- Union van (gebruiker, module) over stored en baseline; ontbrekende zijde = 0.
  SELECT
    COALESCE(s.gebruiker_id, b.gebruiker_id) AS gebruiker_id,
    COALESCE(s.module_id,    b.module_id)    AS module_id,
    COALESCE(s.niveau, 0)                    AS stored_niveau,
    COALESCE(b.niveau, 0)                    AS baseline_niveau
  FROM stored s
  FULL OUTER JOIN baseline b
    ON s.gebruiker_id = b.gebruiker_id AND s.module_id = b.module_id
  -- Alleen gebruikers met een opgeslagen matrix backfillen; puur baseline-only
  -- modules zijn geen afwijking en horen niet in de tabel.
  WHERE s.gebruiker_id IS NOT NULL
)
, ingevoegd AS (
  INSERT INTO gebruiker_bevoegdheid_afwijkingen
    (gebruiker_id, module_id, niveau, reden, actor_naam, aangemaakt_op)
  SELECT gebruiker_id, module_id, stored_niveau,
         'Backfill GEBRUIKERS_01 v2: bestaand recht behouden',
         'Systeem (GEBRUIKERS_01 v2 backfill)', NOW()
  FROM verschil
  WHERE stored_niveau <> baseline_niveau
  ON CONFLICT (gebruiker_id, module_id) DO NOTHING
  RETURNING gebruiker_id, module_id, niveau
)
INSERT INTO bevoegdheid_audit_log
  (gebruiker_id, module_id, oud_niveau, nieuw_niveau, actie, reden, actor_naam, tijdstip)
SELECT v.gebruiker_id, v.module_id, v.baseline_niveau, v.stored_niveau,
       'afwijking_gezet',
       'Backfill GEBRUIKERS_01 v2: bestaand recht behouden',
       'Systeem (GEBRUIKERS_01 v2 backfill)', NOW()
FROM verschil v
JOIN ingevoegd i
  ON i.gebruiker_id = v.gebruiker_id AND i.module_id = v.module_id;
