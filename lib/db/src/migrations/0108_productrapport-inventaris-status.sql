-- Productrapportinventaris exact gelijkzetten met de openbare bibliotheekpoort.
-- 0107 is al uitvoerbaar/immutabel; deze additieve opvolger corrigeert uitsluitend
-- de inventarisclassificatie en raakt geen document, koppeling of object aan.

WITH geldige_productrapporten AS (
  SELECT DISTINCT d.id AS document_id
  FROM documenten d
  WHERE d.documenttype IN (
    'eta',
    'classificatierapport',
    'testrapport',
    'productcertificaat',
    'dop',
    'verwerkingsvoorschrift',
    'productblad'
  )
    AND d.gearchiveerd = false
    AND d.status = 'actueel'
    AND EXISTS (
      SELECT 1
      FROM document_toepassingen dt
      JOIN labels l ON l.id = dt.label_id
      JOIN label_applicaties la ON la.label_id = l.id
      JOIN voorziening_types vt ON vt.code = la.type_code
      WHERE dt.document_id = d.id
        AND l.gearchiveerd = false
        AND vt.actief = true
    )
),
gerichte_bestemmingen AS (
  SELECT d.id AS document_id
  FROM documenten d
  WHERE d.id NOT IN (SELECT document_id FROM geldige_productrapporten)
    AND (
      (SELECT count(*) FROM document_koppelingen dk WHERE dk.document_id = d.id) = 1
      OR EXISTS (
        SELECT 1
        FROM werkgevers w
        WHERE w.logo_document_id = d.id OR w.briefpapier_document_id = d.id
      )
    )
    AND NOT (
      (SELECT count(*) FROM document_koppelingen dk WHERE dk.document_id = d.id) >= 1
      AND EXISTS (
        SELECT 1
        FROM werkgevers w
        WHERE w.logo_document_id = d.id OR w.briefpapier_document_id = d.id
      )
      AND (SELECT count(*) FROM document_koppelingen dk WHERE dk.document_id = d.id) > 1
    )
),
nieuwe_classificatie AS (
  SELECT
    i.document_id,
    CASE
      WHEN gp.document_id IS NOT NULL THEN 'productrapport'
      WHEN gb.document_id IS NOT NULL THEN 'gerichte_bestemming'
      ELSE 'herstelwerk'
    END AS classificatie
  FROM document_migratie_inventaris i
  LEFT JOIN geldige_productrapporten gp ON gp.document_id = i.document_id
  LEFT JOIN gerichte_bestemmingen gb ON gb.document_id = i.document_id
)
UPDATE document_migratie_inventaris i
SET
  classificatie = nc.classificatie,
  status = CASE
    WHEN nc.classificatie = 'herstelwerk' THEN 'herstelwerk'
    ELSE i.status
  END,
  bijgewerkt_op = now()
FROM nieuwe_classificatie nc
WHERE nc.document_id = i.document_id
  AND (
    i.classificatie IS DISTINCT FROM nc.classificatie
    OR (nc.classificatie = 'herstelwerk' AND i.status = 'voorstel')
  );