import { pgTable, serial, text, integer, real, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { gebouwenTable } from "./gebouwen";
import { gebruikersTable } from "./gebruikers";

export const ORG_TYPES = [
  "woningcorporatie",
  "vve_beheerder",
  "aannemer",
  "installateur",
  "vastgoedbeheerder",
  "adviseur",
  "gemeente",
  "zorginstelling",
  "onderwijsinstelling",
  "concurrent",
  "leverancier",
  "overig",
] as const;

export const RELATIE_STATUSSEN = ["onbekend", "koud", "warm", "actief", "key_account", "verloren"] as const;
export const FPS_BEDRIJVEN = ["FPS Bouw", "FPS Brandpreventie", "FPS Onderhoud"] as const;
export const BESLISROLLEN = ["beslisser", "beinvloeder", "inkoper", "technisch_adviseur", "projectmanager", "onbekend"] as const;
export const RELATIE_STERKTES = ["onbekend", "zwak", "normaal", "sterk"] as const;
export const KANS_TYPES = ["opname", "calculatie", "offerte", "onderhoudscontract", "brandpreventie", "bouwkundig_herstel", "rga", "droge_blusleiding"] as const;
export const KANS_FASEN = ["signaal", "eerste_contact", "afspraak", "opname", "calculatie", "offerte", "onderhandeling", "gewonnen", "verloren"] as const;

export const crmKlantenTable = pgTable("crm_klanten", {
  id: serial("id").primaryKey(),
  naam: text("naam").notNull(),
  type: text("type").default("overig"),
  kvk: text("kvk"),
  adres: text("adres"),
  postcode: text("postcode"),
  stad: text("stad"),
  regio: text("regio"),
  telefoon: text("telefoon"),
  email: text("email"),
  website: text("website"),
  linkedinUrl: text("linkedin_url"),
  branche: text("branche"),
  status: text("status").notNull().default("prospect"),
  relatieStatus: text("relatie_status").default("onbekend"),
  voorkeurFpsBedrijf: text("voorkeur_fps_bedrijf"),
  opmerkingen: text("opmerkingen"),
  voorkeursPresentatieNiveau: integer("voorkeurs_presentatie_niveau"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export const crmContactpersonenTable = pgTable("crm_contactpersonen", {
  id: serial("id").primaryKey(),
  klantId: integer("klant_id").references(() => crmKlantenTable.id, { onDelete: "cascade" }),
  naam: text("naam").notNull(),
  functie: text("functie"),
  email: text("email"),
  telefoon: text("telefoon"),
  mobiel: text("mobiel"),
  linkedinUrl: text("linkedin_url"),
  beslisrol: text("beslisrol").default("onbekend"),
  relatiesterkte: text("relatiesterkte").default("onbekend"),
  primair: boolean("primair").notNull().default(false),
  opmerkingen: text("opmerkingen"),
  laatste_contact_datum: text("laatste_contact_datum"),
  volgende_actie: text("volgende_actie"),
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
  gebouwId: integer("gebouw_id").references(() => gebouwenTable.id, { onDelete: "set null" }),
  titel: text("titel").notNull(),
  kansType: text("kans_type").default("offerte"),
  fase: text("fase").notNull().default("signaal"),
  waarde: real("waarde"),
  kans: integer("kans").default(50),
  verwachteDatum: text("verwachte_datum"),
  verwachteSluitdatum: text("verwachte_sluitdatum"), // legacy — data migreren naar verwachte_datum, daarna verwijderen
  verantwoordelijkeId: integer("verantwoordelijke_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  concurrentenBetrokken: text("concurrenten_betrokken"),
  volgendeActie: text("volgende_actie"),
  aiSamenvatting: text("ai_samenvatting"),
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

export const crmConcurrentenTable = pgTable("crm_concurrenten", {
  id: serial("id").primaryKey(),
  naam: text("naam").notNull(),
  website: text("website"),
  linkedinUrl: text("linkedin_url"),
  regio: text("regio"),
  bekende_klanten: text("bekende_klanten"),
  bekende_projecttypes: text("bekende_projecttypes"),
  sterke_punten: text("sterke_punten"),
  zwakke_punten: text("zwakke_punten"),
  where_we_encounter: text("where_we_encounter"),
  opmerkingen: text("opmerkingen"),
  aiSamenvatting: text("ai_samenvatting"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export const crmMarktintelligentieTable = pgTable("crm_marktintelligentie", {
  id: serial("id").primaryKey(),
  type: text("type").notNull().default("nieuws"),
  bronType: text("bron_type").notNull().default("handmatig"), // handmatig | ai_scan | scout
  organisatieId: integer("organisatie_id").references(() => crmKlantenTable.id, { onDelete: "set null" }),
  concurrentId: integer("concurrent_id").references(() => crmConcurrentenTable.id, { onDelete: "set null" }),
  titel: text("titel").notNull(),
  inhoud: text("inhoud"),
  bron: text("bron"),
  bronUrl: text("bron_url"),
  regio: text("regio"),
  datum: text("datum"),
  aangemaaktDoor: integer("aangemaakt_door").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export const crmScoutRunsTable = pgTable("crm_scout_runs", {
  id: serial("id").primaryKey(),
  gestartOp: timestamp("gestart_op").notNull().defaultNow(),
  afgerondOp: timestamp("afgerond_op"),
  status: text("status").notNull().default("bezig"), // bezig | voltooid | fout
  gevonden: integer("gevonden").default(0),
  opgeslagen: integer("opgeslagen").default(0),
  foutmelding: text("foutmelding"),
});

export const insertCrmKlantSchema = createInsertSchema(crmKlantenTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export type InsertCrmKlant = z.infer<typeof insertCrmKlantSchema>;
export type CrmKlant = typeof crmKlantenTable.$inferSelect;

export const insertCrmContactpersoonSchema = createInsertSchema(crmContactpersonenTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export type InsertCrmContactpersoon = z.infer<typeof insertCrmContactpersoonSchema>;
export type CrmContactpersoon = typeof crmContactpersonenTable.$inferSelect;

export const insertCrmCommercieelSchema = createInsertSchema(crmCommercieelTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export type InsertCrmCommercieel = z.infer<typeof insertCrmCommercieelSchema>;

export const insertCrmConcurrentSchema = createInsertSchema(crmConcurrentenTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export type InsertCrmConcurrent = z.infer<typeof insertCrmConcurrentSchema>;
export type CrmConcurrent = typeof crmConcurrentenTable.$inferSelect;

export const insertCrmMarktintelligentieSchema = createInsertSchema(crmMarktintelligentieTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export type InsertCrmMarktintelligentie = z.infer<typeof insertCrmMarktintelligentieSchema>;

export type CrmOpdracht = typeof crmOpdrachtenTable.$inferSelect;
export type CrmCommunicatie = typeof crmCommunicatieTable.$inferSelect;
export type CrmCommercieel = typeof crmCommercieelTable.$inferSelect;
export type CrmFinancieel = typeof crmFinancieelTable.$inferSelect;
