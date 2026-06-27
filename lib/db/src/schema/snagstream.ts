import { pgTable, serial, text, integer, timestamp, boolean, jsonb, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { gebouwenTable } from "./gebouwen";
import { gebruikersTable } from "./gebruikers";
import { voorzieningenTable } from "./voorzieningen";

// Status van een Snagstream-rapport in het archief
// nieuw → ai_uitgelezen → concept_herkend → gekoppeld → deels_geimporteerd → volledig_geimporteerd | fout
export const snagstreamRapportenTable = pgTable("snagstream_rapporten", {
  id: serial("id").primaryKey(),
  bestandsnaam: text("bestandsnaam").notNull(),
  pdfUrl: text("pdf_url").notNull(),
  rapportdatum: text("rapportdatum"),
  opdrachtgever: text("opdrachtgever"),
  projectNaam: text("project_naam"),
  status: text("status").notNull().default("nieuw"),
  gebouwId: integer("gebouw_id").references(() => gebouwenTable.id, { onDelete: "set null" }),
  aiMetadata: jsonb("ai_metadata"),
  uploaderId: integer("uploader_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export const insertSnagstreamRapportSchema = createInsertSchema(snagstreamRapportenTable).omit({
  id: true,
  aangemaaktOp: true,
  bijgewerktOp: true,
});
export type InsertSnagstreamRapport = z.infer<typeof insertSnagstreamRapportSchema>;
export type SnagstreamRapport = typeof snagstreamRapportenTable.$inferSelect;

// Individuele snag/spot uit een Snagstream PDF-rapport (read-only historisch archief)
export const snagstreamSnagsTable = pgTable("snagstream_snags", {
  id: serial("id").primaryKey(),
  rapportId: integer("rapport_id").notNull().references(() => snagstreamRapportenTable.id, { onDelete: "cascade" }),
  snagnummer: text("snagnummer"),
  verdieping: text("verdieping"),
  ruimte: text("ruimte"),
  omschrijving: text("omschrijving"),
  typeNaam: text("type_naam"),
  applicatieNaam: text("applicatie_naam"),
  labelNaam: text("label_naam"),
  toepassingNaam: text("toepassing_naam"),
  classificatie: text("classificatie"),
  statusOrigineel: text("status_origineel"),
  opmerkingen: text("opmerkingen"),
  fotoUrl: text("foto_url"),
  pdfPagina: integer("pdf_pagina"),
  pdfX: real("pdf_x"),
  pdfY: real("pdf_y"),
  confidenceScores: jsonb("confidence_scores"),
  overgenomen: boolean("overgenomen").notNull().default(false),
  overgenomenAlsVoorzieningId: integer("overgenomen_als_voorziening_id").references(() => voorzieningenTable.id, { onDelete: "set null" }),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
});

export const insertSnagstreamSnagSchema = createInsertSchema(snagstreamSnagsTable).omit({
  id: true,
  aangemaaktOp: true,
});
export type InsertSnagstreamSnag = z.infer<typeof insertSnagstreamSnagSchema>;
export type SnagstreamSnag = typeof snagstreamSnagsTable.$inferSelect;
