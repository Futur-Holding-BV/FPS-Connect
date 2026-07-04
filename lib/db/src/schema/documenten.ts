import { pgTable, serial, text, integer, timestamp, boolean, jsonb, date, unique, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { labelsTable } from "./voorzieningen";
import { gebruikersTable } from "./gebruikers";

// ── DOCUMENTEN (centrale documentbibliotheek met versiebeheer) ──────────────
// Vervangt/absorbeert testrapporten: een testrapport is documenttype 'testrapport'.
// documenttype: eta | classificatierapport | testrapport | productcertificaat | dop | verwerkingsvoorschrift | productblad
// status:       actueel | controle_nodig | vervangen | mogelijk_verouderd | ingetrokken
// goedkeuring:  concept | ter_goedkeuring | goedgekeurd | afgekeurd (default 'goedgekeurd' voor legacy)
// Revisiebeheer: documenten worden nooit overschreven. Een nieuwe versie is een nieuwe
// rij met hetzelfde groep_id en revisie_nummer = max+1; de oude rij krijgt status 'vervangen'.
export const documentenTable = pgTable("documenten", {
  id: serial("id").primaryKey(),
  naam: text("naam").notNull(),
  documenttype: text("documenttype").notNull().default("testrapport"),
  fabrikant: text("fabrikant"),
  product: text("product"),
  enNorm: text("en_norm"),
  rapportnummer: text("rapportnummer"),
  revisie: text("revisie"),
  datum: text("datum"),
  getestVoor: text("getest_voor"),
  pdfUrl: text("pdf_url"),
  status: text("status").notNull().default("actueel"),
  groepId: text("groep_id").notNull().default(sql`gen_random_uuid()::text`),
  revisieNummer: integer("revisie_nummer").notNull().default(1),
  // ── DMS-uitbreiding ──
  // Duplicaatdetectie: SHA-256 van het bestand (client-side berekend, server ziet de bytes niet).
  bestandsHash: text("bestands_hash"),
  bestandsgrootte: integer("bestandsgrootte"),
  // Signaleringen: geldigheids-/vervaldatum (echte date i.p.v. losse datum-tekst).
  geldigTot: date("geldig_tot"),
  // Goedkeuringsflow.
  goedkeuringStatus: text("goedkeuring_status").notNull().default("goedgekeurd"),
  aiGeanalyseerd: boolean("ai_geanalyseerd").notNull().default(false),
  aiMetadata: jsonb("ai_metadata"),
  gearchiveerd: boolean("gearchiveerd").notNull().default(false),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
}, (t) => ({
  uniekeRevisie: unique().on(t.groepId, t.revisieNummer),
}));

export const insertDocumentSchema = createInsertSchema(documentenTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documentenTable.$inferSelect;

// ── KOPPELING document ↔ toepassing (labels, many-to-many) ───────────────────
export const documentToepassingenTable = pgTable("document_toepassingen", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => documentenTable.id, { onDelete: "cascade" }),
  labelId: integer("label_id").notNull().references(() => labelsTable.id, { onDelete: "cascade" }),
}, (t) => ({
  uniekPaar: unique().on(t.documentId, t.labelId),
}));
export type DocumentToepassing = typeof documentToepassingenTable.$inferSelect;

// ── KOPPELING document ↔ entiteit (polymorf: gebouw/klant/offerte/dossier/voorziening) ──
// Polymorf i.p.v. vijf bijna-identieke koppeltabellen. Referentiële integriteit naar het
// doel is bewust niet hard afgedwongen (geen FK); reads zijn orphan-tolerant.
export const documentKoppelingenTable = pgTable("document_koppelingen", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => documentenTable.id, { onDelete: "cascade" }),
  doelType: text("doel_type").notNull(),
  doelId: integer("doel_id").notNull(),
  aangemaaktDoorId: integer("aangemaakt_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
}, (t) => ({
  uniekeKoppeling: unique().on(t.documentId, t.doelType, t.doelId),
  doelIdx: index("document_koppelingen_doel_idx").on(t.doelType, t.doelId),
  doelTypeCheck: check(
    "document_koppelingen_doel_type_check",
    sql`${t.doelType} in ('gebouw','klant','offerte','dossier','voorziening','opdracht')`,
  ),
}));
export type DocumentKoppeling = typeof documentKoppelingenTable.$inferSelect;

// ── GOEDKEURINGEN (goedkeuringsflow-log) ─────────────────────────────────────
// actie: ingediend | goedgekeurd | afgekeurd
export const documentGoedkeuringenTable = pgTable("document_goedkeuringen", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => documentenTable.id, { onDelete: "cascade" }),
  actie: text("actie").notNull(),
  doorId: integer("door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  opmerking: text("opmerking"),
  tijdstip: timestamp("tijdstip").notNull().defaultNow(),
});
export type DocumentGoedkeuring = typeof documentGoedkeuringenTable.$inferSelect;

// ── LOGBOEK (toegang/audittrail) ─────────────────────────────────────────────
// actie: geupload | revisie | gedownload | goedgekeurd | afgekeurd | ingediend | gekoppeld | ontkoppeld | bevroren
// document_naam/gebruiker_naam zijn gedenormaliseerd zodat de globale feed leesbaar blijft.
export const documentLogboekTable = pgTable("document_logboek", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").references(() => documentenTable.id, { onDelete: "set null" }),
  documentNaam: text("document_naam"),
  gebruikerId: integer("gebruiker_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  gebruikerNaam: text("gebruiker_naam"),
  actie: text("actie").notNull(),
  detail: text("detail"),
  tijdstip: timestamp("tijdstip").notNull().defaultNow(),
});
export type DocumentLogboek = typeof documentLogboekTable.$inferSelect;
