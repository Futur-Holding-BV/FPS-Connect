import { pgTable, serial, text, integer, timestamp, boolean, jsonb, real, index, uniqueIndex } from "drizzle-orm/pg-core";
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
  vingerafdruk: text("vingerafdruk"),
  // Alleen true wanneer objectPath door de beveiligde Snagstream-uploadketen is uitgegeven.
  // Bestaande client-supplied paden blijven false en mogen nooit storagecleanup activeren.
  opslagBeheerd: boolean("opslag_beheerd").notNull().default(false),
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

// Kortlevende registratie tussen presigned upload en definitieve archiefopname.
// Alleen het gekoppelde gebruiker-token mag het object als Snagstream-PDF voltooien.
export const snagstreamUploadsTable = pgTable(
  "snagstream_uploads",
  {
    id: serial("id").primaryKey(),
    token: text("token").notNull().unique(),
    objectPath: text("object_path").notNull(),
    bestandsnaam: text("bestandsnaam").notNull(),
    vingerafdruk: text("vingerafdruk").notNull(),
    bestandsgrootte: integer("bestandsgrootte").notNull(),
    gebruikerId: integer("gebruiker_id").notNull().references(() => gebruikersTable.id, { onDelete: "cascade" }),
    verlooptOp: timestamp("verloopt_op").notNull(),
    opruimPogingen: integer("opruim_pogingen").notNull().default(0),
    opruimLaatstGeprobeerdOp: timestamp("opruim_laatst_geprobeerd_op"),
    opruimFout: text("opruim_fout"),
    aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("snagstream_uploads_object_path_unique_idx").on(table.objectPath),
    index("snagstream_uploads_verloopt_op_idx").on(table.verlooptOp),
  ],
);

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
