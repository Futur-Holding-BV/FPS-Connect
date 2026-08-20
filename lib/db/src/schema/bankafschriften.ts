import {
  pgTable, serial, text, integer, boolean, timestamp, numeric,
  uniqueIndex, index, unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { gebruikersTable } from "./gebruikers";
import { werkgeversTable, werkgeverBankrekeningenTable } from "./hrm";
import { facturenTable, betaalbatchesTable, betaalbatchRegelsTable } from "./facturen";

// ── bank_imports ──────────────────────────────────────────────────────────────
// Eén rij per aangeleverd bankbestand (upload of mailbox). De sha256-hash van
// de bestandsinhoud garandeert idempotentie: hetzelfde bestand kan nooit twee
// import-dossiers opleveren.
export const bankImportsTable = pgTable("bank_imports", {
  id:            serial("id").primaryKey(),

  // Bestandsidentiteit
  sha256:        text("sha256").notNull(),
  formaat:       text("formaat").notNull(), // camt053 | mt940
  bestandsnaam:  text("bestandsnaam").notNull(),
  contenttype:   text("content_type"),

  // Herkomst
  bron:          text("bron").notNull(), // upload | mailbox

  // Mailbox-metadata (gevuld wanneer bron = mailbox)
  mailboxAdres:  text("mailbox_adres"),
  mailMessageId: text("mail_message_id"),
  attachmentId:  text("attachment_id"),

  // Verwerkingsstatus
  // nieuw | verwerkt | gedeeltelijk | mislukt
  status:        text("status").notNull().default("nieuw"),
  fout:          text("fout"),

  // Beheer
  aangemaaktDoor: integer("aangemaakt_door").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangemaaktOp:  timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp:  timestamp("bijgewerkt_op").notNull().defaultNow(),
}, (t) => [
  unique("bank_imports_sha256_uniek").on(t.sha256),
  index("bank_imports_status_idx").on(t.status),
  index("bank_imports_mailbox_message_idx").on(t.mailboxAdres, t.mailMessageId),
]);

export type BankImport = typeof bankImportsTable.$inferSelect;

// ── bank_import_archieven ─────────────────────────────────────────────────────
// Koppelt een import-dossier aan een werkmaatschappij en slaat het object-pad
// van het gearchiveerde bankbestand op. Per import+werkgever precies één rij.
export const bankImportArchievenTable = pgTable("bank_import_archieven", {
  id:          serial("id").primaryKey(),
  importId:    integer("import_id").notNull().references(() => bankImportsTable.id, { onDelete: "cascade" }),
  werkgeverId: integer("werkgever_id").notNull().references(() => werkgeversTable.id, { onDelete: "cascade" }),
  objectPath:  text("object_path").notNull(),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
}, (t) => [
  unique("bank_import_archieven_import_werkgever_uniek").on(t.importId, t.werkgeverId),
]);

export type BankImportArchief = typeof bankImportArchievenTable.$inferSelect;

// ── bank_afschriften ──────────────────────────────────────────────────────────
// Eén rij per rekeningafschrift (statement) zoals aangeleverd in het bestand.
// De combinatie bankrekening + statement_id is uniek: hetzelfde afschrift mag
// nooit twee keer definitief worden opgeslagen.
export const bankAfschriftenTable = pgTable("bank_afschriften", {
  id:             serial("id").primaryKey(),
  importId:       integer("import_id").notNull().references(() => bankImportsTable.id, { onDelete: "cascade" }),

  // Bankrekening
  bankrekeningId: integer("bankrekening_id").notNull().references(() => werkgeverBankrekeningenTable.id, { onDelete: "restrict" }),
  werkgeverId:    integer("werkgever_id").notNull().references(() => werkgeversTable.id, { onDelete: "cascade" }),
  iban:           text("iban").notNull(),

  // Afschriftidentiteit
  statementId:    text("statement_id").notNull(),
  volgnummer:     integer("volgnummer"),       // nullable — niet alle formaten bieden volgnummers
  banknaam:       text("banknaam"),

  // Periode
  vanDatum:       text("van_datum").notNull(),
  totDatum:       text("tot_datum").notNull(),

  // Saldi
  openingssaldo:  numeric("openingssaldo",  { precision: 14, scale: 2 }).notNull(),
  eindsaldo:      numeric("eindsaldo",      { precision: 14, scale: 2 }).notNull(),
  mutatiesom:     numeric("mutatiesom",     { precision: 14, scale: 2 }).notNull(),
  valuta:         text("valuta").notNull().default("EUR"),

  // Integriteitscontrole
  reeksHiaat:     boolean("reeks_hiaat").notNull().default(false),

  // Status: verwerkt | gecontroleerd | hiaat | fout
  status:         text("status").notNull().default("verwerkt"),

  aangemaaktOp:   timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp:   timestamp("bijgewerkt_op").notNull().defaultNow(),
}, (t) => [
  unique("bank_afschriften_rekening_statement_uniek").on(t.bankrekeningId, t.statementId),
  index("bank_afschriften_import_idx").on(t.importId),
  index("bank_afschriften_werkgever_idx").on(t.werkgeverId),
  index("bank_afschriften_iban_idx").on(t.iban),
]);

export type BankAfschrift = typeof bankAfschriftenTable.$inferSelect;

// ── bank_mutaties ─────────────────────────────────────────────────────────────
// Eén rij per banktransactie. De bankreferentie is hard verplicht: zonder
// unieke bronreferentie kan een transactie niet duurzaam worden geïdentificeerd.
// De combinatie bankrekening + bankreferentie is uniek.
export const bankMutatiesTable = pgTable("bank_mutaties", {
  id:                  serial("id").primaryKey(),
  afschriftId:         integer("afschrift_id").notNull().references(() => bankAfschriftenTable.id, { onDelete: "cascade" }),
  bankrekeningId:      integer("bankrekening_id").notNull().references(() => werkgeverBankrekeningenTable.id, { onDelete: "restrict" }),
  werkgeverId:         integer("werkgever_id").notNull().references(() => werkgeversTable.id, { onDelete: "cascade" }),

  // Referenties
  bankreferentie:      text("bankreferentie").notNull(), // hard verplicht — uniek bewijs van de bank
  txReferentie:        text("tx_referentie"),            // evt. additionele transactiereferentie
  endToEndReferentie:  text("end_to_end_referentie"),    // pain.001 EndToEndId voor batchkoppeling

  // Bedrag en richting
  bedrag:              numeric("bedrag",   { precision: 14, scale: 2 }).notNull(), // gesigneerd: negatief = debet
  valuta:              text("valuta").notNull().default("EUR"),
  creditDebit:         text("credit_debit").notNull(), // CRDT | DBIT

  // Datums
  boekdatum:           text("boekdatum").notNull(),
  valuedatum:          text("valuedatum"),

  // Tegenpartij
  tegenpartijIban:     text("tegenpartij_iban"),
  tegenpartijNaam:     text("tegenpartij_naam"),

  // Omschrijving
  remittance:          text("remittance"),

  // G-rekening markering
  gRekening:           boolean("g_rekening").notNull().default(false),

  // Reconciliatie
  // onbekend | gematcht | deels_gematcht | geen_kandidaat | meerdere_kandidaten | handmatig
  reconciliatieStatus: text("reconciliatie_status").notNull().default("onbekend"),
  matchedFactuurId:    integer("matched_factuur_id").references(() => facturenTable.id, { onDelete: "set null" }),
  matchedBatchregelId: integer("matched_batchregel_id"), // soft ref betaalbatch_regels.id

  // AccountView export
  accountviewStatus:   text("accountview_status"),       // null | bezig | geslaagd | mislukt | onzeker
  accountviewId:       text("accountview_id"),
  accountviewFout:     text("accountview_fout"),
  accountviewClaimToken: text("accountview_claim_token"),
  accountviewClaimOp:    timestamp("accountview_claim_op"),

  aangemaaktOp:        timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp:        timestamp("bijgewerkt_op").notNull().defaultNow(),
}, (t) => [
  unique("bank_mutaties_rekening_referentie_uniek").on(t.bankrekeningId, t.bankreferentie),
  index("bank_mutaties_afschrift_idx").on(t.afschriftId),
  index("bank_mutaties_werkgever_idx").on(t.werkgeverId),
  index("bank_mutaties_reconciliatie_idx").on(t.reconciliatieStatus),
  index("bank_mutaties_endtoend_idx").on(t.endToEndReferentie),
  index("bank_mutaties_factuur_idx").on(t.matchedFactuurId),
]);

export type BankMutatie = typeof bankMutatiesTable.$inferSelect;

// ── bank_aflettervoorstellen ──────────────────────────────────────────────────
// Automatisch gegenereerde afletterkandidaten voor een bankmutatie. Per mutatie
// maximaal één kandidaat-per-combinatie (uniek: mutatie + factuur + batchregel).
// Status: voorstel | geaccepteerd | afgewezen | vervallen
export const bankAfletterVoorstellenTable = pgTable("bank_aflettervoorstellen", {
  id:               serial("id").primaryKey(),
  mutatieId:        integer("mutatie_id").notNull().references(() => bankMutatiesTable.id, { onDelete: "cascade" }),
  factuurId:        integer("factuur_id").references(() => facturenTable.id, { onDelete: "set null" }),
  batchregelId:     integer("batchregel_id"), // soft ref betaalbatch_regels.id

  rang:             integer("rang").notNull().default(1),      // prioriteitsvolgorde
  score:            numeric("score", { precision: 5, scale: 4 }), // matching-zekerheid 0.0000–1.0000
  reden:            text("reden"),                             // mensleesbare toelichting

  // voorstel | geaccepteerd | afgewezen | vervallen
  status:           text("status").notNull().default("voorstel"),
  beslistDoor:      integer("beslist_door").references(() => gebruikersTable.id, { onDelete: "set null" }),
  beslistOp:        timestamp("beslist_op"),

  aangemaaktOp:     timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp:     timestamp("bijgewerkt_op").notNull().defaultNow(),
}, (t) => [
  // Uniek: één kandidaat per (mutatie, factuur, batchregel)-combinatie
  uniqueIndex("bank_afletterv_kandidaat_uniek")
    .on(t.mutatieId, sql`COALESCE(${t.factuurId}, 0)`, sql`COALESCE(${t.batchregelId}, 0)`)
    .where(sql`${t.factuurId} IS NOT NULL OR ${t.batchregelId} IS NOT NULL`),
  index("bank_afletterv_mutatie_idx").on(t.mutatieId),
  index("bank_afletterv_factuur_idx").on(t.factuurId),
  index("bank_afletterv_status_idx").on(t.status),
]);

export type BankAfletterVoorstel = typeof bankAfletterVoorstellenTable.$inferSelect;

// ── bank_afletter_audit ───────────────────────────────────────────────────────
// Append-only auditlog van alle afletteracties. Nooit verwijderen of wijzigen.
export const bankAfletterAuditTable = pgTable("bank_afletter_audit", {
  id:            serial("id").primaryKey(),
  mutatieId:     integer("mutatie_id").notNull().references(() => bankMutatiesTable.id, { onDelete: "cascade" }),
  voorstelId:    integer("voorstel_id"), // soft ref bank_aflettervoorstellen.id
  actie:         text("actie").notNull(), // automatisch_gematcht | geaccepteerd | afgewezen | teruggedraaid | vervallen
  reden:         text("reden"),
  gebruikerId:   integer("gebruiker_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  gebruikerNaam: text("gebruiker_naam"),
  payload:       text("payload"),        // JSON-snapshot van de mutatietoestand op het moment van de actie
  aangemaaktOp:  timestamp("aangemaakt_op").notNull().defaultNow(),
}, (t) => [
  index("bank_afletter_audit_mutatie_idx").on(t.mutatieId),
  index("bank_afletter_audit_aangemaakt_idx").on(t.aangemaaktOp),
]);

export type BankAfletterAudit = typeof bankAfletterAuditTable.$inferSelect;

// ── bank_mailbijlage_claims ───────────────────────────────────────────────────
// Duurzame uniciteit voor mailboxbijlagen die als bankafschrift zijn geclaimd.
// De drietuple mailbox + message_id + attachment_id is uniek: dezelfde bijlage
// kan nooit twee afzonderlijke importdossiers opleveren.
export const bankMailbijlageClaimsTable = pgTable("bank_mailbijlage_claims", {
  id:            serial("id").primaryKey(),
  mailboxAdres:  text("mailbox_adres").notNull(),
  mailMessageId: text("mail_message_id").notNull(),
  attachmentId:  text("attachment_id").notNull(),
  importId:      integer("import_id").references(() => bankImportsTable.id, { onDelete: "set null" }),
  status:        text("status").notNull().default("bezig"), // bezig | verwerkt | mislukt
  claimToken:    text("claim_token"),
  leaseTot:      timestamp("lease_tot"),
  fout:          text("fout"),
  aangemaaktOp:  timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp:  timestamp("bijgewerkt_op").notNull().defaultNow(),
}, (t) => [
  unique("bank_mailbijlage_claims_uniek").on(t.mailboxAdres, t.mailMessageId, t.attachmentId),
]);

export type BankMailbijlageClaim = typeof bankMailbijlageClaimsTable.$inferSelect;
