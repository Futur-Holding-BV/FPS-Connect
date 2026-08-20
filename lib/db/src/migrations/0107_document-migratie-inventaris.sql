-- TAAK_1167 — Document-migratie-inventaris (dry-run / classificatie)
-- Doel: alle bestaande documenten zonder verlies inventariseren en
--       onderscheiden als productrapport, gerichte_bestemming of herstelwerk.
--
-- Regels:
--   • Geen enkel bestaand document, koppeling, hash, revisie of objectpad wordt gewijzigd.
--   • INSERT ... ON CONFLICT DO NOTHING  →  volledig idempotent; veilig opnieuw uitvoeren.
--   • Classificatielogica (zie hieronder) leest uitsluitend; schrijft alleen naar de
--     nieuwe inventaristabel.
--
-- Classificatielogica
-- ───────────────────
-- PRODUCTRAPPORT:
--   documenttype IN (eta, classificatierapport, testrapport, productcertificaat,
--                    dop, verwerkingsvoorschrift, productblad)
--   AND gearchiveerd = false
--   AND status <> 'vervangen'
--   AND status <> 'ingetrokken'
--   AND EXISTS (
--     document_toepassingen → labels (gearchiveerd=false)
--                           → label_applicaties
--                           → voorziening_types (actief=true)
--   )
--
-- GERICHTE_BESTEMMING:
--   Precies één document_koppelingen-rij  OR  is logo_document_id/briefpapier_document_id
--   bij een werkgever (maar geen productrapport).
--
-- HERSTELWERK:  alle overige/ambigue documenten.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tabel aanmaken (IF NOT EXISTS → idempotent)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document_migratie_inventaris (
  id                    serial       PRIMARY KEY,
  document_id           integer      NOT NULL UNIQUE
                                       REFERENCES documenten(id) ON DELETE CASCADE,
  -- Snapshot-kolommen (bevroren op moment van eerste INSERT)
  snap_pdf_url          text,
  snap_bestands_hash    text,
  snap_groep_id         text         NOT NULL,
  snap_revisie_nummer   integer      NOT NULL,
  snap_documenttype     text         NOT NULL,
  -- Classificatie
  classificatie         text         NOT NULL
                                       CHECK (classificatie IN
                                         ('productrapport','gerichte_bestemming','herstelwerk')),
  voorgestelde_bestemming text,
  -- Workflow-status
  status                text         NOT NULL DEFAULT 'voorstel'
                                       CHECK (status IN
                                         ('voorstel','herstelwerk','bevestigd','gemigreerd')),
  aangemaakt_op         timestamp    NOT NULL DEFAULT now(),
  bijgewerkt_op         timestamp    NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Indexes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS dmi_classificatie_idx
  ON document_migratie_inventaris (classificatie);

CREATE INDEX IF NOT EXISTS dmi_status_idx
  ON document_migratie_inventaris (status);

CREATE INDEX IF NOT EXISTS dmi_documenttype_idx
  ON document_migratie_inventaris (snap_documenttype);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Idempotente vulling via INSERT ... ON CONFLICT DO NOTHING
--    Bestaande rijen worden nooit overschreven (snapshot = moment van eerste run).
-- ─────────────────────────────────────────────────────────────────────────────

-- Stap 3a: CTE — productrapporten (strikte allowlist + actieve keten)
WITH productrapporten AS (
  SELECT DISTINCT d.id AS document_id
  FROM   documenten d
  WHERE  d.documenttype IN (
           'eta','classificatierapport','testrapport','productcertificaat',
           'dop','verwerkingsvoorschrift','productblad'
         )
    AND  d.gearchiveerd = false
    AND  d.status NOT IN ('vervangen','ingetrokken')
    AND  EXISTS (
           SELECT 1
           FROM   document_toepassingen dt
           JOIN   labels          l  ON l.id  = dt.label_id
           JOIN   label_applicaties la ON la.label_id = l.id
           JOIN   voorziening_types vt ON vt.code = la.type_code
           WHERE  dt.document_id = d.id
             AND  l.gearchiveerd  = false
             AND  vt.actief       = true
         )
),

-- Stap 3b: CTE — gerichte bestemmingen
-- (precies één koppeling ÓÓROF als werkgever-logo/briefpapier gebruikt, maar géén productrapport)
gerichte_bestemmingen AS (
  SELECT d.id AS document_id
  FROM   documenten d
  WHERE  d.id NOT IN (SELECT document_id FROM productrapporten)
    AND  (
           -- precies één document_koppelingen-rij
           (SELECT count(*) FROM document_koppelingen dk WHERE dk.document_id = d.id) = 1
           OR
           -- is logo of briefpapier van minstens één werkgever
           EXISTS (
             SELECT 1 FROM werkgevers w
             WHERE  w.logo_document_id = d.id
                OR  w.briefpapier_document_id = d.id
           )
         )
    -- niet meteen ambigue door ÓÓROF beide kanten (koppeling + werkgever)
    AND  NOT (
           (SELECT count(*) FROM document_koppelingen dk WHERE dk.document_id = d.id) >= 1
           AND
           EXISTS (
             SELECT 1 FROM werkgevers w
             WHERE  w.logo_document_id = d.id
                OR  w.briefpapier_document_id = d.id
           )
           AND
           (SELECT count(*) FROM document_koppelingen dk WHERE dk.document_id = d.id) > 1
         )
)

INSERT INTO document_migratie_inventaris
  (document_id, snap_pdf_url, snap_bestands_hash, snap_groep_id,
   snap_revisie_nummer, snap_documenttype, classificatie,
   voorgestelde_bestemming, status)
SELECT
  d.id,
  d.pdf_url,
  d.bestands_hash,
  d.groep_id,
  d.revisie_nummer,
  d.documenttype,
  CASE
    WHEN pr.document_id IS NOT NULL THEN 'productrapport'
    WHEN gb.document_id IS NOT NULL THEN 'gerichte_bestemming'
    ELSE                                 'herstelwerk'
  END                                      AS classificatie,
  NULL                                     AS voorgestelde_bestemming,
  'voorstel'                               AS status
FROM   documenten d
LEFT JOIN productrapporten      pr ON pr.document_id = d.id
LEFT JOIN gerichte_bestemmingen gb ON gb.document_id = d.id
ON CONFLICT (document_id) DO NOTHING;
