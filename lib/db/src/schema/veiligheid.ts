import { pgTable, serial, text, integer, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";
import { gebruikersTable } from "./gebruikers";
import { gebouwenTable } from "./gebouwen";
import { medewerkersTable } from "./hrm";

export const veiligheidToolboxenTable = pgTable("veiligheid_toolboxen", {
  id: serial("id").primaryKey(),
  titel: text("titel").notNull(),
  categorie: text("categorie").notNull().default("overig"),
  moeilijkheid: text("moeilijkheid").notNull().default("gemiddeld"),
  geschatteLeestijd: integer("geschatte_leestijd"),
  intro: text("intro"),
  aiSamenvatting: text("ai_samenvatting"),
  aiRisicos: jsonb("ai_risicos").notNull().default([]),
  aiMaatregelen: jsonb("ai_maatregelen").notNull().default([]),
  aiFouten: jsonb("ai_fouten").notNull().default([]),
  aiStoppen: text("ai_stoppen"),
  pdfPad: text("pdf_pad"),
  videoUrl: text("video_url"),
  afbeeldingen: jsonb("afbeeldingen").notNull().default([]),
  minScore: integer("min_score").notNull().default(70),
  geldigheidMaanden: integer("geldigheid_maanden").notNull().default(12),
  gepubliceerd: boolean("gepubliceerd").notNull().default(false),
  verplicht: boolean("verplicht").notNull().default(false),
  doelgroep: text("doelgroep").notNull().default("iedereen"),
  doelgroepDetails: jsonb("doelgroep_details").notNull().default({}),
  aangemaaktDoorId: integer("aangemaakt_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aiVerwerktOp: timestamp("ai_verwerkt_op"),
  zoekwoorden: jsonb("zoekwoorden").notNull().default([]),
  tags: jsonb("tags").notNull().default([]),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export const veiligheidToolboxVragenTable = pgTable("veiligheid_toolbox_vragen", {
  id: serial("id").primaryKey(),
  toolboxId: integer("toolbox_id").notNull().references(() => veiligheidToolboxenTable.id, { onDelete: "cascade" }),
  volgorde: integer("volgorde").notNull().default(0),
  vraag: text("vraag").notNull(),
  opties: jsonb("opties").notNull().default([]),
  uitleg: text("uitleg"),
});

export const veiligheidToolboxAfrondingTable = pgTable("veiligheid_toolbox_afrondingen", {
  id: serial("id").primaryKey(),
  toolboxId: integer("toolbox_id").notNull().references(() => veiligheidToolboxenTable.id, { onDelete: "cascade" }),
  gebruikerId: integer("gebruiker_id").notNull().references(() => gebruikersTable.id, { onDelete: "cascade" }),
  score: integer("score").notNull(),
  maxScore: integer("max_score").notNull(),
  handtekening: text("handtekening"),
  bevestigdOp: timestamp("bevestigd_op").notNull().defaultNow(),
  geldigTot: timestamp("geldig_tot"),
});

export type VeiligheidToolbox = typeof veiligheidToolboxenTable.$inferSelect;
export type VeiligheidToolboxVraag = typeof veiligheidToolboxVragenTable.$inferSelect;
export type VeiligheidToolboxAfronding = typeof veiligheidToolboxAfrondingTable.$inferSelect;

// ── Maandelijkse toolbox-opdrachten ──────────────────────────────────────────

export const toolboxMaandOpdrachtenTable = pgTable("toolbox_maand_opdrachten", {
  id: serial("id").primaryKey(),
  toolboxId: integer("toolbox_id").notNull().references(() => veiligheidToolboxenTable.id, { onDelete: "cascade" }),
  jaar: integer("jaar").notNull(),
  maand: integer("maand").notNull(),
  aangemaaktDoorId: integer("aangemaakt_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
});

export const toolboxMaandStatusTable = pgTable("toolbox_maand_status", {
  id: serial("id").primaryKey(),
  opdrachtId: integer("opdracht_id").notNull().references(() => toolboxMaandOpdrachtenTable.id, { onDelete: "cascade" }),
  gebruikerId: integer("gebruiker_id").notNull().references(() => gebruikersTable.id, { onDelete: "cascade" }),
  eersteAanbieding: timestamp("eerste_aanbieding").notNull().defaultNow(),
  aantalUitgesteld: integer("aantal_uitgesteld").notNull().default(0),
  laatsteUitgesteld: timestamp("laatste_uitgesteld"),
  vraag: text("vraag"),
  voltooIdOp: timestamp("voltooid_op"),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export type ToolboxMaandOpdracht = typeof toolboxMaandOpdrachtenTable.$inferSelect;
export type ToolboxMaandStatus = typeof toolboxMaandStatusTable.$inferSelect;

// ── LMRA ─────────────────────────────────────────────────────────────────────

export const veiligheidLmrasTable = pgTable("veiligheid_lmras", {
  id: serial("id").primaryKey(),
  gebouwId: integer("gebouw_id").references(() => gebouwenTable.id, { onDelete: "set null" }),
  projectNaam: text("project_naam"),
  locatieOmschrijving: text("locatie_omschrijving").notNull(),
  werkzaamheden: text("werkzaamheden").notNull(),
  risicos: jsonb("risicos").notNull().default([]),
  maatregelen: jsonb("maatregelen").notNull().default([]),
  veiligVoorAanvang: boolean("veilig_voor_aanvang").notNull().default(true),
  handtekening: text("handtekening"),
  fotoPaden: jsonb("foto_paden").notNull().default([]),
  gpsLat: text("gps_lat"),
  gpsLng: text("gps_lng"),
  medewerkerNaam: text("medewerker_naam"),
  medewerkerId: integer("medewerker_id").references(() => medewerkersTable.id, { onDelete: "set null" }),
  aiVoorstel: boolean("ai_voorstel").notNull().default(false),
  aangemaaktDoorId: integer("aangemaakt_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// ── Veiligheidsmeldingen ──────────────────────────────────────────────────────

export const veiligheidMeldingenTable = pgTable("veiligheid_meldingen", {
  id: serial("id").primaryKey(),
  type: text("type").notNull().default("onveilige_situatie"),
  omschrijving: text("omschrijving").notNull(),
  locatie: text("locatie"),
  gebouwId: integer("gebouw_id").references(() => gebouwenTable.id, { onDelete: "set null" }),
  projectNaam: text("project_naam"),
  fotoPaden: jsonb("foto_paden").notNull().default([]),
  prioriteit: text("prioriteit").notNull().default("middel"),
  status: text("status").notNull().default("open"),
  melderNaam: text("melder_naam"),
  gemeldDoorId: integer("gemeld_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  toegewezenAanId: integer("toegewezen_aan_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export const veiligheidMeldingenActiesTable = pgTable("veiligheid_meldingen_acties", {
  id: serial("id").primaryKey(),
  meldingId: integer("melding_id").notNull().references(() => veiligheidMeldingenTable.id, { onDelete: "cascade" }),
  omschrijving: text("omschrijving").notNull(),
  eigenaarId: integer("eigenaar_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  eigenaarNaam: text("eigenaar_naam"),
  deadline: text("deadline"),
  status: text("status").notNull().default("open"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export type VeiligheidLmra = typeof veiligheidLmrasTable.$inferSelect;
export type VeiligheidMelding = typeof veiligheidMeldingenTable.$inferSelect;
export type VeiligheidMeldingActie = typeof veiligheidMeldingenActiesTable.$inferSelect;
