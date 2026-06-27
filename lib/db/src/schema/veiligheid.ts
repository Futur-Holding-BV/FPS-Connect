import { pgTable, serial, text, integer, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";
import { gebruikersTable } from "./gebruikers";

export const veiligheidToolboxenTable = pgTable("veiligheid_toolboxen", {
  id: serial("id").primaryKey(),
  titel: text("titel").notNull(),
  categorie: text("categorie").notNull().default("overig"),
  moeilijkheid: text("moeilijkheid").notNull().default("gemiddeld"),
  geschatteLeestijd: integer("geschatte_leestijd"),
  intro: text("intro"),
  aiSamenvatting: text("ai_samenvatting"),
  aiRisicos: jsonb("ai_risicos").notNull().default([]),
  aiMaatregelen: jsonb("ai_maatregelen").notNull().default([]),
  aiFouten: jsonb("ai_fouten").notNull().default([]),
  aiStoppen: text("ai_stoppen"),
  pdfPad: text("pdf_pad"),
  videoUrl: text("video_url"),
  afbeeldingen: jsonb("afbeeldingen").notNull().default([]),
  minScore: integer("min_score").notNull().default(70),
  geldigheidMaanden: integer("geldigheid_maanden").notNull().default(12),
  gepubliceerd: boolean("gepubliceerd").notNull().default(false),
  verplicht: boolean("verplicht").notNull().default(false),
  doelgroep: text("doelgroep").notNull().default("iedereen"),
  doelgroepDetails: jsonb("doelgroep_details").notNull().default({}),
  aangemaaktDoorId: integer("aangemaakt_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aiVerwerktOp: timestamp("ai_verwerkt_op"),
  zoekwoorden: jsonb("zoekwoorden").notNull().default([]),
  tags: jsonb("tags").notNull().default([]),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export const veiligheidToolboxVragenTable = pgTable("veiligheid_toolbox_vragen", {
  id: serial("id").primaryKey(),
  toolboxId: integer("toolbox_id").notNull().references(() => veiligheidToolboxenTable.id, { onDelete: "cascade" }),
  volgorde: integer("volgorde").notNull().default(0),
  vraag: text("vraag").notNull(),
  opties: jsonb("opties").notNull().default([]),
  uitleg: text("uitleg"),
});

export const veiligheidToolboxAfrondingTable = pgTable("veiligheid_toolbox_afrondingen", {
  id: serial("id").primaryKey(),
  toolboxId: integer("toolbox_id").notNull().references(() => veiligheidToolboxenTable.id, { onDelete: "cascade" }),
  gebruikerId: integer("gebruiker_id").notNull().references(() => gebruikersTable.id, { onDelete: "cascade" }),
  score: integer("score").notNull(),
  maxScore: integer("max_score").notNull(),
  handtekening: text("handtekening"),
  bevestigdOp: timestamp("bevestigd_op").notNull().defaultNow(),
  geldigTot: timestamp("geldig_tot"),
});

export type VeiligheidToolbox = typeof veiligheidToolboxenTable.$inferSelect;
export type VeiligheidToolboxVraag = typeof veiligheidToolboxVragenTable.$inferSelect;
export type VeiligheidToolboxAfronding = typeof veiligheidToolboxAfrondingTable.$inferSelect;
