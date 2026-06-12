// Dossiermodule (Fase 1) — Parallel spoor, formeel akkoord gebruiker.
//
// Project-/gebouwdossier als laag bovenop de bestaande bibliotheek (documenten,
// versiebeheer via groepId/revisieNummer) en de gebouwarchivering. Documenten
// worden NIET gedupliceerd: een dossier groepeert verwijzingen naar bestaande
// bibliotheekdocumenten of losse uploads, met een eigen statusworkflow en
// definitieve archivering. De audittrail loopt via de bestaande activiteiten-log
// (logActiviteit), zodat er geen tweede logboek ontstaat.
import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { gebouwenTable } from "./gebouwen";
import { gebruikersTable } from "./gebruikers";
import { documentenTable } from "./documenten";

// Dossier — type project of gebouw. Statusworkflow concept -> in_behandeling ->
// ter_review -> definitief -> gearchiveerd. Bij definitief/gearchiveerd worden de
// tijdstippen vastgelegd (bevriezing van het dossier).
export const dossiersTable = pgTable("dossiers", {
  id: serial("id").primaryKey(),
  type: text("type").notNull().default("project"),
  gebouwId: integer("gebouw_id").references(() => gebouwenTable.id, { onDelete: "set null" }),
  naam: text("naam").notNull(),
  omschrijving: text("omschrijving"),
  status: text("status").notNull().default("concept"),
  definitiefOp: timestamp("definitief_op"),
  gearchiveerdOp: timestamp("gearchiveerd_op"),
  aangemaaktDoorId: integer("aangemaakt_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// Dossieritem — verwijst naar een bibliotheekdocument (documentId) of bevat een
// losse upload (bestandUrl). Heeft een eigen status binnen het dossier.
export const dossierDocumentenTable = pgTable("dossier_documenten", {
  id: serial("id").primaryKey(),
  dossierId: integer("dossier_id").notNull().references(() => dossiersTable.id, { onDelete: "cascade" }),
  documentId: integer("document_id").references(() => documentenTable.id, { onDelete: "set null" }),
  naam: text("naam").notNull(),
  bestandUrl: text("bestand_url"),
  categorie: text("categorie"),
  status: text("status").notNull().default("concept"),
  versie: integer("versie").notNull().default(1),
  toegevoegdDoorId: integer("toegevoegd_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  // ── Opleverdossier-bevriezing (V1.5) ──
  // Bij dossier 'definitief' wordt de actuele revisie + PDF van het gekoppelde
  // bibliotheekdocument hier vastgelegd, zodat latere revisies het bevroren
  // dossier niet meer wijzigen.
  bevrorenRevisieNummer: integer("bevroren_revisie_nummer"),
  bevrorenPdfUrl: text("bevroren_pdf_url"),
  bevrorenOp: timestamp("bevroren_op"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export const insertDossierSchema = createInsertSchema(dossiersTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export const insertDossierDocumentSchema = createInsertSchema(dossierDocumentenTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });

export type InsertDossier = z.infer<typeof insertDossierSchema>;
export type InsertDossierDocument = z.infer<typeof insertDossierDocumentSchema>;

export type Dossier = typeof dossiersTable.$inferSelect;
export type DossierDocument = typeof dossierDocumentenTable.$inferSelect;
