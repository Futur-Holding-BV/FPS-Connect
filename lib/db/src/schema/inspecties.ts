import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { gebouwenTable } from "./gebouwen";
import { voorzieningenTable } from "./voorzieningen";
import { gebruikersTable } from "./gebruikers";

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
});

export const insertInspectieSchema = createInsertSchema(inspectiesTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export type InsertInspectie = z.infer<typeof insertInspectieSchema>;
export type Inspectie = typeof inspectiesTable.$inferSelect;
