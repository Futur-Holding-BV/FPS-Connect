import { pgTable, serial, text, integer, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";

export const toolboxBerichtenTable = pgTable("toolbox_berichten", {
  id: serial("id").primaryKey(),
  titel: text("titel").notNull(),
  inhoud: text("inhoud").notNull(),
  bijlagen: jsonb("bijlagen").notNull().default([]),
  doelgroep: text("doelgroep").notNull().default("iedereen"),
  doelgroepGebruikerId: integer("doelgroep_gebruiker_id"),
  aangemaaktDoorId: integer("aangemaakt_door_id"),
  gepubliceerd: boolean("gepubliceerd").notNull().default(false),
  gepubliceerdOp: timestamp("gepubliceerd_op"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
  // AI-classificatie en archivering
  isBelangrijk: boolean("is_belangrijk"),
  gearchiveerd: boolean("gearchiveerd").notNull().default(false),
  gearchivierdOp: timestamp("gearchiveerd_op"),
  aiVerwerktOp: timestamp("ai_verwerkt_op"),
  koppelingen: jsonb("koppelingen").notNull().default([]),
});

export const leesbevestigingenTable = pgTable("leesbevestigingen", {
  id: serial("id").primaryKey(),
  berichtId: integer("bericht_id").notNull(),
  gebruikerId: integer("gebruiker_id").notNull(),
  bevestigdOp: timestamp("bevestigd_op").notNull().defaultNow(),
});

export type ToolboxBericht = typeof toolboxBerichtenTable.$inferSelect;
export type LeesBevestiging = typeof leesbevestigingenTable.$inferSelect;
