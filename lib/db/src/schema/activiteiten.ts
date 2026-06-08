import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const activiteitenTable = pgTable("activiteiten", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  omschrijving: text("omschrijving").notNull(),
  gebouwId: integer("gebouw_id"),
  gebouwNaam: text("gebouw_naam"),
  voorzieningId: integer("voorziening_id"),
  voorzieningNummer: text("voorziening_nummer"),
  gebruikerId: integer("gebruiker_id"),
  gebruikerNaam: text("gebruiker_naam"),
  tijdstip: timestamp("tijdstip").notNull().defaultNow(),
});

export const insertActiviteitSchema = createInsertSchema(activiteitenTable).omit({ id: true, tijdstip: true });
export type InsertActiviteit = z.infer<typeof insertActiviteitSchema>;
export type Activiteit = typeof activiteitenTable.$inferSelect;
