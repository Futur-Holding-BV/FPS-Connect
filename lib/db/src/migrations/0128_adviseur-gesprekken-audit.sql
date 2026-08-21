-- ADVISEUR_PERSIST_01 (task-1202) — server-eigen persistentie + audit voor de
-- FPS Bedrijfsadviseur. De assistent-conversatie is server-eigendom: de
-- geschiedenis komt uit de database (nooit van de client) en is geïsoleerd per
-- effectieve gebruiker + effectieve rol. Elke vraag/antwoord, contextgebruik,
-- toolautorisatie/-resultaat en elke geweigerde aanvraag wordt geaudit.
-- Additief en idempotent (IF NOT EXISTS). Raakt de gewone menselijke chat
-- (chat_gesprekken/chat_berichten) niet aan.

-- ── adviseur_gesprekken ─────────────────────────────────────────────────────
-- Eén rij per assistent-gesprek. De combinatie gebruiker + effectieve rol
-- bepaalt de isolatie: een hoofdbeheerder die "bekijken als" een teamlid doet,
-- krijgt een eigen, van zijn hoofdbeheerder-gesprek gescheiden geschiedenis.
CREATE TABLE IF NOT EXISTS "adviseur_gesprekken" (
  "id"               serial PRIMARY KEY,
  "gebruiker_id"     integer NOT NULL REFERENCES "gebruikers"("id") ON DELETE CASCADE,
  "effectieve_rol"   text NOT NULL,
  "aangemaakt_op"    timestamp NOT NULL DEFAULT now(),
  "bijgewerkt_op"    timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "adviseur_gesprekken_gebruiker_rol_idx"
  ON "adviseur_gesprekken" ("gebruiker_id", "effectieve_rol", "bijgewerkt_op");

-- ── adviseur_berichten ──────────────────────────────────────────────────────
-- De server-eigen conversatiegeschiedenis. Alleen "user" en "assistant"
-- berichten worden hier bewaard; dit is de bron voor de begrensde historie die
-- bij een volgende vraag aan de AI wordt meegegeven. Nooit door de client
-- aangeleverd.
CREATE TABLE IF NOT EXISTS "adviseur_berichten" (
  "id"             serial PRIMARY KEY,
  "gesprek_id"     integer NOT NULL REFERENCES "adviseur_gesprekken"("id") ON DELETE CASCADE,
  "rol"            text NOT NULL,
  "inhoud"         text NOT NULL,
  "aangemaakt_op"  timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "adviseur_berichten_rol_check" CHECK ("rol" IN ('user','assistant'))
);

CREATE INDEX IF NOT EXISTS "adviseur_berichten_gesprek_aangemaakt_idx"
  ON "adviseur_berichten" ("gesprek_id", "aangemaakt_op");

-- ── adviseur_audit ──────────────────────────────────────────────────────────
-- Volledige audittrail per vraag: de vraag, het antwoord, de gebruikte
-- paginacontext, de toolautorisaties/-resultaten, geweigerde aanvragen en de
-- expliciete geen-toegang/geen-data-uitkomst. citaties bevat de klik-veilige
-- bronverwijzingen die ook in het antwoord teruggaan.
CREATE TABLE IF NOT EXISTS "adviseur_audit" (
  "id"                 serial PRIMARY KEY,
  "gesprek_id"         integer REFERENCES "adviseur_gesprekken"("id") ON DELETE SET NULL,
  "gebruiker_id"       integer REFERENCES "gebruikers"("id") ON DELETE SET NULL,
  "effectieve_rol"     text NOT NULL,
  "vraag"              text NOT NULL,
  "antwoord"           text,
  "context_gebruikt"   jsonb,
  "tool_autorisaties"  jsonb,
  "geweigerde_tools"   jsonb,
  "citaties"           jsonb,
  "uitkomst"           text NOT NULL,
  "aangemaakt_op"      timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "adviseur_audit_gebruiker_idx"
  ON "adviseur_audit" ("gebruiker_id", "aangemaakt_op");

CREATE INDEX IF NOT EXISTS "adviseur_audit_gesprek_idx"
  ON "adviseur_audit" ("gesprek_id");

CREATE INDEX IF NOT EXISTS "adviseur_audit_uitkomst_idx"
  ON "adviseur_audit" ("uitkomst");
