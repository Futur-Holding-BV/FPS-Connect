import { pgTable, serial, text, integer, real, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const abonnementenTable = pgTable("abonnementen", {
  id: serial("id").primaryKey(),
  naam: text("naam").notNull(),
  niveau: text("niveau").notNull().default("basis"),
  prijsPerMaand: real("prijs_per_maand").notNull().default(0),
  maxGebouwen: integer("max_gebouwen"),
  maxGebruikers: integer("max_gebruikers"),
  functies: text("functies").array(),
  klantNaam: text("klant_naam"),
  klantEmail: text("klant_email"),
  startDatum: text("start_datum"),
  eindDatum: text("eind_datum"),
  actief: boolean("actief").notNull().default(true),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export const insertAbonnementSchema = createInsertSchema(abonnementenTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export type InsertAbonnement = z.infer<typeof insertAbonnementSchema>;
export type Abonnement = typeof abonnementenTable.$inferSelect;
