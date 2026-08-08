-- WVB_01 review-hardening: dedup van open compliance-signalen database-
-- afgedwongen. Select-then-insert kan bij gelijktijdig vaststellen twee open
-- signalen met dezelfde dedup-sleutel opleveren; een partiële unieke index
-- maakt dat onmogelijk. Eerst bestaande duplicaten opruimen (oudste winnaar
-- blijft open, jongere duplicaten worden opgelost gemarkeerd).

UPDATE compliance_signalen cs
SET status = 'opgelost', opgelost_op = now(), bijgewerkt_op = now()
WHERE cs.status = 'open'
  AND EXISTS (
    SELECT 1 FROM compliance_signalen ouder
    WHERE ouder.dedup_sleutel = cs.dedup_sleutel
      AND ouder.status = 'open'
      AND ouder.id < cs.id
  );

CREATE UNIQUE INDEX IF NOT EXISTS compliance_signalen_open_dedup_uq
  ON compliance_signalen (dedup_sleutel)
  WHERE status = 'open';
