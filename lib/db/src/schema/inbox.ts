import { pgTable, serial, text, integer, real, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { gebruikersTable } from "./gebruikers";

export const INBOX_STATUSSEN = ["nieuw", "geanalyseerd", "ter_beoordeling", "goedgekeurd", "verplaatst", "afgewezen"] as const;
export const INBOX_BESTEMMINGEN = [
  "Gebouwen", "Projecten", "Opnames", "Calculaties", "Offertes", "Uitvoering",
  "Oplevering", "Onderhoud", "Productbibliotheek", "Certificaten", "Financieel",
  "HRM", "Wagenpark", "CRM", "DMS", "Snagstream", "Archief", "Onbekend",
] as const;
export const INBOX_CATEGORIEEN = [
  "gebouw_document", "project_document", "opname_document", "calculatie_document",
  "offerte_document", "opdrachtbevestiging", "uitvoering_document", "oplevering_rapport",
  "onderhoud_document", "product_certificaat", "eta_dop_brandclassificatie", "factuur",
  "inkoopbon", "leverancier_offerte", "hr_document", "medewerker_certificaat",
  "voertuig_document", "wagenpark_factuur", "crm_document", "contract",
  "snagstream_rapport", "jaarrekening", "onbekend",
] as const;
export const AI_BETROUWBAARHEDEN = ["hoog", "midden", "laag"] as const;

export const inboxItemsTable = pgTable("inbox_items", {
  id: serial("id").primaryKey(),
  bestandsnaam: text("bestandsnaam").notNull(),
  bestandspad: text("bestandspad").notNull(),
  bestandsgrootte: integer("bestandsgrootte"),
  mimetype: text("mimetype"),
  geuploadDoor: integer("geupload_door").references(() => gebruikersTable.id, { onDelete: "set null" }),
  geuploadOp: timestamp("geupload_op").notNull().defaultNow(),
  status: text("status").notNull().default("nieuw"),
  documentCategorie: text("document_categorie").default("onbekend"),
  bestemming: text("bestemming").default("Onbekend"),
  gekoppeldeEntiteitType: text("gekoppelde_entiteit_type"),
  gekoppeldeEntiteitId: integer("gekoppelde_entiteit_id"),
  gekoppeldeEntiteitNaam: text("gekoppelde_entiteit_naam"),
  aiBetrouwbaarheid: text("ai_betrouwbaarheid").default("laag"),
  aiSamenvatting: text("ai_samenvatting"),
  aiRedenering: text("ai_redenering"),
  aiMetadata: text("ai_metadata"),
  aiVolgendeActie: text("ai_volgende_actie"),
  aiOrganisatie: text("ai_organisatie"),
  aiJaar: integer("ai_jaar"),
  aiGeconsolideerd: boolean("ai_geconsolideerd").notNull().default(false),
  aiOpslaglocatie: text("ai_opslaglocatie"),
  aiBewijs: text("ai_bewijs"),
  duplicaatVan: integer("duplicaat_van"),
  mogelijkDuplicaat: boolean("mogelijk_duplicaat").notNull().default(false),
  goedgekeurdDoor: integer("goedgekeurd_door").references(() => gebruikersTable.id, { onDelete: "set null" }),
  goedgekeurdOp: timestamp("goedgekeurd_op"),
  afgewezenReden: text("afgewezen_reden"),
  verplaatstOp: timestamp("verplaatst_op"),
  opmerkingen: text("opmerkingen"),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
  snagstreamOpdrachtgever: text("snagstream_opdrachtgever"),
  snagstreamGebouw: text("snagstream_gebouw"),
  snagstreamProject: text("snagstream_project"),
  snagstreamRapportdatum: text("snagstream_rapportdatum"),
  snagstreamRapporttype: text("snagstream_rapporttype"),
  snagstreamStatus: text("snagstream_status"),
});

export const inboxAuditLogTable = pgTable("inbox_audit_log", {
  id: serial("id").primaryKey(),
  inboxItemId: integer("inbox_item_id").notNull().references(() => inboxItemsTable.id, { onDelete: "cascade" }),
  actie: text("actie").notNull(),
  gebruikerId: integer("gebruiker_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  details: text("details"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
});

export const insertInboxItemSchema = createInsertSchema(inboxItemsTable).omit({ id: true, geuploadOp: true, bijgewerktOp: true });
export type InsertInboxItem = z.infer<typeof insertInboxItemSchema>;
export type InboxItem = typeof inboxItemsTable.$inferSelect;
export type InboxAuditLog = typeof inboxAuditLogTable.$inferSelect;

// ── Aanvraag-planningen (bevestigingsmail + PL planning-bewaking) ─────────────

export const aanvraagPlanningenTable = pgTable("aanvraag_planningen", {
  id: serial("id").primaryKey(),
  inboxItemId: integer("inbox_item_id").references(() => inboxItemsTable.id, { onDelete: "cascade" }),
  offerteId: integer("offerte_id"),
  afzenderEmail: text("afzender_email"),
  afzenderNaam: text("afzender_naam"),
  // Wat de AI al herkende in de email (null = niet vermeld → vraag wél stellen)
  aiResponstermijn: text("ai_responstermijn"),
  aiOpname: text("ai_opname"),
  aiPlattegronden: text("ai_plattegronden"),
  // Antwoorden van de afzender (ingevuld via bevestigingsmail-link)
  gewensteResponstermijn: text("gewenste_responstermijn"),
  opnameNodig: text("opname_nodig"),
  plattegrondenStatus: text("plattegronden_status"),
  extraOpmerking: text("extra_opmerking"),
  antwoordToken: text("antwoord_token").notNull().unique(),
  bevestigingVerzondOp: timestamp("bevestiging_verzond_op"),
  antwoordenOntvangenOp: timestamp("antwoorden_ontvangen_op"),
  // PL-bewaking
  plPlanningDatum: text("pl_planning_datum"),
  plNotitie: text("pl_notitie"),
  plBijgewerktOp: timestamp("pl_bijgewerkt_op"),
  meldingVerzondOp: timestamp("melding_verzond_op"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export type AanvraagPlanning = typeof aanvraagPlanningenTable.$inferSelect;
