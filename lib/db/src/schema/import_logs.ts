import { pgTable, serial, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";

export const importLogsTable = pgTable("import_logs", {
  id: serial("id").primaryKey(),

  // Wat is geïmporteerd
  type: text("type").notNull(),                          // importtype, bv. "leveranciers" | "klanten"
  bestandsnaam: text("bestandsnaam").notNull(),

  // Resultaten
  rijenTotaal: integer("rijen_totaal").notNull().default(0),
  rijenVerwerkt: integer("rijen_verwerkt").notNull().default(0),
  rijenOvergeslagen: integer("rijen_overgeslagen").notNull().default(0),
  rijenDubbel: integer("rijen_dubbel").notNull().default(0),

  // Keuze bij gevonden dubbelen: "overslaan" | "als_nieuw" (null = geen dubbelen)
  keuzeDubbelen: text("keuze_dubbelen"),

  // Foutrapport: array van { rij: number, fout: string }
  fouten: jsonb("fouten"),

  // Wie heeft geïmporteerd
  gebruikerId: integer("gebruiker_id"),

  // Het originele bestand in object storage (IMPORT_01 §2.3)
  bestandPad: text("bestand_pad"),

  // Terugdraai-administratie (IMPORT_01 §2.3)
  teruggedraaidOp: timestamp("teruggedraaid_op"),
  teruggedraaidDoor: integer("teruggedraaid_door"),
  // { verwijderd: number, niet_verwijderd: Array<{ id: number, reden: string }> }
  terugdraaiDetail: jsonb("terugdraai_detail"),

  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
});
