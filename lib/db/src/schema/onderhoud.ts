import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { gebouwenTable } from "./gebouwen";
import { voorzieningenTable } from "./voorzieningen";
import { gebruikersTable } from "./gebruikers";

export const onderhoudTable = pgTable("onderhoud", {
  id: serial("id").primaryKey(),
  voorzieningId: integer("voorziening_id").references(() => voorzieningenTable.id, { onDelete: "set null" }),
  gebouwId: integer("gebouw_id").references(() => gebouwenTable.id, { onDelete: "set null" }),
  titel: text("titel").notNull(),
  omschrijving: text("omschrijving"),
  prioriteit: text("prioriteit").notNull().default("normaal"),
  status: text("status").notNull().default("open"),
  toegewezenAanId: integer("toegewezen_aan_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  deadline: text("deadline"),
  voltooidDatum: text("voltooid_datum"),
  resultaat: text("resultaat"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export const insertOnderhoudSchema = createInsertSchema(onderhoudTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export type InsertOnderhoud = z.infer<typeof insertOnderhoudSchema>;
export type OnderhoudTaak = typeof onderhoudTable.$inferSelect;
