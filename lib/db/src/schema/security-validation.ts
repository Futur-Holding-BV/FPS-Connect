import { pgTable, serial, text, integer, timestamp, boolean, jsonb, real } from "drizzle-orm/pg-core";

export const securityScanRunsTable = pgTable("security_scan_runs", {
  id: serial("id").primaryKey(),
  gestarttOp: timestamp("gestart_op").defaultNow().notNull(),
  voltooidOp: timestamp("voltooid_op"),
  gestarttDoor: integer("gestart_door"),
  gestarttDoorNaam: text("gestart_door_naam"),
  type: text("type").notNull().default("handmatig"),
  status: text("status").notNull().default("lopend"),
  versieLabel: text("versie_label"),
  baseUrl: text("base_url"),

  totaalTests: integer("totaal_tests").default(0),
  geslaagd: integer("geslaagd").default(0),
  mislukt: integer("mislukt").default(0),
  waarschuwingen: integer("waarschuwingen").default(0),
  overgeslagen: integer("overgeslagen").default(0),
  kritiekMislukt: integer("kritiek_mislukt").default(0),

  scoreInfrastructuur: real("score_infrastructuur"),
  scoreAuthenticatie: real("score_authenticatie"),
  scoreAutorisatie: real("score_autorisatie"),
  scoreApiBeveiliging: real("score_api_beveiliging"),
  scoreUploadBeveiliging: real("score_upload_beveiliging"),
  scoreMalware: real("score_malware"),
  scoreAiBeveiliging: real("score_ai_beveiliging"),
  scoreGovernance: real("score_governance"),
  scoreBusinessLogica: real("score_business_logica"),
  scoreLogging: real("score_logging"),
  scoreEmailBeveiliging: real("score_email_beveiliging"),
  scoreMobielBeveiliging: real("score_mobiel_beveiliging"),
  scoreTotaal: real("score_totaal"),

  releaseGoedgekeurd: boolean("release_goedgekeurd"),
  releaseGoedgekeurdDoor: text("release_goedgekeurd_door"),
  releaseGoedgekeurdOp: timestamp("release_goedgekeurd_op"),
  releaseOpmerking: text("release_opmerking"),
  releaseGeblokkeerd: boolean("release_geblokkeerd").default(false),
  releaseBlokkedeReden: text("release_blokkede_reden"),

  samenvatting: jsonb("samenvatting"),
  aangemaaktOp: timestamp("aangemaakt_op").defaultNow().notNull(),
  bijgewerktOp: timestamp("bijgewerkt_op").defaultNow().notNull(),
});

export const securityTestResultatenTable = pgTable("security_test_resultaten", {
  id: serial("id").primaryKey(),
  scanRunId: integer("scan_run_id").notNull(),

  testId: text("test_id").notNull(),
  categorie: text("categorie").notNull(),
  subcategorie: text("subcategorie"),
  naam: text("naam").notNull(),
  beschrijving: text("beschrijving"),
  ernst: text("ernst").notNull(),

  uitkomst: text("uitkomst").notNull(),
  bericht: text("bericht"),
  details: text("details"),
  aanbeveling: text("aanbeveling"),
  duurMs: integer("duur_ms"),
  uitgevoerdOp: timestamp("uitgevoerd_op").defaultNow().notNull(),
});

export const securityReleasesTable = pgTable("security_releases", {
  id: serial("id").primaryKey(),
  scanRunId: integer("scan_run_id").notNull(),
  versieLabel: text("versie_label"),
  status: text("status").notNull().default("wacht"),
  scoreTotaal: real("score_totaal"),
  kritiekMislukt: integer("kritiek_mislukt").default(0),
  minScore: real("min_score").default(95),
  geblokkeerd: boolean("geblokkeerd").default(false),
  blokkedeReden: text("blokkede_reden"),
  goedgekeurdDoor: text("goedgekeurd_door"),
  goedgekeurdOp: timestamp("goedgekeurd_op"),
  afgewezenDoor: text("afgewezen_door"),
  afgewezenOp: timestamp("afgewezen_op"),
  opmerking: text("opmerking"),
  aangemaaktOp: timestamp("aangemaakt_op").defaultNow().notNull(),
  bijgewerktOp: timestamp("bijgewerkt_op").defaultNow().notNull(),
});

export const securityInstellingenTable = pgTable("security_instellingen", {
  id: serial("id").primaryKey(),
  sleutel: text("sleutel").notNull().unique(),
  waarde: text("waarde").notNull(),
  omschrijving: text("omschrijving"),
  bijgewerktOp: timestamp("bijgewerkt_op").defaultNow().notNull(),
});

export type SecurityScanRun = typeof securityScanRunsTable.$inferSelect;
export type SecurityTestResultaat = typeof securityTestResultatenTable.$inferSelect;
export type SecurityRelease = typeof securityReleasesTable.$inferSelect;
export type SecurityInstelling = typeof securityInstellingenTable.$inferSelect;
