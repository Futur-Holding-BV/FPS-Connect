import { pgTable, serial, text, integer, boolean, timestamp, numeric, uniqueIndex, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import { werkgeversTable } from "./hrm";
import { gebruikersTable } from "./gebruikers";

// Bedrijfsverzekeringen — polissen per FPS-onderneming
export const orgVerzekeringenTable = pgTable("org_verzekeringen", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  omschrijving: text("omschrijving"),
  maatschappij: text("maatschappij"),
  polisnummer: text("polisnummer"),
  premie: numeric("premie", { precision: 12, scale: 2 }),
  premieFrequentie: text("premie_frequentie").default("jaarlijks"),
  ingangsdatum: text("ingangsdatum"),
  vervaldatum: text("vervaldatum"),
  eigenRisico: numeric("eigen_risico", { precision: 12, scale: 2 }),
  status: text("status").notNull().default("actief"),
  opmerkingen: text("opmerkingen"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// Documenten per bedrijfsverzekering — polis, voorblad, premie-opbouw,
// uitsluitingen of overig; gearchiveerd=true verplaatst naar het archief.
export const orgVerzekeringDocumentenTable = pgTable("org_verzekering_documenten", {
  id: serial("id").primaryKey(),
  verzekeringId: integer("verzekering_id").notNull().references(() => orgVerzekeringenTable.id, { onDelete: "cascade" }),
  soort: text("soort").notNull().default("overig"),
  naam: text("naam").notNull(),
  bestandPad: text("bestand_pad").notNull(),
  gearchiveerd: boolean("gearchiveerd").notNull().default(false),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
});

export type OrgVerzekeringDocument = typeof orgVerzekeringDocumentenTable.$inferSelect;

// Jaarverslagen & jaarrekeningen per boekjaar
export const orgJaarverslagenTable = pgTable("org_jaarverslagen", {
  id: serial("id").primaryKey(),
  boekjaar: integer("boekjaar").notNull(),
  type: text("type").notNull(),
  omschrijving: text("omschrijving"),
  accountant: text("accountant"),
  definitief: boolean("definitief").notNull().default(false),
  vastgesteldOp: text("vastgesteld_op"),
  documentId: integer("document_id"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// Bedrijfsdocumenten — contracten, vergunningen, certificaten etc.
export const orgBedrijfsdocumentenTable = pgTable("org_bedrijfsdocumenten", {
  id: serial("id").primaryKey(),
  naam: text("naam").notNull(),
  categorie: text("categorie").notNull(),
  omschrijving: text("omschrijving"),
  uitgever: text("uitgever"),
  referentie: text("referentie"),
  ingangsdatum: text("ingangsdatum"),
  vervaldatum: text("vervaldatum"),
  status: text("status").notNull().default("actief"),
  documentId: integer("document_id"),
  opmerkingen: text("opmerkingen"),
  bestandHash: text("bestand_hash"),
  bestandPad: text("bestand_pad"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// AI categorie-correcties — leermechanisme voor de analyseer-route
export const aiCategorieCorrectiesTable = pgTable("ai_categorie_correcties", {
  id: serial("id").primaryKey(),
  hash: text("hash"),
  tekstFragment: text("tekst_fragment"),
  aiVoorstel: text("ai_voorstel").notNull(),
  gekozen: text("gekozen").notNull(),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
});

// AI veld-correcties — leermechanisme voor niet-categorie velden (naam, uitgever, referentie, etc.)
export const aiVeldCorrectiesTable = pgTable("ai_veld_correcties", {
  id: serial("id").primaryKey(),
  hash: text("hash"),
  tekstFragment: text("tekst_fragment"),
  veldNaam: text("veld_naam").notNull(),
  aiVoorstel: text("ai_voorstel").notNull(),
  gekozen: text("gekozen").notNull(),
  // Audit (migratie 0059): wie sloeg deze correctie in — herleidbaarheid tegen
  // vergiftiging van de leerdata. Bestaande rijen: NULL.
  gebruikerId: integer("gebruiker_id"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
});

// Document Intelligence correctie-leerloop — bewaart handmatige categorie-aanpassingen
// als referentievoorbeelden voor toekomstige vergelijkbare uploads.
export const documentClassificatieCorrectiesTable = pgTable("document_classificatie_correcties", {
  id: serial("id").primaryKey(),
  bestandshash: text("bestandshash"),
  origineleCategorie: text("originele_categorie").notNull(),
  gecorrigeerdeCategorie: text("gecorrigeerde_categorie").notNull(),
  werkmaatschappij: text("werkmaatschappij"),
  bewijsSignalen: jsonb("bewijs_signalen"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
});

// Document Studio — versiebeheerde modellen per (werkgever, documenttype).
// Meerdere rijen per (werkgever_id, document_type) zijn toegestaan (volledige
// versiehistorie: concept/goedgekeurd/gearchiveerd); een nieuwe upload maakt altijd
// een nieuwe concept-rij aan, het oude actieve model blijft ongewijzigd actief tot
// expliciete goedkeuring. Uniciteit van het ACTIEVE (status='goedgekeurd') model per
// (werkgever_id, document_type) wordt afgedwongen via een partial unique index
// (zie hieronder) — niet in de kolomdefinitie zelf, want die geldt voor alle rijen.
export const documentStudioModellenTable = pgTable("document_studio_modellen", {
  id: serial("id").primaryKey(),
  werkgeverId: integer("werkgever_id").notNull().references(() => werkgeversTable.id, { onDelete: "cascade" }),
  documentType: text("document_type").notNull(),
  naam: text("naam"),
  status: text("status").notNull().default("geen"),
  referentieBestandPad: text("referentie_bestand_pad"),
  connectTemplateJson: text("connect_template_json"),
  versie: integer("versie").notNull().default(1),
  goedgekeurdOp: timestamp("goedgekeurd_op"),
  goedgekeurdDoor: integer("goedgekeurd_door"),
  gearchiveerdOp: timestamp("gearchiveerd_op"),
  aangemaaktDoor: integer("aangemaakt_door").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("document_studio_modellen_actief_uniek")
    .on(t.werkgeverId, t.documentType)
    .where(sql`status = 'goedgekeurd'`),
]);

export const insertOrgVerzekeringSchema = createInsertSchema(orgVerzekeringenTable).omit({
  id: true,
  aangemaaktOp: true,
  bijgewerktOp: true,
});
export const insertOrgJaarverslagSchema = createInsertSchema(orgJaarverslagenTable).omit({
  id: true,
  aangemaaktOp: true,
  bijgewerktOp: true,
});
export const insertOrgBedrijfsdocumentSchema = createInsertSchema(orgBedrijfsdocumentenTable).omit({
  id: true,
  aangemaaktOp: true,
  bijgewerktOp: true,
});
export const insertDocumentStudioModelSchema = createInsertSchema(documentStudioModellenTable).omit({
  id: true,
  aangemaaktOp: true,
  bijgewerktOp: true,
});

export type OrgVerzekering = typeof orgVerzekeringenTable.$inferSelect;
export type InsertOrgVerzekering = z.infer<typeof insertOrgVerzekeringSchema>;
export type OrgJaarverslag = typeof orgJaarverslagenTable.$inferSelect;
export type InsertOrgJaarverslag = z.infer<typeof insertOrgJaarverslagSchema>;
export type OrgBedrijfsdocument = typeof orgBedrijfsdocumentenTable.$inferSelect;
export type InsertOrgBedrijfsdocument = z.infer<typeof insertOrgBedrijfsdocumentSchema>;
export type DocumentStudioModel = typeof documentStudioModellenTable.$inferSelect;
export type InsertDocumentStudioModel = z.infer<typeof insertDocumentStudioModelSchema>;
export type DocumentClassificatieCorrectie = typeof documentClassificatieCorrectiesTable.$inferSelect;
