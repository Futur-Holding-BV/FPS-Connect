import { pgTable, serial, text, integer, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";
import { gebruikersTable } from "./gebruikers";
import { gebouwenTable } from "./gebouwen";
import { medewerkersTable } from "./hrm";
import { opdrachtenTable } from "./opdrachten";

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
  aiGegenereerd: boolean("ai_gegenereerd").notNull().default(false),
  fotoSuggesties: jsonb("foto_suggesties").notNull().default([]),
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
  opdrachtId: integer("opdracht_id").references(() => opdrachtenTable.id, { onDelete: "set null" }),
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

// ── Incidenten (bijna-ongevallen & ongevallen) ────────────────────────────────

export const veiligheidIncidentenTable = pgTable("veiligheid_incidenten", {
  id: serial("id").primaryKey(),
  type: text("type").notNull().default("bijna_ongeval"),
  datum: text("datum"),
  tijdstip: text("tijdstip"),
  locatieOmschrijving: text("locatie_omschrijving").notNull(),
  gebouwId: integer("gebouw_id").references(() => gebouwenTable.id, { onDelete: "set null" }),
  opdrachtId: integer("opdracht_id").references(() => opdrachtenTable.id, { onDelete: "set null" }),
  omschrijving: text("omschrijving").notNull(),
  oorzaak: text("oorzaak"),
  letselBeschrijving: text("letsel_beschrijving"),
  eersteHulpVerleend: boolean("eerste_hulp_verleend").notNull().default(false),
  eersteHulpBeschrijving: text("eerste_hulp_beschrijving"),
  getuigen: jsonb("getuigen").notNull().default([]),
  genoemenMaatregelen: jsonb("genomen_maatregelen").notNull().default([]),
  meldplichtig: boolean("meldplichtig").notNull().default(false),
  gemeldBijArbeidsinspectie: boolean("gemeld_bij_arbeidsinspectie").notNull().default(false),
  status: text("status").notNull().default("open"),
  fotoPaden: jsonb("foto_paden").notNull().default([]),
  aiVoorstel: boolean("ai_voorstel").notNull().default(false),
  medewerkerNaam: text("medewerker_naam"),
  medewerkerId: integer("medewerker_id").references(() => medewerkersTable.id, { onDelete: "set null" }),
  aangemaaktDoorId: integer("aangemaakt_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export type VeiligheidIncident = typeof veiligheidIncidentenTable.$inferSelect;

// ── PBM-items (persoonlijke beschermingsmiddelen) ─────────────────────────────

export const pbmItemsTable = pgTable("pbm_items", {
  id: serial("id").primaryKey(),
  medewerkerId: integer("medewerker_id").references(() => medewerkersTable.id, { onDelete: "cascade" }),
  medewerkerNaam: text("medewerker_naam"),
  type: text("type").notNull(),
  merk: text("merk"),
  model: text("model"),
  maat: text("maat"),
  serienummer: text("serienummer"),
  uitgifteDatum: text("uitgifte_datum"),
  vervangingsDatum: text("vervangings_datum"),
  garantietermijn: text("garantietermijn"),
  fabrikant: text("fabrikant"),
  handleidingPad: text("handleiding_pad"),
  keuringsIntervalMaanden: integer("keurings_interval_maanden"),
  laatsteControle: text("laatste_controle"),
  status: text("status").notNull().default("actief"),
  fotoPaden: jsonb("foto_paden").notNull().default([]),
  opmerkingen: text("opmerkingen"),
  qrCode: text("qr_code"),
  uitgeleendDoorId: integer("uitgeleend_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export const pbmInspectiesTable = pgTable("pbm_inspecties", {
  id: serial("id").primaryKey(),
  pbmItemId: integer("pbm_item_id").notNull().references(() => pbmItemsTable.id, { onDelete: "cascade" }),
  medewerkerId: integer("medewerker_id").references(() => medewerkersTable.id, { onDelete: "set null" }),
  datum: text("datum").notNull(),
  fotoPaden: jsonb("foto_paden").notNull().default([]),
  aiBeoordeling: text("ai_beoordeling"),
  aiAanbeveling: text("ai_aanbeveling"),
  aiSlijtage: text("ai_slijtage").notNull().default("onbekend"),
  aiKeurNodig: boolean("ai_keur_nodig").notNull().default(false),
  formeleStatus: text("formele_status").notNull().default("in_behandeling"),
  beoordeeldDoorId: integer("beoordeeld_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  beoordeeldDoorNaam: text("beoordeeld_door_naam"),
  opmerkingen: text("opmerkingen"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export type PbmItem = typeof pbmItemsTable.$inferSelect;
export type PbmInspectie = typeof pbmInspectiesTable.$inferSelect;

// ── Veiligheidsmiddelen (bedrijfsmiddelen) ────────────────────────────────────

export const veiligheidsmiddelenTable = pgTable("veiligheidsmiddelen", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  naam: text("naam").notNull(),
  merk: text("merk"),
  model: text("model"),
  serienummer: text("serienummer"),
  locatie: text("locatie"),
  eigenaarId: integer("eigenaar_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  eigenaarNaam: text("eigenaar_naam"),
  keuringsIntervalMaanden: integer("keurings_interval_maanden"),
  aanschafDatum: text("aanschaf_datum"),
  vervangingsDatum: text("vervangings_datum"),
  status: text("status").notNull().default("actief"),
  fotoPaden: jsonb("foto_paden").notNull().default([]),
  handleidingPad: text("handleiding_pad"),
  opmerkingen: text("opmerkingen"),
  qrCode: text("qr_code"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export const veiligheidsmiddelInspectiesTable = pgTable("veiligheidsmiddel_inspecties", {
  id: serial("id").primaryKey(),
  middelId: integer("middel_id").notNull().references(() => veiligheidsmiddelenTable.id, { onDelete: "cascade" }),
  datum: text("datum").notNull(),
  fotoPaden: jsonb("foto_paden").notNull().default([]),
  bevindingen: text("bevindingen"),
  aiBeoordeling: text("ai_beoordeling"),
  aiAanbeveling: text("ai_aanbeveling"),
  aiKeurNodig: boolean("ai_keur_nodig").notNull().default(false),
  formeleStatus: text("formele_status").notNull().default("in_behandeling"),
  beoordeeldDoorId: integer("beoordeeld_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  beoordeeldDoorNaam: text("beoordeeld_door_naam"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export type Veiligheidsmiddel = typeof veiligheidsmiddelenTable.$inferSelect;
export type VeiligheidsmiddelInspectie = typeof veiligheidsmiddelInspectiesTable.$inferSelect;
