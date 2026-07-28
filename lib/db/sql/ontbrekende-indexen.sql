-- Technische schuld #1-7 (P1): ontbrekende indexen — 2026-07-28
-- Additief en idempotent; geen wijziging aan kolommen, constraints of data.
-- Opmerkingen t.o.v. de schuldlijst:
--   #6 document_koppelingen: kolommen heten doel_type/doel_id en de index
--      (document_koppelingen_doel_idx) bestond al — geen actie nodig.
--   #7 documenten.entiteit_type/entiteit_id: die kolommen bestaan niet;
--      de polymorfe koppeling zit in document_koppelingen — geen actie nodig.

CREATE INDEX IF NOT EXISTS "voorzieningen_gebouw_idx" ON "voorzieningen" ("gebouw_id");
-- activiteiten heeft geen aangemaakt_op; de tijdkolom heet tijdstip.
CREATE INDEX IF NOT EXISTS "activiteiten_gebouw_tijdstip_idx" ON "activiteiten" ("gebouw_id", "tijdstip");
CREATE INDEX IF NOT EXISTS "inspecties_gebouw_type_idx" ON "inspecties" ("gebouw_id", "type");
CREATE INDEX IF NOT EXISTS "onderhoud_gebouw_status_deadline_idx" ON "onderhoud" ("gebouw_id", "status", "deadline");
CREATE INDEX IF NOT EXISTS "chat_berichten_gesprek_aangemaakt_idx" ON "chat_berichten" ("gesprek_id", "aangemaakt_op");
