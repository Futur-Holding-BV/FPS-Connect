import { pgTable, serial, text, integer, real, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { gebouwenTable } from "./gebouwen";
import { gebruikersTable } from "./gebruikers";

export const crmKlantenTable = pgTable("crm_klanten", {
  id: serial("id").primaryKey(),
  naam: text("naam").notNull(),
  kvk: text("kvk"),
  adres: text("adres"),
  postcode: text("postcode"),
  stad: text("stad"),
  telefoon: text("telefoon"),
  email: text("email"),
  website: text("website"),
  branche: text("branche"),
  status: text("status").notNull().default("prospect"),
  opmerkingen: text("opmerkingen"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export const crmContactpersonenTable = pgTable("crm_contactpersonen", {
  id: serial("id").primaryKey(),
  klantId: integer("klant_id").notNull().references(() => crmKlantenTable.id, { onDelete: "cascade" }),
  naam: text("naam").notNull(),
  functie: text("functie"),
  email: text("email"),
  telefoon: text("telefoon"),
  mobiel: text("mobiel"),
  primair: boolean("primair").notNull().default(false),
  opmerkingen: text("opmerkingen"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export const crmOpdrachtenTable = pgTable("crm_opdrachten", {
  id: serial("id").primaryKey(),
  klantId: integer("klant_id").notNull().references(() => crmKlantenTable.id, { onDelete: "cascade" }),
  gebouwId: integer("gebouw_id").references(() => gebouwenTable.id, { onDelete: "set null" }),
  titel: text("titel").notNull(),
  omschrijving: text("omschrijving"),
  status: text("status").notNull().default("nieuw"),
  waarde: real("waarde"),
  startDatum: text("start_datum"),
  eindDatum: text("eind_datum"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export const crmCommunicatieTable = pgTable("crm_communicatie", {
  id: serial("id").primaryKey(),
  klantId: integer("klant_id").notNull().references(() => crmKlantenTable.id, { onDelete: "cascade" }),
  contactpersoonId: integer("contactpersoon_id").references(() => crmContactpersonenTable.id, { onDelete: "set null" }),
  type: text("type").notNull().default("notitie"),
  onderwerp: text("onderwerp").notNull(),
  inhoud: text("inhoud"),
  datum: text("datum"),
  gebruikerId: integer("gebruiker_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
});

export const crmCommercieelTable = pgTable("crm_commercieel", {
  id: serial("id").primaryKey(),
  klantId: integer("klant_id").notNull().references(() => crmKlantenTable.id, { onDelete: "cascade" }),
  titel: text("titel").notNull(),
  fase: text("fase").notNull().default("lead"),
  waarde: real("waarde"),
  kans: integer("kans"),
  verwachteSluitdatum: text("verwachte_sluitdatum"),
  opmerkingen: text("opmerkingen"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export const crmFinancieelTable = pgTable("crm_financieel", {
  id: serial("id").primaryKey(),
  klantId: integer("klant_id").notNull().references(() => crmKlantenTable.id, { onDelete: "cascade" }),
  type: text("type").notNull().default("factuur"),
  omschrijving: text("omschrijving"),
  bedrag: real("bedrag"),
  status: text("status").notNull().default("concept"),
  factuurnummer: text("factuurnummer"),
  datum: text("datum"),
  vervaldatum: text("vervaldatum"),
  opmerkingen: text("opmerkingen"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export const insertCrmKlantSchema = createInsertSchema(crmKlantenTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export type InsertCrmKlant = z.infer<typeof insertCrmKlantSchema>;
export type CrmKlant = typeof crmKlantenTable.$inferSelect;

export type CrmContactpersoon = typeof crmContactpersonenTable.$inferSelect;
export type CrmOpdracht = typeof crmOpdrachtenTable.$inferSelect;
export type CrmCommunicatie = typeof crmCommunicatieTable.$inferSelect;
export type CrmCommercieel = typeof crmCommercieelTable.$inferSelect;
export type CrmFinancieel = typeof crmFinancieelTable.$inferSelect;
