// Financiele contracten & polissen — Task #524 (AI Financieel Adviseur).
//
// Losstaand van de HRM-arbeidsovereenkomsten (schema/contracten.ts) en van de
// gebouw-gebonden onderhoudscontracten. Dit is de bedrijfsbrede laag voor
// zakelijke contracten: verzekeringen (polissen), lease, onderhoud, software,
// telecom en abonnementen. De AI-analyse (polisanalyse, kostenvergelijking,
// contractcoach) leunt op de bestaande documentintelligentie-pijplijn en het DMS
// (documentenTable) — het brondocument wordt NIET gedupliceerd maar gekoppeld.
//
// Kernprincipe: AI adviseert en signaleert, een mens beslist. De app zegt nooit
// zelfstandig contracten op of wijzigt ze. AccountView blijft leidend voor de
// boekhouding; deze laag levert alleen intelligentie en overzicht.
import { pgTable, serial, text, integer, real, boolean, timestamp, date, jsonb, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { gebruikersTable } from "./gebruikers";
import { documentenTable } from "./documenten";
import { werkgeversTable } from "./hrm";

// Contract/polis. categorie: verzekering | lease | onderhoud | software |
// telecom | abonnement | overig. kostenPeriode: maand | jaar | eenmalig.
// status: concept | actief | opgezegd | verlopen.
export const financieleContractenTable = pgTable("financiele_contracten", {
  id: serial("id").primaryKey(),
  categorie: text("categorie").notNull().default("overig"),
  naam: text("naam").notNull(),
  leverancier: text("leverancier"),
  werkgeverId: integer("werkgever_id").references(() => werkgeversTable.id, { onDelete: "set null" }),
  contractnummer: text("contractnummer"),
  ingangsdatum: date("ingangsdatum"),
  einddatum: date("einddatum"),
  opzegtermijnMaanden: integer("opzegtermijn_maanden"),
  kostenBedrag: real("kosten_bedrag"),
  kostenPeriode: text("kosten_periode").notNull().default("jaar"),
  indexeringPercentage: real("indexering_percentage"),
  indexeringMaand: integer("indexering_maand"),
  contractwaarde: real("contractwaarde"),
  automatischeVerlenging: boolean("automatische_verlenging").notNull().default(true),
  verlengingsduurMaanden: integer("verlengingsduur_maanden"),
  aantalLicenties: integer("aantal_licenties"),
  aantalInGebruik: integer("aantal_in_gebruik"),
  laatstGebruiktOp: date("laatst_gebruikt_op"),
  status: text("status").notNull().default("actief"),
  documentId: integer("document_id").references(() => documentenTable.id, { onDelete: "set null" }),
  notities: text("notities"),
  // AI-polisanalyse: vrije samenvatting + gestructureerd (dekking, uitsluitingen,
  // eigenRisico, looptijd, premie, clausules[], zekerheid, bewijs[]). Altijd
  // herleidbaar naar het brondocument.
  aiSamenvatting: text("ai_samenvatting"),
  aiAnalyse: jsonb("ai_analyse"),
  aiGeanalyseerdOp: timestamp("ai_geanalyseerd_op"),
  aangemaaktDoorId: integer("aangemaakt_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// Jaarlijkse kostensnapshot per contract — basis voor de kostenvergelijking en
// besparingsadviezen (bv. "18% duurder dan vorig jaar"). bron: handmatig | ai |
// document. Uniek per (contractId, jaar).
export const financieleContractKostenTable = pgTable(
  "financiele_contract_kosten",
  {
    id: serial("id").primaryKey(),
    contractId: integer("contract_id").notNull().references(() => financieleContractenTable.id, { onDelete: "cascade" }),
    jaar: integer("jaar").notNull(),
    bedrag: real("bedrag").notNull(),
    bron: text("bron").notNull().default("handmatig"),
    documentId: integer("document_id").references(() => documentenTable.id, { onDelete: "set null" }),
    notitie: text("notitie"),
    aangemaaktDoorId: integer("aangemaakt_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
    aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  },
  (t) => ({
    uniekContractJaar: unique("uniek_contract_jaar").on(t.contractId, t.jaar),
  }),
);

// Automatische signalering/herinnering per contract. type: einddatum |
// opzegtermijn | indexering | verlenging | ongebruikt | prijsstijging | overlap.
// ernst: info | waarschuwing | kritiek. status: nieuw | gezien | afgehandeld.
// dedupeSleutel voorkomt dubbele signaleringen bij herhaalde bewaking.
export const financieleContractSignaleringenTable = pgTable(
  "financiele_contract_signaleringen",
  {
    id: serial("id").primaryKey(),
    contractId: integer("contract_id").notNull().references(() => financieleContractenTable.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    ernst: text("ernst").notNull().default("info"),
    boodschap: text("boodschap").notNull(),
    aiAdvies: text("ai_advies"),
    bedrag: real("bedrag"),
    zekerheid: text("zekerheid"),
    dedupeSleutel: text("dedupe_sleutel").notNull(),
    status: text("status").notNull().default("nieuw"),
    gezienDoorId: integer("gezien_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
    gezienOp: timestamp("gezien_op"),
    aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  },
  (t) => ({
    uniekDedupe: unique("uniek_contract_signalering_dedupe").on(t.dedupeSleutel),
  }),
);

export const insertFinancieelContractSchema = createInsertSchema(financieleContractenTable).omit({
  id: true,
  aangemaaktOp: true,
  bijgewerktOp: true,
});
export const insertFinancieelContractKostenSchema = createInsertSchema(financieleContractKostenTable).omit({
  id: true,
  aangemaaktOp: true,
});
export const insertFinancieelContractSignaleringSchema = createInsertSchema(financieleContractSignaleringenTable).omit({
  id: true,
  aangemaaktOp: true,
});

export type InsertFinancieelContract = z.infer<typeof insertFinancieelContractSchema>;
export type InsertFinancieelContractKosten = z.infer<typeof insertFinancieelContractKostenSchema>;
export type InsertFinancieelContractSignalering = z.infer<typeof insertFinancieelContractSignaleringSchema>;

export type FinancieelContract = typeof financieleContractenTable.$inferSelect;
export type FinancieelContractKosten = typeof financieleContractKostenTable.$inferSelect;
export type FinancieelContractSignalering = typeof financieleContractSignaleringenTable.$inferSelect;
