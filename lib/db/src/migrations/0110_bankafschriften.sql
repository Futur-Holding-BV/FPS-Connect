-- BANK_01 databasegrondslag: bankafschriftimport, afschriften, mutaties,
-- aflettervoorstellen, auditlog en mailbijlageclaims.
-- Additief en idempotent (IF NOT EXISTS / IF NOT EXISTS-patroon).

-- ── bank_imports ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "bank_imports" (
  "id"                serial PRIMARY KEY,
  "sha256"            text NOT NULL,
  "formaat"           text NOT NULL,                -- camt053 | mt940
  "bestandsnaam"      text NOT NULL,
  "content_type"      text,
  "bron"              text NOT NULL,                -- upload | mailbox
  "mailbox_adres"     text,
  "mail_message_id"   text,
  "attachment_id"     text,
  "status"            text NOT NULL DEFAULT 'nieuw', -- nieuw | verwerkt | gedeeltelijk | mislukt
  "fout"              text,
  "aangemaakt_door"   integer REFERENCES "gebruikers"("id") ON DELETE SET NULL,
  "aangemaakt_op"     timestamp NOT NULL DEFAULT now(),
  "bijgewerkt_op"     timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "bank_imports_formaat_check" CHECK ("formaat" IN ('camt053','mt940')),
  CONSTRAINT "bank_imports_bron_check"    CHECK ("bron"    IN ('upload','mailbox'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "bank_imports_sha256_uniek"
  ON "bank_imports" ("sha256");

CREATE INDEX IF NOT EXISTS "bank_imports_status_idx"
  ON "bank_imports" ("status");

CREATE INDEX IF NOT EXISTS "bank_imports_mailbox_message_idx"
  ON "bank_imports" ("mailbox_adres", "mail_message_id");

-- ── bank_import_archieven ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "bank_import_archieven" (
  "id"            serial PRIMARY KEY,
  "import_id"     integer NOT NULL REFERENCES "bank_imports"("id") ON DELETE CASCADE,
  "werkgever_id"  integer NOT NULL REFERENCES "werkgevers"("id") ON DELETE CASCADE,
  "object_path"   text NOT NULL,
  "aangemaakt_op" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "bank_import_archieven_import_werkgever_uniek"
  ON "bank_import_archieven" ("import_id", "werkgever_id");

-- ── bank_afschriften ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "bank_afschriften" (
  "id"                serial PRIMARY KEY,
  "import_id"         integer NOT NULL REFERENCES "bank_imports"("id") ON DELETE CASCADE,
  "bankrekening_id"   integer NOT NULL REFERENCES "werkgever_bankrekeningen"("id") ON DELETE RESTRICT,
  "werkgever_id"      integer NOT NULL REFERENCES "werkgevers"("id") ON DELETE CASCADE,
  "iban"              text NOT NULL,
  "statement_id"      text NOT NULL,
  "volgnummer"        integer,                          -- nullable
  "banknaam"          text,
  "van_datum"         text NOT NULL,
  "tot_datum"         text NOT NULL,
  "openingssaldo"     numeric(14,2) NOT NULL,
  "eindsaldo"         numeric(14,2) NOT NULL,
  "mutatiesom"        numeric(14,2) NOT NULL,
  "valuta"            text NOT NULL DEFAULT 'EUR',
  "reeks_hiaat"       boolean NOT NULL DEFAULT false,
  "status"            text NOT NULL DEFAULT 'verwerkt', -- verwerkt | gecontroleerd | hiaat | fout
  "aangemaakt_op"     timestamp NOT NULL DEFAULT now(),
  "bijgewerkt_op"     timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "bank_afschriften_rekening_statement_uniek"
  ON "bank_afschriften" ("bankrekening_id", "statement_id");

CREATE INDEX IF NOT EXISTS "bank_afschriften_import_idx"
  ON "bank_afschriften" ("import_id");

CREATE INDEX IF NOT EXISTS "bank_afschriften_werkgever_idx"
  ON "bank_afschriften" ("werkgever_id");

CREATE INDEX IF NOT EXISTS "bank_afschriften_iban_idx"
  ON "bank_afschriften" ("iban");

-- ── bank_mutaties ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "bank_mutaties" (
  "id"                    serial PRIMARY KEY,
  "afschrift_id"          integer NOT NULL REFERENCES "bank_afschriften"("id") ON DELETE CASCADE,
  "bankrekening_id"       integer NOT NULL REFERENCES "werkgever_bankrekeningen"("id") ON DELETE RESTRICT,
  "werkgever_id"          integer NOT NULL REFERENCES "werkgevers"("id") ON DELETE CASCADE,
  "bankreferentie"        text NOT NULL,
  "tx_referentie"         text,
  "end_to_end_referentie" text,
  "bedrag"                numeric(14,2) NOT NULL,
  "valuta"                text NOT NULL DEFAULT 'EUR',
  "credit_debit"          text NOT NULL,                -- CRDT | DBIT
  "boekdatum"             text NOT NULL,
  "valuedatum"            text,
  "tegenpartij_iban"      text,
  "tegenpartij_naam"      text,
  "remittance"            text,
  "g_rekening"            boolean NOT NULL DEFAULT false,
  "reconciliatie_status"  text NOT NULL DEFAULT 'onbekend',
  "matched_factuur_id"    integer REFERENCES "facturen"("id") ON DELETE SET NULL,
  "matched_batchregel_id" integer,                      -- soft ref betaalbatch_regels.id
  "accountview_status"    text,
  "accountview_id"        text,
  "accountview_fout"      text,
  "aangemaakt_op"         timestamp NOT NULL DEFAULT now(),
  "bijgewerkt_op"         timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "bank_mutaties_credit_debit_check" CHECK ("credit_debit" IN ('CRDT','DBIT')),
  CONSTRAINT "bank_mutaties_reconciliatie_check" CHECK (
    "reconciliatie_status" IN (
      'onbekend','gematcht','deels_gematcht','geen_kandidaat','meerdere_kandidaten','handmatig'
    )
  )
);

-- Uniek per bankrekening + bankreferentie (NULL bankrekening_id telt als afzonderlijk)
CREATE UNIQUE INDEX IF NOT EXISTS "bank_mutaties_rekening_referentie_uniek"
  ON "bank_mutaties" ("bankrekening_id", "bankreferentie");

CREATE INDEX IF NOT EXISTS "bank_mutaties_afschrift_idx"
  ON "bank_mutaties" ("afschrift_id");

CREATE INDEX IF NOT EXISTS "bank_mutaties_werkgever_idx"
  ON "bank_mutaties" ("werkgever_id");

CREATE INDEX IF NOT EXISTS "bank_mutaties_reconciliatie_idx"
  ON "bank_mutaties" ("reconciliatie_status");

CREATE INDEX IF NOT EXISTS "bank_mutaties_endtoend_idx"
  ON "bank_mutaties" ("end_to_end_referentie");

CREATE INDEX IF NOT EXISTS "bank_mutaties_factuur_idx"
  ON "bank_mutaties" ("matched_factuur_id");

-- ── bank_aflettervoorstellen ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "bank_aflettervoorstellen" (
  "id"            serial PRIMARY KEY,
  "mutatie_id"    integer NOT NULL REFERENCES "bank_mutaties"("id") ON DELETE CASCADE,
  "factuur_id"    integer          REFERENCES "facturen"("id") ON DELETE SET NULL,
  "batchregel_id" integer,         -- soft ref betaalbatch_regels.id
  "rang"          integer NOT NULL DEFAULT 1,
  "score"         numeric(5,4),
  "reden"         text,
  "status"        text NOT NULL DEFAULT 'voorstel', -- voorstel | geaccepteerd | afgewezen | vervallen
  "beslist_door"  integer          REFERENCES "gebruikers"("id") ON DELETE SET NULL,
  "beslist_op"    timestamp,
  "aangemaakt_op" timestamp NOT NULL DEFAULT now(),
  "bijgewerkt_op" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "bank_afletterv_score_check" CHECK ("score" IS NULL OR ("score" >= 0 AND "score" <= 1)),
  CONSTRAINT "bank_afletterv_kandidaat_check"
    CHECK ("factuur_id" IS NOT NULL OR "batchregel_id" IS NOT NULL)
);

-- Uniek: één kandidaat per (mutatie, factuur, batchregel)-combinatie
CREATE UNIQUE INDEX IF NOT EXISTS "bank_afletterv_kandidaat_uniek"
  ON "bank_aflettervoorstellen" (
    "mutatie_id",
    COALESCE("factuur_id", 0),
    COALESCE("batchregel_id", 0)
  );

CREATE INDEX IF NOT EXISTS "bank_afletterv_mutatie_idx"
  ON "bank_aflettervoorstellen" ("mutatie_id");

CREATE INDEX IF NOT EXISTS "bank_afletterv_factuur_idx"
  ON "bank_aflettervoorstellen" ("factuur_id");

CREATE INDEX IF NOT EXISTS "bank_afletterv_status_idx"
  ON "bank_aflettervoorstellen" ("status");

-- ── bank_afletter_audit (append-only) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "bank_afletter_audit" (
  "id"              serial PRIMARY KEY,
  "mutatie_id"      integer NOT NULL REFERENCES "bank_mutaties"("id") ON DELETE CASCADE,
  "voorstel_id"     integer,        -- soft ref bank_aflettervoorstellen.id
  "actie"           text NOT NULL,  -- automatisch_gematcht | geaccepteerd | afgewezen | teruggedraaid | vervallen
  "reden"           text,
  "gebruiker_id"    integer REFERENCES "gebruikers"("id") ON DELETE SET NULL,
  "gebruiker_naam"  text,
  "payload"         text,           -- JSON-snapshot
  "aangemaakt_op"   timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "bank_afletter_audit_mutatie_idx"
  ON "bank_afletter_audit" ("mutatie_id");

CREATE INDEX IF NOT EXISTS "bank_afletter_audit_aangemaakt_idx"
  ON "bank_afletter_audit" ("aangemaakt_op");

-- ── bank_mailbijlage_claims ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "bank_mailbijlage_claims" (
  "id"              serial PRIMARY KEY,
  "mailbox_adres"   text NOT NULL,
  "mail_message_id" text NOT NULL,
  "attachment_id"   text NOT NULL,
  "import_id"       integer REFERENCES "bank_imports"("id") ON DELETE SET NULL,
  "aangemaakt_op"   timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "bank_mailbijlage_claims_uniek"
  ON "bank_mailbijlage_claims" ("mailbox_adres", "mail_message_id", "attachment_id");

-- ── Uitbreidingen betaalbatches ───────────────────────────────────────────────
-- BANK_01: status 'uitgevoerd' wordt uitsluitend door bankbewijs gezet.
ALTER TABLE "betaalbatches"
  ADD COLUMN IF NOT EXISTS "uitgevoerd_op"        timestamp,
  ADD COLUMN IF NOT EXISTS "uitgevoerd_import_id"  integer REFERENCES "bank_imports"("id") ON DELETE SET NULL;

-- BANK_01: reconciliatiestatus en bankmutatiekoppeling per batchregel.
ALTER TABLE "betaalbatch_regels"
  ADD COLUMN IF NOT EXISTS "reconciliatie_status"  text NOT NULL DEFAULT 'onbekend',
  ADD COLUMN IF NOT EXISTS "bank_mutatie_id"        integer REFERENCES "bank_mutaties"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "gematcht_bedrag"        numeric(14,2);

-- Uniek: één batchregel per bankmutatie (nullable = geen koppeling).
CREATE UNIQUE INDEX IF NOT EXISTS "betaalbatch_regels_bank_mutatie_uniek"
  ON "betaalbatch_regels" ("bank_mutatie_id")
  WHERE "bank_mutatie_id" IS NOT NULL;

-- ── Uitbreidingen werk_inbox_mailboxen ────────────────────────────────────────
ALTER TABLE "werk_inbox_mailboxen"
  ADD COLUMN IF NOT EXISTS "is_bankafschriftmailbox" boolean NOT NULL DEFAULT false;

-- ── Uitbreidingen werk_inbox_mails ────────────────────────────────────────────
ALTER TABLE "werk_inbox_mails"
  ADD COLUMN IF NOT EXISTS "bankafschrift_verwerkt_op"  timestamp,
  ADD COLUMN IF NOT EXISTS "bankafschrift_fout"          text;

-- ── Uitbreidingen accountview_export_logs ────────────────────────────────────
-- factuur_id wordt nullable (export kan ook voor een bankmutatie zijn).
ALTER TABLE "accountview_export_logs"
  ALTER COLUMN "factuur_id" DROP NOT NULL;

-- bank_mutatie_id FK voor bankmutatie-exports.
ALTER TABLE "accountview_export_logs"
  ADD COLUMN IF NOT EXISTS "bank_mutatie_id" integer REFERENCES "bank_mutaties"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "accountview_export_logs_bank_mutatie_idx"
  ON "accountview_export_logs" ("bank_mutatie_id")
  WHERE "bank_mutatie_id" IS NOT NULL;
