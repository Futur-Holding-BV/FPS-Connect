import { pgTable, serial, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";

export const importLogsTable = pgTable("import_logs", {
  id: serial("id").primaryKey(),

  // Wat is geïmporteerd
  type: text("type").notNull(),                          // "leveranciers" | "klanten" | "artikelen" | "projecten"
  bestandsnaam: text("bestandsnaam").notNull(),

  // Resultaten
  rijenTotaal: integer("rijen_totaal").notNull().default(0),
  rijenVerwerkt: integer("rijen_verwerkt").notNull().default(0),
  rijenOvergeslagen: integer("rijen_overgeslagen").notNull().default(0),

  // Foutrapport: array van { rij: number, fout: string }
  fouten: jsonb("fouten"),

  // Wie heeft geïmporteerd
  gebruikerId: integer("gebruiker_id"),

  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
});
