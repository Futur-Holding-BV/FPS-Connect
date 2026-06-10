-- V1.2 — Migratie testrapporten -> centrale documenten-tabel.
-- Idempotent (NOT EXISTS-guards): meermaals draaien is veilig.
-- Dev-DB heeft momenteel 0 testrapporten; deze migratie is daar een no-op.
-- Voor productie: draaien via de database-skill (environment: production) bij uitrol.

-- 1) Testrapporten worden documenttype 'testrapport'. legacy_testrapport_id in ai_metadata
--    voor traceerbaarheid en idempotentie.
INSERT INTO documenten (naam, documenttype, fabrikant, en_norm, rapportnummer, pdf_url, status, gearchiveerd, aangemaakt_op, bijgewerkt_op, ai_metadata)
SELECT t.naam, 'testrapport', t.fabrikant, t.norm, t.rapportnummer, t.pdf_url,
       'actueel', t.gearchiveerd, t.aangemaakt_op, t.bijgewerkt_op,
       jsonb_build_object('legacy_testrapport_id', t.id)
FROM testrapporten t
WHERE NOT EXISTS (
  SELECT 1 FROM documenten d
  WHERE d.documenttype = 'testrapport'
    AND d.ai_metadata ->> 'legacy_testrapport_id' = t.id::text
);

-- 2) Bestaande labels.testrapport_id wordt een document_toepassingen-koppeling.
INSERT INTO document_toepassingen (document_id, label_id)
SELECT d.id, l.id
FROM labels l
JOIN documenten d
  ON d.documenttype = 'testrapport'
 AND d.ai_metadata ->> 'legacy_testrapport_id' = l.testrapport_id::text
WHERE l.testrapport_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM document_toepassingen dt
    WHERE dt.document_id = d.id AND dt.label_id = l.id
  );
