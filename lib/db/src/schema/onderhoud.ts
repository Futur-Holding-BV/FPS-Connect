import { pgTable, serial, text, integer, timestamp, boolean, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { gebouwenTable } from "./gebouwen";
import { voorzieningenTable } from "./voorzieningen";
import { gebruikersTable } from "./gebruikers";

export const onderhoudTable = pgTable("onderhoud", {
  id: serial("id").primaryKey(),
  voorzieningId: integer("voorziening_id").references(() => voorzieningenTable.id, { onDelete: "set null" }),
  gebouwId: integer("gebouw_id").references(() => gebouwenTable.id, { onDelete: "set null" }),
  titel: text("titel").notNull(),
  omschrijving: text("omschrijving"),
  prioriteit: text("prioriteit").notNull().default("normaal"),
  status: text("status").notNull().default("open"),
  toegewezenAanId: integer("toegewezen_aan_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  deadline: text("deadline"),
  voltooidDatum: text("voltooid_datum"),
  resultaat: text("resultaat"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export const insertOnderhoudSchema = createInsertSchema(onderhoudTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export type InsertOnderhoud = z.infer<typeof insertOnderhoudSchema>;
export type OnderhoudTaak = typeof onderhoudTable.$inferSelect;

// ── Onderhoudscontracten ───────────────────────────────────────────────────────

export const onderhoudscontractenTable = pgTable("onderhoudscontracten", {
  id: serial("id").primaryKey(),
  contractnummer: text("contractnummer").notNull().unique(),
  gebouwId: integer("gebouw_id").references(() => gebouwenTable.id, { onDelete: "set null" }),
  opdrachtgever: text("opdrachtgever"),
  contactpersoonNaam: text("contactpersoon_naam"),
  contactpersoonEmail: text("contactpersoon_email"),
  contactpersoonTelefoon: text("contactpersoon_telefoon"),
  contracttype: text("contracttype").notNull().default("preventief"),
  ingangsdatum: text("ingangsdatum"),
  einddatum: text("einddatum"),
  looptijdMaanden: integer("looptijd_maanden"),
  automatischeVerlenging: boolean("automatische_verlenging").notNull().default(false),
  opzegtermijnMaanden: integer("opzegtermijn_maanden"),
  indexering: text("indexering").notNull().default("geen"),
  indexeringPercentage: numeric("indexering_percentage", { precision: 5, scale: 2 }),
  contractwaarde: numeric("contractwaarde", { precision: 12, scale: 2 }),
  facturatieFrequentie: text("facturatie_frequentie").notNull().default("jaarlijks_vooraf"),
  onderhoudsFrequentie: text("onderhouds_frequentie").notNull().default("jaarlijks"),
  eerstvolgendOnderhoud: text("eerstvolgende_onderhoud"),
  laatste_onderhoud: text("laatste_onderhoud"),
  status: text("status").notNull().default("concept"),
  notities: text("notities"),
  aangemaaktDoorId: integer("aangemaakt_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export const insertOnderhoudscontractSchema = createInsertSchema(onderhoudscontractenTable).omit({
  id: true, aangemaaktOp: true, bijgewerktOp: true, aangemaaktDoorId: true,
});
export type InsertOnderhoudscontract = z.infer<typeof insertOnderhoudscontractSchema>;
export type Onderhoudscontract = typeof onderhoudscontractenTable.$inferSelect;

// ── Werkbonnen ─────────────────────────────────────────────────────────────────

export const werkbonnenTable = pgTable("werkbonnen", {
  id: serial("id").primaryKey(),
  werkbonnummer: text("werkbonnummer").notNull().unique(),
  contractId: integer("contract_id").references(() => onderhoudscontractenTable.id, { onDelete: "set null" }),
  gebouwId: integer("gebouw_id").references(() => gebouwenTable.id, { onDelete: "set null" }),
  titel: text("titel").notNull(),
  omschrijving: text("omschrijving"),
  type: text("type").notNull().default("preventief"),
  geplande_kwartaal: text("geplande_kwartaal"),
  geplande_periode_van: text("geplande_periode_van"),
  geplande_periode_tot: text("geplande_periode_tot"),
  geplandeDatum: text("geplande_datum"),
  uitvoerDatum: text("uitvoer_datum"),
  monteurId: integer("monteur_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  duurUren: numeric("duur_uren", { precision: 5, scale: 1 }),
  status: text("status").notNull().default("gepland"),
  opmerkingen: text("opmerkingen"),
  resultaat: text("resultaat"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export const insertWerkbonSchema = createInsertSchema(werkbonnenTable).omit({
  id: true, aangemaaktOp: true, bijgewerktOp: true,
});
export type InsertWerkbon = z.infer<typeof insertWerkbonSchema>;
export type Werkbon = typeof werkbonnenTable.$inferSelect;
