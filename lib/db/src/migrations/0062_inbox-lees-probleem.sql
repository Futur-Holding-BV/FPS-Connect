-- DOCUMENT_01 — onleesbare documenten niet stil laten mislukken: expliciete
-- reden bij het inbox-item zelf wanneer tekstextractie én paginaweergave
-- (vision) beide niets opleverden. NULL = document was leesbaar.
ALTER TABLE inbox_items
  ADD COLUMN IF NOT EXISTS lees_probleem text;
