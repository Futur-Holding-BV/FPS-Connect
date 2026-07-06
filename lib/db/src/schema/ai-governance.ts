import { pgTable, serial, integer, text, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";

export const aiPromptScansTable = pgTable("ai_prompt_scans", {
  id: serial("id").primaryKey(),
  gebruikerId: integer("gebruiker_id"),
  gebruikerNaam: text("gebruiker_naam"),
  rol: text("rol"),
  module: text("module").notNull(),
  functie: text("functie"),
  promptSamenvatting: text("prompt_samenvatting"),
  classificatie: text("classificatie").notNull().default("groen"),
  risicoScore: integer("risico_score").notNull().default(0),
  injectieGedetecteerd: boolean("injectie_gedetecteerd").notNull().default(false),
  injectieSignalen: jsonb("injectie_signalen"),
  beslissing: text("beslissing").notNull().default("toegestaan"),
  motivatie: text("motivatie"),
  aiAanroepId: integer("ai_aanroep_id"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
});

export const aiWijzigingsvoorstellenTable = pgTable("ai_wijzigingsvoorstellen", {
  id: serial("id").primaryKey(),
  promptScanId: integer("prompt_scan_id"),
  gebruikerId: integer("gebruiker_id"),
  gebruikerNaam: text("gebruiker_naam"),
  rol: text("rol"),
  titel: text("titel").notNull(),
  beschrijving: text("beschrijving").notNull(),
  impactanalyse: text("impactanalyse"),
  betrokkenModules: jsonb("betrokken_modules"),
  risicoNiveau: text("risico_niveau").notNull().default("oranje"),
  status: text("status").notNull().default("wacht"),
  goedgekeurdDoorId: integer("goedgekeurd_door_id"),
  goedgekeurdDoorNaam: text("goedgekeurd_door_naam"),
  opmerking: text("opmerking"),
  afgehandeldOp: timestamp("afgehandeld_op"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
});
