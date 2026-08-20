-- LOON_02A — Loonfundament: database- en permissielaag.
--
-- Voegt toe:
--   1. cao_catalogus — centrale CAO-catalogus
--   2. werkgevers — nieuwe kolommen (cao_id FK, loonheffingennummer, sectorcode,
--      risicogroep, aangiftetijdvak, eigenrisicodrager_wga/zw,
--      loonkostenvoordeel_instelling)
--   3. medewerker_aanstellingen — nieuwe kolom cao_id FK
--   4. Backfill werkgevers.cao_id + medewerker_aanstellingen.cao_id
--      met migratiebevindingen voor onbekende waarden
--   5. NOT NULL op werkgevers.cao_id en medewerker_aanstellingen.cao_id na backfill
--   6. loon_migratiebevindingen — audit-log van datakwaliteitsbevindingen
--   7. loon_inkomstenverhoudingen — IKV per medewerker/werkgever/aanstelling
--   8. loon_afspraken — bruto loonafspraken per IKV per ingangsdatum
--   9. loon_jaarsets — bundels belastingparameters per jaar
--  10. loon_jaarbronnen — bronbestanden per jaarset
--  11. loon_jaarparameters — parameters per jaarset per sleutel
--  12. loon_staten — loonstaatstatus per IKV per jaar
--  13. loon_staat_tijdvakregels — berekende tijdvakregels per loonstaat
--  14. Trigger: inkomstenverhouding aanstelling-eigenaarcheck
--  15. Permissies: Externe boekhouder krijgt loonfundament:4
--
-- Migratie is additief en zoveel mogelijk idempotent (IF NOT EXISTS / ON CONFLICT).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. CAO-catalogus
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cao_catalogus (
  id            serial PRIMARY KEY,
  code          text    NOT NULL UNIQUE,
  naam          text    NOT NULL,
  omschrijving  text,
  actief        boolean NOT NULL DEFAULT true,
  aangemaakt_op timestamp NOT NULL DEFAULT now(),
  bijgewerkt_op timestamp NOT NULL DEFAULT now()
);

-- Seed: exacte verplichte CAO-entries.
INSERT INTO cao_catalogus (code, naam, omschrijving) VALUES
  ('MT',       'Metaal & Techniek',   'CAO Metaal & Techniek'),
  ('BI',       'Bouw & Infra',        'CAO Bouw & Infra'),
  ('ONBEKEND', 'Onbekend (migratie)', 'Tijdelijke migratiewaarde — beheerder dient dit te corrigeren')
