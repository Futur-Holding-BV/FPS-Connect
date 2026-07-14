import { pgTable, serial, text, integer, timestamp, real, boolean, unique, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { gebouwenTable, verdiepingenTable } from "./gebouwen";
import { gebruikersTable } from "./gebruikers";

export const voorzieningenTable = pgTable("voorzieningen", {
  id: serial("id").primaryKey(),
  objectnummer: text("objectnummer").notNull().unique(),
  qrCode: text("qr_code"),
  type: text("type").notNull(),
  status: text("status").notNull().default("concept"),
  classificatie: text("classificatie").notNull().default("60"),
  gebouwId: integer("gebouw_id").notNull().references(() => gebouwenTable.id, { onDelete: "cascade" }),
  verdiepingId: integer("verdieping_id").references(() => verdiepingenTable.id, { onDelete: "set null" }),
  ruimte: text("ruimte"),
  huisnummer: text("huisnummer"),
  locatieOmschrijving: text("locatie_omschrijving"),
  locatieX: real("locatie_x"),
  locatieY: real("locatie_y"),
  materialen: text("materialen"),
  opmerkingen: text("opmerkingen"),
  wbdbo: text("wbdbo"),
  wrd: text("wrd"),
  wandOfPlafond: text("wand_of_plafond"),
  // Logisch cluster (bv. schacht of strook). Zet op null bij verwijderen cluster.
  clusterId: integer("cluster_id"),
  monteurId: integer("monteur_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  makerMonteurId: integer("maker_monteur_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  controleurId: integer("controleur_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  installatieDatum: text("installatie_datum"),
  volgendeInspectie: text("volgende_inspectie"),
  aiTeControleren: boolean("ai_te_controleren").notNull().default(false),
  aiVoorstelId: integer("ai_voorstel_id"),
  // Gestructureerde lijst van doorvoer/applicaties (max 5) met hun toepassingen.
  // null = legacy spot (één type + voorziening_labels). Array = meerdere doorvoeren.
  applicaties: jsonb("applicaties").$type<SpotApplicatieItem[]>(),
  // Samengestelde constructie: als ingesteld is deze spot een onderdeel van de parent spot
  parentSpotId: integer("parent_spot_id"),
  gearchiveerd: boolean("gearchiveerd").notNull().default(false),
  gearchiveerdOp: timestamp("gearchiveerd_op"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export const insertVoorzieningSchema = createInsertSchema(voorzieningenTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export type InsertVoorziening = z.infer<typeof insertVoorzieningSchema>;
export type Voorziening = typeof voorzieningenTable.$inferSelect;

// ── APPLICATIES (genummerde typecatalogus, bv. "1.20 stalen buis") ──────────
// UI-benaming: "Applicatie". Code/benaming volgt de SnagStream-nummering.
export const voorzieningTypesTable = pgTable("voorziening_types", {
  code: text("code").primaryKey(),
  naam: text("naam").notNull(),
  categorie: text("categorie").notNull(),
  volgorde: integer("volgorde").notNull().default(0),
  actief: boolean("actief").notNull().default(true),
});
export type VoorzieningType = typeof voorzieningTypesTable.$inferSelect;

// ── TESTRAPPORTEN (bibliotheek met PDF's) ───────────────────────────────────
export const testrapportenTable = pgTable("testrapporten", {
  id: serial("id").primaryKey(),
  naam: text("naam").notNull(),
  fabrikant: text("fabrikant"),
  norm: text("norm"),
  rapportnummer: text("rapportnummer"),
  pdfUrl: text("pdf_url"),
  gearchiveerd: boolean("gearchiveerd").notNull().default(false),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});
export const insertTestrapportSchema = createInsertSchema(testrapportenTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export type InsertTestrapport = z.infer<typeof insertTestrapportSchema>;
export type Testrapport = typeof testrapportenTable.$inferSelect;

// ── TOEPASSINGEN (label = gebruikt product/producten, hoort bij een applicatie) ─
// UI-benaming: "Toepassing". Optioneel gekoppeld aan één testrapport.
export const labelsTable = pgTable("labels", {
  id: serial("id").primaryKey(),
  typeCode: text("type_code").references(() => voorzieningTypesTable.code, { onDelete: "set null" }),
  naam: text("naam").notNull(),
  // fabrikant = gedenormaliseerde naam (gevuld vanuit de gekoppelde fabrikant zodat
  // bestaande lezers blijven werken); fabrikantId = bron van waarheid voor de koppeling
  // naar de beheerde fabrikantenlijst. Bij hernoemen van een fabrikant wordt deze
  // tekst voor alle gekoppelde toepassingen bijgewerkt.
  fabrikant: text("fabrikant"),
  fabrikantId: integer("fabrikant_id").references(() => fabrikantenTable.id, { onDelete: "set null" }),
  testnorm: text("testnorm"),
  testrapportId: integer("testrapport_id").references(() => testrapportenTable.id, { onDelete: "set null" }),
  // Productfoto: een echte foto van het product om (beginnende) monteurs te helpen het
  // materiaal te herkennen. bron = 'ai' (door AI voorgesteld, nog te bevestigen) of
  // 'handmatig' (door beheerder geupload). geverifieerd = door een mens bevestigd.
  // zekerheid/uitleg leggen de AI-redenering vast voor de bevestig-stap.
  productFotoUrl: text("product_foto_url"),
  productFotoBron: text("product_foto_bron"),
  productFotoGeverifieerd: boolean("product_foto_geverifieerd").notNull().default(false),
  productFotoZekerheid: text("product_foto_zekerheid"),
  productFotoUitleg: text("product_foto_uitleg"),
  gearchiveerd: boolean("gearchiveerd").notNull().default(false),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});
export const insertLabelSchema = createInsertSchema(labelsTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export type InsertLabel = z.infer<typeof insertLabelSchema>;
export type Label = typeof labelsTable.$inferSelect;

// ── FABRIKANTEN (erkende leveranciers van brandpreventieve producten) ────────
export const fabrikantenTable = pgTable("fabrikanten", {
  id: serial("id").primaryKey(),
  naam: text("naam").notNull().unique(),
  url: text("url"),
  gearchiveerd: boolean("gearchiveerd").notNull().default(false),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});
export const insertFabrikantSchema = createInsertSchema(fabrikantenTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export type InsertFabrikant = z.infer<typeof insertFabrikantSchema>;
export type Fabrikant = typeof fabrikantenTable.$inferSelect;

// ── KOPPELING toepassing ↔ applicatie (many-to-many) ─────────────────────────
export const labelApplicatiesTable = pgTable("label_applicaties", {
  id: serial("id").primaryKey(),
  labelId: integer("label_id").notNull().references(() => labelsTable.id, { onDelete: "cascade" }),
  typeCode: text("type_code").notNull().references(() => voorzieningTypesTable.code, { onDelete: "cascade" }),
}, (t) => ({
  uniekPaar: unique().on(t.labelId, t.typeCode),
}));
export type LabelApplicatie = typeof labelApplicatiesTable.$inferSelect;

// ── KOPPELING voorziening ↔ toepassingen (meerdere per voorziening) ──────────
export const voorzieningLabelsTable = pgTable("voorziening_labels", {
  id: serial("id").primaryKey(),
  voorzieningId: integer("voorziening_id").notNull().references(() => voorzieningenTable.id, { onDelete: "cascade" }),
  labelId: integer("label_id").notNull().references(() => labelsTable.id, { onDelete: "cascade" }),
}, (t) => ({
  uniekePaar: unique().on(t.voorzieningId, t.labelId),
}));
export type VoorzieningLabel = typeof voorzieningLabelsTable.$inferSelect;

// Type voor de gestructureerde applicaties-kolom op een voorziening.
// Elk item vertegenwoordigt één doorvoer/applicatie met de bijbehorende toepassingen.
export interface SpotApplicatieItem {
  type_code: string;
  label_ids: number[];
}

export const fotosTable = pgTable("fotos", {
  id: serial("id").primaryKey(),
  voorzieningId: integer("voorziening_id").notNull().references(() => voorzieningenTable.id, { onDelete: "cascade" }),
  fase: text("fase").notNull(),
  url: text("url").notNull(),
  beschrijving: text("beschrijving"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
});

export const insertFotoSchema = createInsertSchema(fotosTable).omit({ id: true, aangemaaktOp: true });
export type InsertFoto = z.infer<typeof insertFotoSchema>;
export type Foto = typeof fotosTable.$inferSelect;

// ── AI-SPOTVOORSTELLEN (leerset + voorstel-snapshot per spot) ────────────────
// Onveranderlijk historisch trainingsrecord: het AI-voorstel en de uiteindelijk
// gekozen waarden worden als jsonb-snapshot bewaard (de catalogus evolueert).
export interface SpotAiVoorstelSnapshot {
  wand_of_plafond: string | null;
  type_code: string | null;
  type_naam: string | null;
  toelichting: string | null;
  betrouwbaarheid: string | null;
  observaties: string | null;
  toepassing_suggesties: { label_id: number; naam: string; fabrikant: string | null; score: number }[];
  document_id: number | null;
  document_naam: string | null;
}

export interface SpotAiGekozen {
  wand_of_plafond: string | null;
  type_code: string | null;
  label_ids: number[];
}

export const spotAiVoorstellenTable = pgTable("spot_ai_voorstellen", {
  id: serial("id").primaryKey(),
  voorzieningId: integer("voorziening_id").references(() => voorzieningenTable.id, { onDelete: "set null" }),
  gebouwId: integer("gebouw_id").references(() => gebouwenTable.id, { onDelete: "set null" }),
  fotoVoorUrl: text("foto_voor_url"),
  fotoNaUrl: text("foto_na_url"),
  voorstel: jsonb("voorstel").$type<SpotAiVoorstelSnapshot>(),
  gekozen: jsonb("gekozen").$type<SpotAiGekozen>(),
  afwijkingToepassing: boolean("afwijking_toepassing").notNull().default(false),
  beheerderBevestigdDoorId: integer("beheerder_bevestigd_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  beheerderBevestigdOp: timestamp("beheerder_bevestigd_op"),
  // null = nog niet beoordeeld; 'gebouwspecifiek' of 'generiek' na bevestiging.
  herkomst: text("herkomst"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});
export const insertSpotAiVoorstelSchema = createInsertSchema(spotAiVoorstellenTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export type InsertSpotAiVoorstel = z.infer<typeof insertSpotAiVoorstelSchema>;
export type SpotAiVoorstel = typeof spotAiVoorstellenTable.$inferSelect;

// ── CONSTRUCTIE TEMPLATES (samengestelde constructies, Bibliotheek) ──────────
export interface ConstructieTemplateOnderdeel {
  type: string;
  label: string;
  omschrijving?: string | null;
}

export const constructieTemplatesTable = pgTable("constructie_templates", {
  id: serial("id").primaryKey(),
  naam: text("naam").notNull(),
  omschrijving: text("omschrijving"),
  onderdelen: jsonb("onderdelen").$type<ConstructieTemplateOnderdeel[]>().notNull().default([]),
  aangemaaktDoorId: integer("aangemaakt_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});
export const insertConstructieTemplateSchema = createInsertSchema(constructieTemplatesTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export type InsertConstructieTemplate = z.infer<typeof insertConstructieTemplateSchema>;
export type ConstructieTemplateRecord = typeof constructieTemplatesTable.$inferSelect;

// ── SPOT STATUS CONFIGURATIE (per-omgeving aan/uit, weergavenaam) ────────────
// Administreert welke statuscodes in de UI beschikbaar zijn. De calculatie-
// statussen staan standaard op actief=false en worden pas ingeschakeld
// wanneer de Calculatie-module live gaat. Seed-data wordt via een SQL-migratie
// geladen (zie scripts/src/seed-spot-status-configuratie.ts).
export const spotStatusConfiguratieTable = pgTable("spot_status_configuratie", {
  statusCode: text("status_code").primaryKey(),
  weergaveNaam: text("weergave_naam").notNull(),
  volgorde: integer("volgorde").notNull().default(0),
  actief: boolean("actief").notNull().default(true),
  faseGroep: text("fase_groep").notNull().default("operationeel"),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});
export type SpotStatusConfiguratie = typeof spotStatusConfiguratieTable.$inferSelect;

// ── SPOT DOSSIERS (fase-specifieke dossierkaarten per spot) ─────────────────
// Elke spot kan meerdere dossiertypen hebben (opname, ai, calculatie,
// werkbegroting, uitvoering, oplevering). Het type is uniek per voorziening.
// De data-jsonb bevat fase-specifieke velden; de structuur evolueert per fase.
export const spotDossiersTable = pgTable("spot_dossiers", {
  id: serial("id").primaryKey(),
  voorzieningId: integer("voorziening_id").notNull().references(() => voorzieningenTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  status: text("status").notNull().default("concept"),
  data: jsonb("data").notNull().default({}),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
}, (t) => ({
  uniekPaar: unique().on(t.voorzieningId, t.type),
}));
export const insertSpotDossierSchema = createInsertSchema(spotDossiersTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export type InsertSpotDossier = z.infer<typeof insertSpotDossierSchema>;
export type SpotDossier = typeof spotDossiersTable.$inferSelect;

// ── CLUSTERS (logische groepering van spots, bv. schacht of strook) ──────────
// Een beheerder maakt een benoemd cluster en koppelt spots eraan (voorzieningen.cluster_id).
// verdiepingId optioneel: een cluster kan op één verdieping liggen of gebouwbreed zijn.
export const clustersTable = pgTable("clusters", {
  id: serial("id").primaryKey(),
  gebouwId: integer("gebouw_id").notNull().references(() => gebouwenTable.id, { onDelete: "cascade" }),
  verdiepingId: integer("verdieping_id").references(() => verdiepingenTable.id, { onDelete: "set null" }),
  naam: text("naam").notNull(),
  type: text("type"),
  kleur: text("kleur"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});
export const insertClusterSchema = createInsertSchema(clustersTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export type InsertCluster = z.infer<typeof insertClusterSchema>;
export type Cluster = typeof clustersTable.$inferSelect;
