-- Contractbewaking: dedupe-check was select-then-insert zonder DB-borging.
-- Gelijktijdige bewakingsruns konden dubbele signaleringen aanmaken.
-- Eerst bestaande dubbelen opruimen (oudste rij wint), dan uniek afdwingen.
DELETE FROM contract_signaleringen a
  USING contract_signaleringen b
  WHERE a.id > b.id
    AND a.contract_id = b.contract_id
    AND a.type = b.type;

CREATE UNIQUE INDEX IF NOT EXISTS contract_signaleringen_contract_type_uniek
  ON contract_signaleringen (contract_id, type);
