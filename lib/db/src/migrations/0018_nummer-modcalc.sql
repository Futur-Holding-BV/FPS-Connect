-- NUMMER_01 correctie — de werkelijk gebruikte calculatiemodule is mod_calc
-- (ENK-import): offertes.calculatie_id en opdrachten.calculatie_id verwijzen in
-- de code naar mod_calc_headers, niet naar de oudere calculaties-tabel.
--
-- 1) FK op offertes.calculatie_id omhangen naar mod_calc_headers.
-- 2) mod_calc_headers krijgt een C-nummer uit DEZELFDE doorlopende reeks
--    (seq_nummer_c) plus de kopie/keten-velden — één C-reeks over beide modules.

ALTER TABLE offertes DROP CONSTRAINT IF EXISTS offertes_calculatie_id_fk;
ALTER TABLE offertes
  ADD CONSTRAINT offertes_calculatie_id_fk
  FOREIGN KEY (calculatie_id) REFERENCES mod_calc_headers(id) ON DELETE SET NULL;

ALTER TABLE mod_calc_headers
  ADD COLUMN IF NOT EXISTS nummer integer;
UPDATE mod_calc_headers SET nummer = nextval('seq_nummer_c') WHERE nummer IS NULL;
ALTER TABLE mod_calc_headers
  ALTER COLUMN nummer SET DEFAULT nextval('seq_nummer_c'),
  ALTER COLUMN nummer SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS mod_calc_headers_nummer_uq ON mod_calc_headers (nummer);

ALTER TABLE mod_calc_headers
  ADD COLUMN IF NOT EXISTS opname_id integer REFERENCES opnames(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS gekopieerd_van_id integer,
  ADD COLUMN IF NOT EXISTS verzonden_op timestamp;
