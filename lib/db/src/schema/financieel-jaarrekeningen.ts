import { pgTable, serial, text, integer, timestamp, boolean, jsonb, numeric, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { gebruikersTable } from "./gebruikers";

// ── VERTROUWELIJKE FINANCIELE JAARSTUKKEN ────────────────────────────────────
// Losse, apart afschermbare opslag voor (geconsolideerde) jaarrekeningen en
// financiele jaarstukken. Bewust GESCHEIDEN van de algemene documentenbibliotheek
// en van de Jaarrekening OHW (onderhanden-werk peildatumaggregatie) zodat toegang
// via het expliciete recht `financieel_vertrouwelijk` fail-closed afdwingbaar is.
//
// subtype:          geconsolideerd | enkelvoudig
// documentstatus:   definitief | concept | onbekend  (status van het jaarstuk zelf)
// extractie_status: niet_gestart | bezig | voltooid | mislukt
// dataset_status:   proposed | reviewed | approved | rejected | superseded
//                   (levenscyclus van de kerncijfer-dataset als geheel)
export const financieleDocumentenTable = pgTable("financiele_documenten", {
  id: serial("id").primaryKey(),
  // Bestand
  bestandsnaam: text("bestandsnaam").notNull(),
  titel: text("titel").notNull(),
  bestandspad: text("bestandspad").notNull(),
  bestandsgrootte: integer("bestandsgrootte"),
  mimetype: text("mimetype").notNull().default("application/octet-stream"),
  bestandsHash: text("bestands_hash"),
  // Classificatie
  documenttype: text("documenttype").notNull().default("jaarrekening"),
  entiteit: text("entiteit"),
  boekjaar: integer("boekjaar"),
  subtype: text("subtype").notNull().default("enkelvoudig"),
  documentstatus: text("documentstatus").notNull().default("onbekend"),
  beveiligingsprofiel: text("beveiligingsprofiel").notNull().default("FINANCIAL_CONFIDENTIAL"),
  opslaglocatie: text("opslaglocatie").notNull(),
  classificatieMethode: text("classificatie_methode").notNull().default("heuristiek"),
  betrouwbaarheid: text("betrouwbaarheid").notNull().default("laag"),
  betrouwbaarheidScore: integer("betrouwbaarheid_score").notNull().default(0),
  aiBewijs: jsonb("ai_bewijs"),
  gevondenGegevens: jsonb("gevonden_gegevens"),
  // Extractie + dataset-levenscyclus
  extractieStatus: text("extractie_status").notNull().default("niet_gestart"),
  datasetStatus: text("dataset_status").notNull().default("proposed"),
  // Versie-/duplicaatbeheer
  vervangtDocumentId: integer("vervangt_document_id"),
  isActueel: boolean("is_actueel").notNull().default(true),
  // Metadata
  geuploadDoor: integer("geupload_door").references(() => gebruikersTable.id, { onDelete: "set null" }),
  geuploadOp: timestamp("geupload_op").notNull().defaultNow(),
  goedgekeurdDoor: integer("goedgekeurd_door").references(() => gebruikersTable.id, { onDelete: "set null" }),
  goedgekeurdOp: timestamp("goedgekeurd_op"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
}, (t) => ({
  entiteitJaarIdx: index("financiele_documenten_entiteit_jaar_idx").on(t.entiteit, t.boekjaar, t.subtype),
  subtypeCheck: check("financiele_documenten_subtype_check", sql`${t.subtype} in ('geconsolideerd','enkelvoudig')`),
  documentstatusCheck: check("financiele_documenten_documentstatus_check", sql`${t.documentstatus} in ('definitief','concept','onbekend')`),
  datasetStatusCheck: check("financiele_documenten_dataset_status_check", sql`${t.datasetStatus} in ('proposed','reviewed','approved','rejected','superseded')`),
}));

export const insertFinancieelDocumentSchema = createInsertSchema(financieleDocumentenTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export type InsertFinancieelDocument = z.infer<typeof insertFinancieelDocumentSchema>;
export type FinancieelDocument = typeof financieleDocumentenTable.$inferSelect;

// ── FINANCIELE KERNCIJFERS (met ingebed bronbewijs per cijfer) ───────────────
// status: proposed | reviewed | approved | rejected | superseded
// Alleen 'approved' cijfers voeden het Meerjarenoverzicht.
// eenheid: euro | aantal | percentage | ratio
// Bronbewijs is 1-op-1 ingebed (bron_pagina/bron_tabel/bron_tekst/methode/confidence)
// zodat een cijfer nooit zonder herkomst definitief kan worden.
export const financieleKerncijfersTable = pgTable("financiele_kerncijfers", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => financieleDocumentenTable.id, { onDelete: "cascade" }),
  // Gedenormaliseerd voor snelle meerjaren-queries
  entiteit: text("entiteit"),
  boekjaar: integer("boekjaar"),
  geconsolideerd: boolean("geconsolideerd").notNull().default(false),
  // Cijfer
  sleutel: text("sleutel").notNull(),
  label: text("label").notNull(),
  waarde: numeric("waarde"),
  eenheid: text("eenheid").notNull().default("euro"),
  status: text("status").notNull().default("proposed"),
  isBerekend: boolean("is_berekend").notNull().default(false),
  uitgesloten: boolean("uitgesloten").notNull().default(false),
  // Handmatige correcties
  handmatigAangepast: boolean("handmatig_aangepast").notNull().default(false),
  oorspronkelijkeWaarde: numeric("oorspronkelijke_waarde"),
  // Bronbewijs
  bronPagina: integer("bron_pagina"),
  bronTabel: text("bron_tabel"),
  bronTekst: text("bron_tekst"),
  extractieMethode: text("extractie_methode").notNull().default("heuristiek"),
  confidence: numeric("confidence"),
  // Beoordeling
  beoordeeldDoor: integer("beoordeeld_door").references(() => gebruikersTable.id, { onDelete: "set null" }),
  beoordeeldOp: timestamp("beoordeeld_op"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
}, (t) => ({
  documentIdx: index("financiele_kerncijfers_document_idx").on(t.documentId),
  meerjarenIdx: index("financiele_kerncijfers_meerjaren_idx").on(t.entiteit, t.geconsolideerd, t.sleutel, t.status),
  statusCheck: check("financiele_kerncijfers_status_check", sql`${t.status} in ('proposed','reviewed','approved','rejected','superseded')`),
}));

export const insertFinancieelKerncijferSchema = createInsertSchema(financieleKerncijfersTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export type InsertFinancieelKerncijfer = z.infer<typeof insertFinancieelKerncijferSchema>;
export type FinancieelKerncijfer = typeof financieleKerncijfersTable.$inferSelect;

// ── AUDITLOG vertrouwelijke jaarstukken ──────────────────────────────────────
// actie: geupload | geclassificeerd | opgeslagen | geextraheerd | cijfer_aangepast |
//        cijfer_goedgekeurd | cijfer_afgewezen | dataset_goedgekeurd | vervangen |
//        gedownload | ingezien | rechten_gewijzigd
export const financieleDocumentLogTable = pgTable("financiele_document_log", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").references(() => financieleDocumentenTable.id, { onDelete: "cascade" }),
  actie: text("actie").notNull(),
  gebruikerId: integer("gebruiker_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  details: text("details"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
}, (t) => ({
  documentIdx: index("financiele_document_log_document_idx").on(t.documentId),
}));

export type FinancieelDocumentLog = typeof financieleDocumentLogTable.$inferSelect;