ON CONFLICT (code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. werkgevers — nieuwe kolommen (nullable; NOT NULL na backfill)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE werkgevers
  ADD COLUMN IF NOT EXISTS cao_id                      integer REFERENCES cao_catalogus(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS loonheffingennummer         text,
  ADD COLUMN IF NOT EXISTS sectorcode                  text,
  ADD COLUMN IF NOT EXISTS risicogroep                 text,
  ADD COLUMN IF NOT EXISTS aangiftetijdvak             text,
  ADD COLUMN IF NOT EXISTS eigenrisicodrager_wga       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS eigenrisicodrager_zw        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS loonkostenvoordeel_instelling boolean NOT NULL DEFAULT false;

ALTER TABLE werkgevers
  ADD CONSTRAINT werkgevers_loonheffingennummer_formaat
    CHECK (loonheffingennummer IS NULL OR loonheffingennummer ~ '^[0-9]{9}L[0-9]{2}$'),
  ADD CONSTRAINT werkgevers_sectorcode_formaat
    CHECK (sectorcode IS NULL OR sectorcode ~ '^[0-9]{2}$'),
  ADD CONSTRAINT werkgevers_risicogroep_formaat
    CHECK (risicogroep IS NULL OR risicogroep ~ '^[0-9]{1,2}$'),
  ADD CONSTRAINT werkgevers_aangiftetijdvak_check
    CHECK (aangiftetijdvak IS NULL OR aangiftetijdvak IN ('maand', 'vier_weken'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. medewerker_aanstellingen — nieuwe kolom cao_id (nullable; NOT NULL na backfill)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE medewerker_aanstellingen
  ADD COLUMN IF NOT EXISTS cao_id integer REFERENCES cao_catalogus(id) ON DELETE RESTRICT;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. loon_migratiebevindingen — EERST aanmaken zodat we bevindingen kunnen
--    invoegen tijdens de backfill hieronder.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loon_migratiebevindingen (
  id                    serial PRIMARY KEY,
  entiteit_type         text      NOT NULL,
  entiteit_id           integer   NOT NULL,
  veld                  text      NOT NULL,
  oorspronkelijke_waarde text,
  reden                 text      NOT NULL,
  opgelost_op           timestamp,
  aangemaakt_op         timestamp NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4a. Backfill werkgevers.cao_id
--
-- Exacte naam-mapping (case-insensitive):
--   'Metaal & Techniek'  → MT
--   'Bouw & Infra'       → BI
--   overige              → ONBEKEND + bevinding
--
-- Vervolgens: drie bindende werkgever-namen forceren (legacy-tekst meelopen):
--   FPS Bouw + FPS Brandpreventie       → MT  (cao tekst 'Metaal & Techniek')
--   FPS Bouw en Renovatie               → BI  (cao tekst 'Bouw & Infra')
-- ─────────────────────────────────────────────────────────────────────────────

-- Stap A: exacte tekst-mapping.
UPDATE werkgevers
SET cao_id = (SELECT id FROM cao_catalogus WHERE code = 'MT')
WHERE cao_id IS NULL
  AND LOWER(TRIM(cao)) = 'metaal & techniek';

UPDATE werkgevers
SET cao_id = (SELECT id FROM cao_catalogus WHERE code = 'BI')
WHERE cao_id IS NULL
  AND LOWER(TRIM(cao)) = 'bouw & infra';

-- Stap B: onbekende waarden → ONBEKEND + bevinding.
INSERT INTO loon_migratiebevindingen (entiteit_type, entiteit_id, veld, oorspronkelijke_waarde, reden)
SELECT
  'werkgever',
  id,
  'cao',
  cao,
  'CAO-tekst kon niet automatisch worden gemapt op een CAO-catalogusentry; werkgever tijdelijk ingesteld op ONBEKEND'
FROM werkgevers
WHERE cao_id IS NULL;

UPDATE werkgevers
SET cao_id = (SELECT id FROM cao_catalogus WHERE code = 'ONBEKEND')
WHERE cao_id IS NULL;

-- Stap C: bindende naam-mapping voor de drie FPS-werkmaatschappijen.
--   FPS Bouw              → MT
--   FPS Brandpreventie    → MT
--   FPS Bouw en Renovatie → BI
-- Cao-tekstveld wordt gesynchroniseerd als legacy-cache.
INSERT INTO loon_migratiebevindingen (entiteit_type, entiteit_id, veld, oorspronkelijke_waarde, reden)
SELECT
  'werkgever',
  w.id,
  'cao',
  w.cao,
  'Historische CAO week af van de bindende werkmaatschappij-indeling; gekoppeld aan Metaal & Techniek'
FROM werkgevers w
JOIN cao_catalogus c ON c.id = w.cao_id
WHERE w.naam IN ('FPS Bouw', 'FPS Brandpreventie')
  AND c.code <> 'MT';

INSERT INTO loon_migratiebevindingen (entiteit_type, entiteit_id, veld, oorspronkelijke_waarde, reden)
SELECT
  'werkgever',
  w.id,
  'cao',
  w.cao,
  'Historische CAO week af van de bindende werkmaatschappij-indeling; gekoppeld aan Bouw & Infra'
FROM werkgevers w
JOIN cao_catalogus c ON c.id = w.cao_id
WHERE w.naam = 'FPS Bouw en Renovatie'
  AND c.code <> 'BI';

UPDATE werkgevers
SET cao_id = (SELECT id FROM cao_catalogus WHERE code = 'MT'),
    cao    = 'Metaal & Techniek'
WHERE naam IN ('FPS Bouw', 'FPS Brandpreventie');

UPDATE werkgevers
SET cao_id = (SELECT id FROM cao_catalogus WHERE code = 'BI'),
    cao    = 'Bouw & Infra'
WHERE naam = 'FPS Bouw en Renovatie';

-- Stap D: cao_id NOT NULL afdwingen.
ALTER TABLE werkgevers ALTER COLUMN cao_id SET NOT NULL;

-- Nieuwe en bestaande aanmaakpaden blijven veilig: de catalogus-FK wordt bij
-- ontbrekende invoer afgeleid en de legacytekst loopt als weergavecache mee.
-- Voor de drie bindende namen wint de voorgeschreven indeling altijd.
CREATE OR REPLACE FUNCTION loon_werkgever_cao_sync()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_cao_naam text;
BEGIN
  IF NEW.naam IN ('FPS Bouw', 'FPS Brandpreventie') THEN
    SELECT id INTO NEW.cao_id FROM cao_catalogus WHERE code = 'MT';
  ELSIF NEW.naam = 'FPS Bouw en Renovatie' THEN
    SELECT id INTO NEW.cao_id FROM cao_catalogus WHERE code = 'BI';
  ELSIF NEW.cao_id IS NULL THEN
    SELECT id INTO NEW.cao_id
      FROM cao_catalogus
     WHERE (code = 'MT' AND LOWER(TRIM(NEW.cao)) = 'metaal & techniek')
        OR (code = 'BI' AND LOWER(TRIM(NEW.cao)) = 'bouw & infra')
     ORDER BY code
     LIMIT 1;
    IF NEW.cao_id IS NULL THEN
      SELECT id INTO NEW.cao_id FROM cao_catalogus WHERE code = 'ONBEKEND';
    END IF;
  END IF;

  SELECT naam INTO v_cao_naam FROM cao_catalogus WHERE id = NEW.cao_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CAO-catalogusrecord % bestaat niet', NEW.cao_id;
  END IF;
  NEW.cao := v_cao_naam;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS loon_werkgever_cao_sync_trigger ON werkgevers;
CREATE TRIGGER loon_werkgever_cao_sync_trigger
  BEFORE INSERT OR UPDATE OF naam, cao, cao_id ON werkgevers
  FOR EACH ROW EXECUTE FUNCTION loon_werkgever_cao_sync();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4b. Backfill medewerker_aanstellingen.cao_id
--
-- Volgorde van prioriteit per aanstelling:
--   1. Eigen cao-tekstveld → exacte mapping (MT / BI)
--   2. werkgever_id → overnemen van werkgevers.cao_id
--   3. werkmaatschappij-naam → exacte naam-match op werkgevers.naam
--   4. ONBEKEND + bevinding
-- ─────────────────────────────────────────────────────────────────────────────

-- Prio 1: eigen cao-tekst exact MT.
UPDATE medewerker_aanstellingen
SET cao_id = (SELECT id FROM cao_catalogus WHERE code = 'MT')
WHERE cao_id IS NULL
  AND LOWER(TRIM(cao)) = 'metaal & techniek';

-- Prio 1: eigen cao-tekst exact BI.
UPDATE medewerker_aanstellingen
SET cao_id = (SELECT id FROM cao_catalogus WHERE code = 'BI')
WHERE cao_id IS NULL
  AND LOWER(TRIM(cao)) = 'bouw & infra';

-- Prio 2: overnemen van werkgever.cao_id via werkgever_id.
UPDATE medewerker_aanstellingen a
SET cao_id = w.cao_id
FROM werkgevers w
WHERE a.cao_id IS NULL
  AND a.werkgever_id IS NOT NULL
  AND a.werkgever_id = w.id;

-- Prio 3: werkmaatschappij-naam matchen op werkgevers.naam.
UPDATE medewerker_aanstellingen a
SET cao_id = w.cao_id
FROM werkgevers w
WHERE a.cao_id IS NULL
  AND LOWER(TRIM(a.werkmaatschappij)) = LOWER(TRIM(w.naam));

-- Bindende werkmaatschappij-indeling gaat vóór historische vrije tekst.
INSERT INTO loon_migratiebevindingen (entiteit_type, entiteit_id, veld, oorspronkelijke_waarde, reden)
SELECT
  'aanstelling',
  a.id,
  'cao',
  a.cao,
  'Historische CAO week af van de bindende werkmaatschappij-indeling; gekoppeld aan de CAO van de werkgever'
FROM medewerker_aanstellingen a
JOIN werkgevers w
  ON a.werkgever_id = w.id
  OR (a.werkgever_id IS NULL AND LOWER(TRIM(a.werkmaatschappij)) = LOWER(TRIM(w.naam)))
JOIN cao_catalogus bestaand ON bestaand.id = a.cao_id
WHERE w.naam IN ('FPS Bouw', 'FPS Brandpreventie', 'FPS Bouw en Renovatie')
  AND bestaand.id <> w.cao_id;

UPDATE medewerker_aanstellingen a
SET cao_id = w.cao_id
FROM werkgevers w
WHERE w.naam IN ('FPS Bouw', 'FPS Brandpreventie', 'FPS Bouw en Renovatie')
  AND (
    a.werkgever_id = w.id
    OR (a.werkgever_id IS NULL AND LOWER(TRIM(a.werkmaatschappij)) = LOWER(TRIM(w.naam)))
  );

-- Prio 4: onbekend + bevinding.
INSERT INTO loon_migratiebevindingen (entiteit_type, entiteit_id, veld, oorspronkelijke_waarde, reden)
SELECT
  'aanstelling',
  id,
  'cao',
  cao,
  'CAO-tekst kon niet worden gemapt; aanstelling tijdelijk ingesteld op ONBEKEND'
FROM medewerker_aanstellingen
WHERE cao_id IS NULL;

UPDATE medewerker_aanstellingen
SET cao_id = (SELECT id FROM cao_catalogus WHERE code = 'ONBEKEND')
WHERE cao_id IS NULL;

-- cao_id NOT NULL afdwingen.
ALTER TABLE medewerker_aanstellingen ALTER COLUMN cao_id SET NOT NULL;

CREATE OR REPLACE FUNCTION loon_aanstelling_cao_sync()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_cao_naam text;
BEGIN
  IF NEW.werkmaatschappij IN ('FPS Bouw', 'FPS Brandpreventie') THEN
    SELECT id INTO NEW.cao_id FROM cao_catalogus WHERE code = 'MT';
  ELSIF NEW.werkmaatschappij = 'FPS Bouw en Renovatie' THEN
    SELECT id INTO NEW.cao_id FROM cao_catalogus WHERE code = 'BI';
  ELSIF NEW.cao_id IS NULL THEN
    SELECT id INTO NEW.cao_id
      FROM cao_catalogus
     WHERE (code = 'MT' AND LOWER(TRIM(NEW.cao)) = 'metaal & techniek')
        OR (code = 'BI' AND LOWER(TRIM(NEW.cao)) = 'bouw & infra')
     ORDER BY code
     LIMIT 1;
    IF NEW.cao_id IS NULL AND NEW.werkgever_id IS NOT NULL THEN
      SELECT cao_id INTO NEW.cao_id FROM werkgevers WHERE id = NEW.werkgever_id;
    END IF;
    IF NEW.cao_id IS NULL THEN
      SELECT cao_id INTO NEW.cao_id
        FROM werkgevers
       WHERE LOWER(TRIM(naam)) = LOWER(TRIM(NEW.werkmaatschappij))
       LIMIT 1;
    END IF;
    IF NEW.cao_id IS NULL THEN
      SELECT id INTO NEW.cao_id FROM cao_catalogus WHERE code = 'ONBEKEND';
    END IF;
  END IF;

  SELECT naam INTO v_cao_naam FROM cao_catalogus WHERE id = NEW.cao_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CAO-catalogusrecord % bestaat niet', NEW.cao_id;
  END IF;
  NEW.cao := v_cao_naam;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS loon_aanstelling_cao_sync_trigger ON medewerker_aanstellingen;
CREATE TRIGGER loon_aanstelling_cao_sync_trigger
  BEFORE INSERT OR UPDATE OF werkmaatschappij, werkgever_id, cao, cao_id
  ON medewerker_aanstellingen
  FOR EACH ROW EXECUTE FUNCTION loon_aanstelling_cao_sync();

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. loon_inkomstenverhoudingen
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loon_inkomstenverhoudingen (
  id                            serial PRIMARY KEY,
  werkgever_id                  integer NOT NULL REFERENCES werkgevers(id) ON DELETE RESTRICT,
  medewerker_id                 integer NOT NULL REFERENCES medewerkers(id) ON DELETE RESTRICT,
  aanstelling_id                integer NOT NULL REFERENCES medewerker_aanstellingen(id) ON DELETE RESTRICT,
  volgnummer                    integer NOT NULL,
  datum_aanvang                 date    NOT NULL,
  datum_einde                   date,
  code_aard_arbeidsverhouding   text,
  contract_onbepaalde_tijd      boolean NOT NULL DEFAULT false,
  schriftelijke_arbeidsovereenkomst boolean NOT NULL DEFAULT true,
  oproepovereenkomst            boolean NOT NULL DEFAULT false,
  verzekerd_zw                  boolean NOT NULL DEFAULT true,
  verzekerd_ww                  boolean NOT NULL DEFAULT true,
  verzekerd_wia                 boolean NOT NULL DEFAULT true,
  code_invloed_verzekeringsplicht text,
  actief                        boolean NOT NULL DEFAULT true,
  aangemaakt_op                 timestamp NOT NULL DEFAULT now(),
  bijgewerkt_op                 timestamp NOT NULL DEFAULT now(),
  -- Positief volgnummer (Belastingdienst-eis).
  CONSTRAINT loon_ikv_volgnummer_positief CHECK (volgnummer > 0),
  -- Einde mag niet vóór aanvang liggen.
  CONSTRAINT loon_ikv_datum_volgorde CHECK (datum_einde IS NULL OR datum_einde >= datum_aanvang)
);

CREATE UNIQUE INDEX IF NOT EXISTS loon_ikv_werkgever_medewerker_volgnummer_uniek
  ON loon_inkomstenverhoudingen (werkgever_id, medewerker_id, volgnummer);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. loon_afspraken
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loon_afspraken (
  id                      serial PRIMARY KEY,
  inkomstenverhouding_id  integer NOT NULL REFERENCES loon_inkomstenverhoudingen(id) ON DELETE CASCADE,
  ingangsdatum            date    NOT NULL,
  loonsoort               text    NOT NULL DEFAULT 'maandloon',
  -- bedrag_cents >= 0; geen fiscale bedragen/grenzen.
  bedrag_cents            integer NOT NULL,
  schaal                  text,
  trede                   text,
  vaste_toeslagen         jsonb   NOT NULL DEFAULT '[]',
  loonheffingskorting     boolean NOT NULL DEFAULT false,
  -- tabelkeuze: wit | groen
  tabelkeuze              text    NOT NULL DEFAULT 'wit',
  anoniementarief         boolean NOT NULL DEFAULT false,
  vastgelegd_door_id      integer REFERENCES gebruikers(id) ON DELETE SET NULL,
  aangemaakt_op           timestamp NOT NULL DEFAULT now(),
  bijgewerkt_op           timestamp NOT NULL DEFAULT now(),
  CONSTRAINT loon_afspraken_bedrag_niet_negatief CHECK (bedrag_cents >= 0),
  CONSTRAINT loon_afspraken_loonsoort_check CHECK (loonsoort IN ('uurloon', 'maandloon', 'weekloon', 'stukloon', 'overig')),
  CONSTRAINT loon_afspraken_tabelkeuze_check CHECK (tabelkeuze IN ('wit', 'groen'))
);

CREATE UNIQUE INDEX IF NOT EXISTS loon_afspraken_ikv_ingangsdatum_uniek
  ON loon_afspraken (inkomstenverhouding_id, ingangsdatum);

-- Fiscale afspraakgeschiedenis is append-only. Een afspraak wordt nooit
-- herschreven of los verwijderd; een nieuwe ingangsdatum legt de wijziging
-- vast. Alleen een referentiële cascade bij het verwijderen van de volledige
-- inkomstenverhouding mag de onderliggende historie mee verwijderen.
CREATE OR REPLACE FUNCTION loon_afspraken_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION
    'Loonafspraken zijn append-only; leg een wijziging vast met een nieuwe ingangsdatum.';
END;
$$;

DROP TRIGGER IF EXISTS loon_afspraken_append_only_trigger ON loon_afspraken;
CREATE TRIGGER loon_afspraken_append_only_trigger
  BEFORE UPDATE OR DELETE ON loon_afspraken
  FOR EACH ROW EXECUTE FUNCTION loon_afspraken_append_only();

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. loon_jaarsets
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loon_jaarsets (
  id              serial PRIMARY KEY,
  jaar            integer NOT NULL,
  versie          integer NOT NULL DEFAULT 1,
  status          text    NOT NULL DEFAULT 'concept',
  volledig        boolean NOT NULL DEFAULT false,
  parameter_aantal integer NOT NULL DEFAULT 0,
  fouten          jsonb   NOT NULL DEFAULT '[]',
  geladen_door_id integer REFERENCES gebruikers(id) ON DELETE SET NULL,
  geladen_op      timestamp,
  vervangen_op    timestamp,
  aangemaakt_op   timestamp NOT NULL DEFAULT now(),
  bijgewerkt_op   timestamp NOT NULL DEFAULT now(),
  CONSTRAINT loon_jaarsets_status_check CHECK (
    status IN ('concept', 'volledig', 'onvolledig', 'bron_gewijzigd', 'vervangen')
  )
);

-- Partial unique: slechts één jaarset per jaar mag status = 'volledig' hebben.
CREATE UNIQUE INDEX IF NOT EXISTS loon_jaarsets_jaar_volledig_uniek
  ON loon_jaarsets (jaar)
  WHERE status = 'volledig';

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. loon_jaarbronnen
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loon_jaarbronnen (
  id                    serial PRIMARY KEY,
  jaarset_id            integer NOT NULL REFERENCES loon_jaarsets(id) ON DELETE CASCADE,
  bronsoort             text    NOT NULL,
  bron_url              text    NOT NULL,
  officiele_bestandsnaam text   NOT NULL,
  officiele_versie      text    NOT NULL,
  -- SHA-256 hex-digest: 64 hexadecimale tekens indien opgegeven.
  sha256                text    NOT NULL,
  mime_type             text    NOT NULL,
  bestandsgrootte       integer NOT NULL,
  vindplaats            text    NOT NULL,
  geladen_op            timestamp NOT NULL,
  aangemaakt_op         timestamp NOT NULL DEFAULT now(),
  CONSTRAINT loon_jaarbronnen_sha256_formaat CHECK (
    sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS loon_jaarbronnen_set_bronsoort_uniek
  ON loon_jaarbronnen (jaarset_id, bronsoort);

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. loon_jaarparameters
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loon_jaarparameters (
  id            serial PRIMARY KEY,
  jaarset_id    integer NOT NULL REFERENCES loon_jaarsets(id) ON DELETE CASCADE,
  sleutel       text    NOT NULL,
  datatype      text    NOT NULL DEFAULT 'decimal',
  waarde        jsonb,
  rekenstatus   text    NOT NULL DEFAULT 'niet_berekend',
  reden         text,
  bron_id       integer REFERENCES loon_jaarbronnen(id) ON DELETE SET NULL,
  -- vindplaats verplicht; ontbreekt die, dan niet_berekend (check hieronder).
  vindplaats    text,
  aangemaakt_op timestamp NOT NULL DEFAULT now(),
  bijgewerkt_op timestamp NOT NULL DEFAULT now(),
  CONSTRAINT loon_jaarparameters_rekenstatus_check CHECK (
    rekenstatus IN ('berekend', 'niet_berekend')
  ),
  -- Als bron_id of vindplaats ontbreekt, dan moet rekenstatus niet_berekend zijn.
  CONSTRAINT loon_jaarparameters_bron_vindplaats_check CHECK (
    (bron_id IS NOT NULL AND vindplaats <> '') OR rekenstatus = 'niet_berekend'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS loon_jaarparameters_set_sleutel_uniek
  ON loon_jaarparameters (jaarset_id, sleutel);

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. loon_staten
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loon_staten (
  id                      serial PRIMARY KEY,
  inkomstenverhouding_id  integer NOT NULL REFERENCES loon_inkomstenverhoudingen(id) ON DELETE CASCADE,
  kalenderjaar            integer NOT NULL,
  tijdvak                 text    NOT NULL DEFAULT 'maand',
  status                  text    NOT NULL DEFAULT 'concept',
  aangemaakt_op           timestamp NOT NULL DEFAULT now(),
  bijgewerkt_op           timestamp NOT NULL DEFAULT now(),
  CONSTRAINT loon_staten_tijdvak_check CHECK (tijdvak IN ('maand', 'vier_weken')),
  CONSTRAINT loon_staten_status_check  CHECK (status  IN ('concept', 'gesloten'))
);

CREATE UNIQUE INDEX IF NOT EXISTS loon_staten_ikv_jaar_uniek
  ON loon_staten (inkomstenverhouding_id, kalenderjaar);

-- ─────────────────────────────────────────────────────────────────────────────
-- 13. loon_staat_tijdvakregels
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loon_staat_tijdvakregels (
  id                serial PRIMARY KEY,
  loonstaat_id      integer NOT NULL REFERENCES loon_staten(id) ON DELETE CASCADE,
  -- Tijdvaknummer: positief; max 13 (vier-weken) of 12 (maand).
  tijdvaknummer     integer NOT NULL,
  periode_start     date    NOT NULL,
  periode_einde     date    NOT NULL,
  rekenstatus       text    NOT NULL DEFAULT 'niet_berekend',
  reden             text,
  vindplaats        text,
  -- Tijdvakwaarden en cumulatieven: geen fiscale bedragen hardcoded in TS/JS.
  tijdvak_waarden   jsonb   NOT NULL DEFAULT '{}',
  cumulatieven      jsonb   NOT NULL DEFAULT '{}',
  aangemaakt_op     timestamp NOT NULL DEFAULT now(),
  bijgewerkt_op     timestamp NOT NULL DEFAULT now(),
  CONSTRAINT loon_tijdvakregels_nummer_positief CHECK (tijdvaknummer > 0),
  CONSTRAINT loon_tijdvakregels_periode_volgorde CHECK (periode_einde >= periode_start),
  CONSTRAINT loon_tijdvakregels_rekenstatus_check CHECK (
    rekenstatus IN ('berekend', 'niet_berekend')
  ),
  -- Ontbrekende vindplaats impliceert niet_berekend.
  CONSTRAINT loon_tijdvakregels_vindplaats_rekenstatus CHECK (
    vindplaats IS NOT NULL OR rekenstatus = 'niet_berekend'
  ),
  -- LOON_02A bevat nog geen rekenkern: alleen lege, expliciet
  -- niet-berekende regels mogen worden vastgelegd. LOON_02B vervangt deze
  -- poort door server-side berekening.
  CONSTRAINT loon_tijdvakregels_02a_niet_berekend_check CHECK (
    rekenstatus = 'niet_berekend'
    AND tijdvak_waarden = '{}'::jsonb
    AND cumulatieven = '{}'::jsonb
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS loon_staat_tijdvakregels_staat_nummer_uniek
  ON loon_staat_tijdvakregels (loonstaat_id, tijdvaknummer);

-- Tijdvakgrenzen horen bij de fiscale loonstaat en mogen niet alleen door één
-- API-route worden bewaakt. Maanden volgen exact kalendermaanden; een
-- vierwekentijdvak telt maximaal 28 dagen (tijdvak 13 maximaal 35 dagen om
-- resterende kalenderdagen te kunnen dragen). Alle perioden blijven binnen
-- het kalenderjaar van de bovenliggende loonstaat.
CREATE OR REPLACE FUNCTION loon_tijdvakregel_valideer()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_tijdvak text;
  v_jaar integer;
  v_duur integer;
  v_maand_start date;
  v_maand_einde date;
BEGIN
  SELECT tijdvak, kalenderjaar
    INTO v_tijdvak, v_jaar
    FROM loon_staten
   WHERE id = NEW.loonstaat_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bovenliggende loonstaat % bestaat niet', NEW.loonstaat_id;
  END IF;

  IF EXTRACT(YEAR FROM NEW.periode_start)::integer <> v_jaar
     OR EXTRACT(YEAR FROM NEW.periode_einde)::integer <> v_jaar THEN
    RAISE EXCEPTION
      'Tijdvakperiode moet volledig binnen kalenderjaar % vallen', v_jaar;
  END IF;

  v_duur := NEW.periode_einde - NEW.periode_start + 1;
  IF v_tijdvak = 'maand' THEN
    IF NEW.tijdvaknummer > 12 THEN
      RAISE EXCEPTION 'Maandloonstaat ondersteunt maximaal 12 tijdvakken';
    END IF;
    v_maand_start := make_date(v_jaar, NEW.tijdvaknummer, 1);
    v_maand_einde := (v_maand_start + INTERVAL '1 month - 1 day')::date;
    IF NEW.periode_start <> v_maand_start OR NEW.periode_einde <> v_maand_einde THEN
      RAISE EXCEPTION
        'Maandtijdvak % moet exact lopen van % tot %',
        NEW.tijdvaknummer, v_maand_start, v_maand_einde;
    END IF;
  ELSIF v_tijdvak = 'vier_weken' THEN
    IF NEW.tijdvaknummer > 13 THEN
      RAISE EXCEPTION 'Vierwekenloonstaat ondersteunt maximaal 13 tijdvakken';
    END IF;
    IF v_duur > (CASE WHEN NEW.tijdvaknummer = 13 THEN 35 ELSE 28 END) THEN
      RAISE EXCEPTION
        'Vierwekentijdvak % bevat te veel kalenderdagen', NEW.tijdvaknummer;
    END IF;
  ELSE
    RAISE EXCEPTION 'Onbekend tijdvaktype %', v_tijdvak;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS loon_tijdvakregel_valideer_trigger
  ON loon_staat_tijdvakregels;
CREATE TRIGGER loon_tijdvakregel_valideer_trigger
  BEFORE INSERT OR UPDATE ON loon_staat_tijdvakregels
  FOR EACH ROW EXECUTE FUNCTION loon_tijdvakregel_valideer();

-- Een ouderrecord mag dezelfde invariant niet achteraf omzeilen. Zodra een
-- loonstaat tijdvakregels bevat, staan inkomstenverhouding, kalenderjaar en
-- tijdvaktype vast; alleen lifecyclevelden zoals status mogen nog wijzigen.
CREATE OR REPLACE FUNCTION loon_staat_grondslag_bescherm()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (
    NEW.inkomstenverhouding_id IS DISTINCT FROM OLD.inkomstenverhouding_id
    OR NEW.kalenderjaar IS DISTINCT FROM OLD.kalenderjaar
    OR NEW.tijdvak IS DISTINCT FROM OLD.tijdvak
  ) AND EXISTS (
    SELECT 1 FROM loon_staat_tijdvakregels WHERE loonstaat_id = OLD.id
  ) THEN
    RAISE EXCEPTION
      'Loonstaat % heeft tijdvakregels; inkomstenverhouding, kalenderjaar en tijdvaktype staan vast.',
      OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS loon_staat_grondslag_bescherm_trigger ON loon_staten;
CREATE TRIGGER loon_staat_grondslag_bescherm_trigger
  BEFORE UPDATE OF inkomstenverhouding_id, kalenderjaar, tijdvak ON loon_staten
  FOR EACH ROW EXECUTE FUNCTION loon_staat_grondslag_bescherm();

-- ─────────────────────────────────────────────────────────────────────────────
-- 14. Trigger: inkomstenverhouding aanstelling-eigenaarcheck
--
-- Bewaakt dat de aanstelling bij INSERT/UPDATE op loon_inkomstenverhoudingen
-- toebehoort aan dezelfde medewerker EN werkgever als de IKV zelf.
-- Fail-closed: bij twijfel weigeren.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION loon_ikv_aanstelling_eigenaarcheck()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_medewerker_id integer;
  v_werkgever_id  integer;
BEGIN
  -- Haal de medewerker_id en werkgever_id op die bij de aanstelling horen.
  SELECT medewerker_id, werkgever_id
    INTO v_medewerker_id, v_werkgever_id
    FROM medewerker_aanstellingen
   WHERE id = NEW.aanstelling_id;

  -- Aanstelling bestaat niet: weiger (fail-closed).
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Aanstelling % bestaat niet; inkomstenverhouding geweigerd (LOON_02A fail-closed).',
      NEW.aanstelling_id;
  END IF;

  -- Medewerker komt niet overeen.
  IF v_medewerker_id IS DISTINCT FROM NEW.medewerker_id THEN
    RAISE EXCEPTION
      'Aanstelling % hoort bij medewerker %, niet bij %; inkomstenverhouding geweigerd.',
      NEW.aanstelling_id, v_medewerker_id, NEW.medewerker_id;
  END IF;

  -- Werkgever ontbreekt of komt niet overeen: beide zijn fail-closed.
  IF v_werkgever_id IS NULL OR v_werkgever_id IS DISTINCT FROM NEW.werkgever_id THEN
    RAISE EXCEPTION
      'Aanstelling % hoort bij werkgever %, niet bij %; inkomstenverhouding geweigerd.',
      NEW.aanstelling_id, v_werkgever_id, NEW.werkgever_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS loon_ikv_aanstelling_eigenaarcheck_trigger
  ON loon_inkomstenverhoudingen;

CREATE TRIGGER loon_ikv_aanstelling_eigenaarcheck_trigger
  BEFORE INSERT OR UPDATE ON loon_inkomstenverhoudingen
  FOR EACH ROW EXECUTE FUNCTION loon_ikv_aanstelling_eigenaarcheck();

-- Dezelfde invariant geldt in de andere richting. Een bestaande aanstelling
-- mag niet naar een andere medewerker/werkgever worden verplaatst zodra een
-- IKV eraan gekoppeld is.
CREATE OR REPLACE FUNCTION loon_aanstelling_ikv_eigenaarcheck()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM loon_inkomstenverhoudingen ikv
     WHERE ikv.aanstelling_id = NEW.id
       AND (
         ikv.medewerker_id IS DISTINCT FROM NEW.medewerker_id
         OR NEW.werkgever_id IS NULL
         OR ikv.werkgever_id IS DISTINCT FROM NEW.werkgever_id
       )
  ) THEN
    RAISE EXCEPTION
      'Aanstelling % heeft een inkomstenverhouding en kan niet naar een andere medewerker of werkgever worden verplaatst.',
      NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS loon_aanstelling_ikv_eigenaarcheck_trigger
  ON medewerker_aanstellingen;
CREATE TRIGGER loon_aanstelling_ikv_eigenaarcheck_trigger
  BEFORE UPDATE OF medewerker_id, werkgever_id ON medewerker_aanstellingen
  FOR EACH ROW EXECUTE FUNCTION loon_aanstelling_ikv_eigenaarcheck();

-- ─────────────────────────────────────────────────────────────────────────────
-- 15. Permissies: Externe boekhouder krijgt loonfundament:4
--
-- Patroon conform migratie 0074 (RECHTEN_BOEKHOUDER_01):
--  - Systeemprofiel bijwerken
--  - Afgeleide gebruikers bijwerken (herkomst_profiel_id)
-- Gebruik GREATEST om handmatig hogere rechten nooit te verlagen (idempotent).
-- Uitsluitend het profiel 'Externe boekhouder' krijgt dit recht.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE profielen
SET bevoegdheden = jsonb_set(
      bevoegdheden,
      '{loonfundament}',
      to_jsonb(GREATEST(COALESCE((bevoegdheden->>'loonfundament')::int, 0), 4))
    )
WHERE naam = 'Externe boekhouder' AND systeem = true;

UPDATE gebruikers
SET bevoegdheden = jsonb_set(
      bevoegdheden,
      '{loonfundament}',
      to_jsonb(GREATEST(COALESCE((bevoegdheden->>'loonfundament')::int, 0), 4))
    )
WHERE herkomst_profiel_id IN (
  SELECT id FROM profielen WHERE naam = 'Externe boekhouder' AND systeem = true
);
