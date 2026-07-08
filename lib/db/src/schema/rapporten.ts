import { pgTable, serial, text, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { gebouwenTable } from "./gebouwen";
import { gebruikersTable } from "./gebruikers";

export const opleverrapportenTable = pgTable("opleverrapporten", {
  id: serial("id").primaryKey(),
  gebouwId: integer("gebouw_id").notNull().references(() => gebouwenTable.id, { onDelete: "cascade" }),
  rapportType: text("rapport_type").notNull().default("opleverrapport"),
  versie: integer("versie").notNull().default(1),
  status: text("status").notNull().default("concept"),
  titel: text("titel"),
  secties: jsonb("secties").notNull().default({}),
  spotSelectie: jsonb("spot_selectie").notNull().default({}),
  bijlagenIds: jsonb("bijlagen_ids").notNull().default([]),
  tekeningIds: jsonb("tekening_ids").notNull().default([]),
  bevrorenOp: timestamp("bevroren_op"),
  bevrorenDocumentRevisies: jsonb("bevroren_document_revisies"),
  reactietermijnDatum: timestamp("reactietermijn_datum"),
  reactietermijnGestarteOp: timestamp("reactietermijn_gestart_op"),
  vervangenDoorRapportId: integer("vervangen_door_rapport_id"),
  vervangenOp: timestamp("vervangen_op"),
  certificaatGeaccordeerd: boolean("certificaat_geaccordeerd").notNull().default(false),
  certificaatGeaccordeerdOp: timestamp("certificaat_geaccordeerd_op"),
  certificaatGarantieMaanden: integer("certificaat_garantie_maanden").notNull().default(12),
  aangemaaktDoor: integer("aangemaakt_door").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});
