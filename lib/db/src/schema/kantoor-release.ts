import { pgTable, serial, text, boolean, timestamp, integer } from "drizzle-orm/pg-core";

export const kantoorReleasesTable = pgTable("kantoor_releases", {
  id: serial("id").primaryKey(),
  versienummer: text("versienummer").notNull(),
  label: text("label").notNull(),
  samenvatting: text("samenvatting"),
  aangemaaktOp: timestamp("aangemaakt_op", { withTimezone: true }).notNull().defaultNow(),
  vrijgegevenOp: timestamp("vrijgegeven_op", { withTimezone: true }),
  status: text("status").notNull().default("concept"),
  isActief: boolean("is_actief").notNull().default(false),
  commitInfo: text("commit_info"),
  dbVersie: text("db_versie"),
  buildGeslaagd: boolean("build_geslaagd"),
  testsGeslaagd: boolean("tests_geslaagd"),
  releaseReadinessAkkoord: boolean("release_readiness_akkoord"),
  dbWijzigingenGecontroleerd: boolean("db_wijzigingen_gecontroleerd"),
  releaseNotesAangemaakt: boolean("release_notes_aangemaakt"),
  geenKritiekeFouten: boolean("geen_kritieke_fouten"),
  vrijgegevenDoor: integer("vrijgegeven_door"),
  vrijgegevenDoorNaam: text("vrijgegeven_door_naam"),
  bekendeBeperkingenJson: text("bekende_beperkingen_json"),
  vorigeVersieId: integer("vorige_versie_id"),
});

export const releaseUpdateNotesTable = pgTable("release_update_notes", {
  id: serial("id").primaryKey(),
  releaseId: integer("release_id").notNull().references(() => kantoorReleasesTable.id, { onDelete: "cascade" }),
  toegevoegd: text("toegevoegd"),
  verbeterd: text("verbeterd"),
  opgelost: text("opgelost"),
  beveiliging: text("beveiliging"),
  bekendeProblemen: text("bekende_problemen"),
  instructies: text("instructies"),
});
