import { pgTable, serial, text, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { gebouwenTable } from "./gebouwen";
import { voorzieningenTable } from "./voorzieningen";
import { gebruikersTable } from "./gebruikers";
import { onderhoudTable } from "./onderhoud";

export const inspectiesTable = pgTable("inspecties", {
  id: serial("id").primaryKey(),
  voorzieningId: integer("voorziening_id").references(() => voorzieningenTable.id, { onDelete: "set null" }),
  gebouwId: integer("gebouw_id").references(() => gebouwenTable.id, { onDelete: "set null" }),
  type: text("type").notNull().default("periodiek"),
  status: text("status").notNull().default("gepland"),
  inspecteurId: integer("inspecteur_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  geplandeDatum: text("geplande_datum"),
  uitgevoerdDatum: text("uitgevoerd_datum"),
  bevindingen: text("bevindingen"),
  aanbevelingen: text("aanbevelingen"),
  goedgekeurd: boolean("goedgekeurd"),
  rapportUrl: text("rapport_url"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
}, (t) => [
  index("inspecties_gebouw_type_idx").on(t.gebouwId, t.type),
]);

export const inspectieBevindingen = pgTable("inspectie_bevindingen", {
  id: serial("id").primaryKey(),
  inspectieId: integer("inspectie_id").notNull().references(() => inspectiesTable.id, { onDelete: "cascade" }),
  voorzieningId: integer("voorziening_id").references(() => voorzieningenTable.id, { onDelete: "set null" }),
  status: text("status").notNull().default("goed"),
  omschrijving: text("omschrijving"),
  aanbeveling: text("aanbeveling"),
  herstellVereist: boolean("herstel_vereist").notNull().default(false),
  herstellWerkbonId: integer("herstel_werkbon_id").references(() => onderhoudTable.id, { onDelete: "set null" }),
  fotoUrls: text("foto_urls").notNull().default("[]"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export const insertInspectieSchema = createInsertSchema(inspectiesTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export type InsertInspectie = z.infer<typeof insertInspectieSchema>;
export type Inspectie = typeof inspectiesTable.$inferSelect;

export const insertInspectieBevindingSchema = createInsertSchema(inspectieBevindingen).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export type InsertInspectieBevinding = z.infer<typeof insertInspectieBevindingSchema>;
export type InspectieBevinding = typeof inspectieBevindingen.$inferSelect;
