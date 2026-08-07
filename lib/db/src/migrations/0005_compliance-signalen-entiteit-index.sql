-- Migratie 0005 — index op compliance_signalen (entiteit_type, entiteit_id)
-- Wat: samengestelde index voor lookups van signalen per entiteit.
-- Waarom: punt 7 uit docs/technische-schuld.md vroeg om een index op
--   documenten.entiteit_type+entiteit_id, maar die kolommen bestaan niet op
--   `documenten` (het DMS koppelt via document_koppelingen, dat al geïndexeerd
--   is — punt 6). De tabel die deze kolommen wél ongeïndexeerd heeft is
--   compliance_signalen; daar landt de index dus.
-- Tevens de eerste testmigratie van de nieuwe migratieketen (SCHEMA_01 §3.5).
CREATE INDEX IF NOT EXISTS compliance_signalen_entiteit_idx
  ON compliance_signalen (entiteit_type, entiteit_id);
