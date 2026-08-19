-- REGISTER_01 hardening: de vier standen als DB-invariant, niet alleen API-validatie.
-- Eerst eventuele afwijkende waarden fail-closed naar 'onbewezen' normaliseren.
UPDATE acceptatie_register
SET stand = 'onbewezen'
WHERE stand NOT IN ('gehaald', 'niet_gebouwd', 'onbewezen', 'wacht_op_rene');

ALTER TABLE acceptatie_register
  ADD CONSTRAINT acceptatie_register_stand_check
  CHECK (stand IN ('gehaald', 'niet_gebouwd', 'onbewezen', 'wacht_op_rene'));
