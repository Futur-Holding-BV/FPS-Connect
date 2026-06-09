import { pgTable, serial, text, integer, timestamp, real, boolean, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { gebouwenTable, verdiepingenTable } from "./gebouwen";
import { gebruikersTable } from "./gebruikers";

export const voorzieningenTable = pgTable("voorzieningen", {
  id: serial("id").primaryKey(),
  objectnummer: text("objectnummer").notNull().unique(),
  qrCode: text("qr_code"),
  type: text("type").notNull(),
  status: text("status").notNull().default("concept"),
  classificatie: text("classificatie").notNull().default("60"),
  gebouwId: integer("gebouw_id").notNull().references(() => gebouwenTable.id, { onDelete: "cascade" }),
  verdiepingId: integer("verdieping_id").references(() => verdiepingenTable.id, { onDelete: "set null" }),
  ruimte: text("ruimte"),
  huisnummer: text("huisnummer"),
  locatieOmschrijving: text("locatie_omschrijving"),
  locatieX: real("locatie_x"),
  locatieY: real("locatie_y"),
  materialen: text("materialen"),
  opmerkingen: text("opmerkingen"),
  wbdbo: text("wbdbo"),
  wrd: text("wrd"),
  wandOfPlafond: text("wand_of_plafond"),
  monteurId: integer("monteur_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  makerMonteurId: integer("maker_monteur_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  controleurId: integer("controleur_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  installatieDatum: text("installatie_datum"),
  volgendeInspectie: text("volgende_inspectie"),
  gearchiveerd: boolean("gearchiveerd").notNull().default(false),
  gearchiveerdOp: timestamp("gearchiveerd_op"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export const insertVoorzieningSchema = createInsertSchema(voorzieningenTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export type InsertVoorziening = z.infer<typeof insertVoorzieningSchema>;
export type Voorziening = typeof voorzieningenTable.$inferSelect;

// ── APPLICATIES (genummerde typecatalogus, bv. "1.20 stalen buis") ──────────
// UI-benaming: "Applicatie". Code/benaming volgt de SnagStream-nummering.
export const voorzieningTypesTable = pgTable("voorziening_types", {
  code: text("code").primaryKey(),
  naam: text("naam").notNull(),
  categorie: text("categorie").notNull(),
  volgorde: integer("volgorde").notNull().default(0),
  actief: boolean("actief").notNull().default(true),
});
export type VoorzieningType = typeof voorzieningTypesTable.$inferSelect;

// ── TESTRAPPORTEN (bibliotheek met PDF's) ───────────────────────────────────
export const testrapportenTable = pgTable("testrapporten", {
  id: serial("id").primaryKey(),
  naam: text("naam").notNull(),
  fabrikant: text("fabrikant"),
  norm: text("norm"),
  rapportnummer: text("rapportnummer"),
  pdfUrl: text("pdf_url"),
  gearchiveerd: boolean("gearchiveerd").notNull().default(false),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});
export const insertTestrapportSchema = createInsertSchema(testrapportenTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export type InsertTestrapport = z.infer<typeof insertTestrapportSchema>;
export type Testrapport = typeof testrapportenTable.$inferSelect;

// ── TOEPASSINGEN (label = gebruikt product/producten, hoort bij een applicatie) ─
// UI-benaming: "Toepassing". Optioneel gekoppeld aan één testrapport.
export const labelsTable = pgTable("labels", {
  id: serial("id").primaryKey(),
  typeCode: text("type_code").notNull().references(() => voorzieningTypesTable.code, { onDelete: "cascade" }),
  naam: text("naam").notNull(),
  fabrikant: text("fabrikant"),
  testnorm: text("testnorm"),
  testrapportId: integer("testrapport_id").references(() => testrapportenTable.id, { onDelete: "set null" }),
  gearchiveerd: boolean("gearchiveerd").notNull().default(false),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});
export const insertLabelSchema = createInsertSchema(labelsTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export type InsertLabel = z.infer<typeof insertLabelSchema>;
export type Label = typeof labelsTable.$inferSelect;

// ── KOPPELING voorziening ↔ toepassingen (meerdere per voorziening) ──────────
export const voorzieningLabelsTable = pgTable("voorziening_labels", {
  id: serial("id").primaryKey(),
  voorzieningId: integer("voorziening_id").notNull().references(() => voorzieningenTable.id, { onDelete: "cascade" }),
  labelId: integer("label_id").notNull().references(() => labelsTable.id, { onDelete: "cascade" }),
}, (t) => ({
  uniekePaar: unique().on(t.voorzieningId, t.labelId),
}));
export type VoorzieningLabel = typeof voorzieningLabelsTable.$inferSelect;

export const fotosTable = pgTable("fotos", {
  id: serial("id").primaryKey(),
  voorzieningId: integer("voorziening_id").notNull().references(() => voorzieningenTable.id, { onDelete: "cascade" }),
  fase: text("fase").notNull(),
  url: text("url").notNull(),
  beschrijving: text("beschrijving"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
});

export const insertFotoSchema = createInsertSchema(fotosTable).omit({ id: true, aangemaaktOp: true });
export type InsertFoto = z.infer<typeof insertFotoSchema>;
export type Foto = typeof fotosTable.$inferSelect;
