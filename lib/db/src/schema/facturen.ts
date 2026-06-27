import { pgTable, serial, text, integer, timestamp, boolean, numeric, jsonb, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { gebouwenTable } from "./gebouwen";
import { gebruikersTable } from "./gebruikers";

// ── AccountView instellingen (singleton per installatie) ──────────────────────
export const accountviewInstellingenTable = pgTable("accountview_instellingen", {
  id: serial("id").primaryKey(),
  apiEndpoint: text("api_endpoint"),
  administratiecode: text("administratiecode"),
  apiGebruiker: text("api_gebruiker"),
  apiKey: text("api_key"),
  testmodus: boolean("testmodus").notNull().default(true),
  dagboekInkoop: text("dagboek_inkoop").default("INK"),
  dagboekVerkoop: text("dagboek_verkoop").default("VRK"),
  grootboekStandaard: text("grootboek_standaard"),
  btwCodes: jsonb("btw_codes").default("{}"),
  kostenplaatsen: jsonb("kostenplaatsen").default("{}"),
  debiteuerMapping: jsonb("debiteur_mapping").default("{}"),
  crediteurMapping: jsonb("crediteur_mapping").default("{}"),
  exportActief: boolean("export_actief").notNull().default(false),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export type AccountviewInstellingen = typeof accountviewInstellingenTable.$inferSelect;

// ── Facturen ──────────────────────────────────────────────────────────────────
// Status-lifecycle:
//   ontvangen → ai_gelezen → controle_nodig | klaar_voor_boeking | afgekeurd
//   → klaar_voor_accountview → verzonden_naar_accountview | fout_bij_verzending → verwerkt
//   Geblokkeerd kan op elk moment worden gezet.
export const facturenTable = pgTable("facturen", {
  id: serial("id").primaryKey(),

  // Type
  type: text("type").notNull().default("inkoop"), // inkoop | verkoop

  // Basisgegevens
  factuurnummer: text("factuurnummer"),
  factuurdatum: text("factuurdatum"),
  vervaldatum: text("vervaldatum"),
  omschrijving: text("omschrijving"),

  // Partijen
  relatienaam: text("relatienaam"),         // crediteur (inkoop) of debiteur (verkoop)
  relatieCode: text("relatie_code"),        // AccountView debiteuren/crediteurencode
  relatieAdres: text("relatie_adres"),

  // Bedragen
  bedragExclBtw: numeric("bedrag_excl_btw", { precision: 12, scale: 2 }),
  btwBedrag: numeric("btw_bedrag", { precision: 12, scale: 2 }),
  bedragInclBtw: numeric("bedrag_incl_btw", { precision: 12, scale: 2 }),

  // Boekhoudkundige velden
  btwCode: text("btw_code"),
  grootboekrekening: text("grootboekrekening"),
  kostenplaats: text("kostenplaats"),
  dagboek: text("dagboek"),
  projectCode: text("project_code"),

  // PDF-bestand
  pdfUrl: text("pdf_url"),
  bestandsnaam: text("bestandsnaam"),

  // Koppelingen
  gebouwId: integer("gebouw_id").references(() => gebouwenTable.id, { onDelete: "set null" }),
  leverancierId: integer("leverancier_id"),
  projectId: integer("project_id"),

  // AI-uitgelezen metadata
  aiMetadata: jsonb("ai_metadata"),

  // Status
  status: text("status").notNull().default("ontvangen"),
  // ontvangen | ai_gelezen | controle_nodig | klaar_voor_boeking | afgekeurd
  // klaar_voor_accountview | verzonden_naar_accountview | fout_bij_verzending | verwerkt
  geblokkeerd: boolean("geblokkeerd").notNull().default(false),
  blokkeringReden: text("blokkering_reden"),

  // Afkeuring
  afgekeurdReden: text("afkeuring_reden"),
  afgekeurdOp: timestamp("afgekeurd_op"),
  afgekeurdDoor: integer("afgekeurd_door").references(() => gebruikersTable.id, { onDelete: "set null" }),

  // AccountView export
  accountviewBoekingId: text("accountview_boeking_id"),
  accountviewExportOp: timestamp("accountview_export_op"),
  accountviewStatus: text("accountview_status"),
  accountviewFout: text("accountview_fout"),
  payloadHash: text("payload_hash"),

  // Terugkoppeling betaalstatus
  betaalstatus: text("betaalstatus"),     // openstaand | betaald | deels_betaald
  betaaldatum: text("betaaldatum"),
  boekingsnummer: text("boekingsnummer"), // AccountView boekingsnummer
  terugkoppelingOp: timestamp("terugkoppeling_op"),

  // Herexport
  herexportOp: timestamp("herexport_op"),
  herexportDoor: integer("herexport_door").references(() => gebruikersTable.id, { onDelete: "set null" }),
  herexportReden: text("herexport_reden"),

  // Beheer
  uploaderId: integer("uploader_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  geaccordeerd: boolean("geaccordeerd").notNull().default(false),
  geaccordeerdOp: timestamp("geaccordeerd_op"),
  geaccordeerdDoor: integer("geaccordeerd_door").references(() => gebruikersTable.id, { onDelete: "set null" }),

  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export const insertFactuurSchema = createInsertSchema(facturenTable).omit({
  id: true, aangemaaktOp: true, bijgewerktOp: true,
});
export type InsertFactuur = z.infer<typeof insertFactuurSchema>;
export type Factuur = typeof facturenTable.$inferSelect;

// ── AccountView export logs ───────────────────────────────────────────────────
export const accountviewExportLogsTable = pgTable("accountview_export_logs", {
  id: serial("id").primaryKey(),
  factuurId: integer("factuur_id").notNull().references(() => facturenTable.id, { onDelete: "cascade" }),

  // Exportpoging
  gebruikerId: integer("gebruiker_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  exportOp: timestamp("export_op").notNull().defaultNow(),
  testmodus: boolean("testmodus").notNull().default(true),
  actie: text("actie").notNull().default("export"), // export | herexport | sync | afkeuren | accorderen

  // Payload & response
  verzondenPayload: jsonb("verzonden_payload"),
  accountviewResponse: jsonb("accountview_response"),
  httpStatus: integer("http_status"),
  payloadHash: text("payload_hash"),

  // Uitkomst
  status: text("status").notNull().default("bezig"),  // bezig | geslaagd | mislukt
  accountviewBoekingId: text("accountview_boeking_id"),
  foutmelding: text("foutmelding"),
  aangemeldDoorGebruiker: text("aangemeld_door_gebruiker"),
});

export type AccountviewExportLog = typeof accountviewExportLogsTable.$inferSelect;

// ── AccountView relatie-mapping ───────────────────────────────────────────────
export const accountviewRelatieMappingTable = pgTable("accountview_relatie_mapping", {
  id: serial("id").primaryKey(),
  connectRelatienaam: text("connect_relatienaam").notNull(),
  accountviewCode: text("accountview_code").notNull(),
  type: text("type").notNull().default("crediteur"), // crediteur | debiteur
  opmerking: text("opmerking"),
  bestaatInAccountview: boolean("bestaat_in_accountview").notNull().default(false),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export type AccountviewRelatieMapping = typeof accountviewRelatieMappingTable.$inferSelect;

// ── AccountView project/kostenplaats-mapping ──────────────────────────────────
export const accountviewProjectMappingTable = pgTable("accountview_project_mapping", {
  id: serial("id").primaryKey(),
  connectProjectCode: text("connect_project_code").notNull(),
  connectGebouwNaam: text("connect_gebouw_naam"),
  accountviewProjectcode: text("accountview_projectcode"),
  accountviewKostenplaats: text("accountview_kostenplaats"),
  opmerking: text("opmerking"),
  exportZonderMapping: boolean("export_zonder_mapping").notNull().default(false),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export type AccountviewProjectMapping = typeof accountviewProjectMappingTable.$inferSelect;
