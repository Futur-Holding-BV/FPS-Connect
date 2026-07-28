import { pgTable, serial, text, integer, timestamp, index } from "drizzle-orm/pg-core";
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
  offerteId: integer("offerte_id"),
  tijdstip: timestamp("tijdstip").notNull().defaultNow(),
}, (t) => [
  // Feed-query: activiteiten per gebouw, nieuwste eerst. De tijdkolom heet hier
  // "tijdstip" (deze tabel heeft geen aangemaakt_op).
  index("activiteiten_gebouw_tijdstip_idx").on(t.gebouwId, t.tijdstip),
]);

export const insertActiviteitSchema = createInsertSchema(activiteitenTable).omit({ id: true, tijdstip: true });
export type InsertActiviteit = z.infer<typeof insertActiviteitSchema>;
export type Activiteit = typeof activiteitenTable.$inferSelect;
