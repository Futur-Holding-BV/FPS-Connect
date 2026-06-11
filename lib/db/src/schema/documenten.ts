import { pgTable, serial, text, integer, timestamp, boolean, jsonb, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { labelsTable } from "./voorzieningen";

// ── DOCUMENTEN (centrale documentbibliotheek met versiebeheer) ──────────────
// Vervangt/absorbeert testrapporten: een testrapport is documenttype 'testrapport'.
// documenttype: eta | classificatierapport | testrapport | productcertificaat | dop | verwerkingsvoorschrift
// status:       actueel | controle_nodig | vervangen | mogelijk_verouderd | ingetrokken
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
