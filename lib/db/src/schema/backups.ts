import { pgTable, serial, text, integer, timestamp, bigint } from "drizzle-orm/pg-core";
import { gebruikersTable } from "./gebruikers";

export const backupRecordsTable = pgTable("backup_records", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  soort: text("soort").notNull().default("handmatig"),          // handmatig | automatisch | pre-deploy
  omgeving: text("omgeving").notNull().default("development"),
  gitCommit: text("git_commit"),
  versieApp: text("versie_app"),
  status: text("status").notNull().default("bezig"),            // bezig | klaar | fout | geverifieerd
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  voltooidOp: timestamp("voltooid_op"),
  grootteDatabaseBytes: bigint("grootte_database_bytes", { mode: "number" }),
  grootteConfigBytes: bigint("grootte_config_bytes", { mode: "number" }),
  checksumDatabase: text("checksum_database"),
  checksumConfig: text("checksum_config"),
  foutTekst: text("fout_tekst"),
  aangemaaktDoorId: integer("aangemaakt_door_id").references(
    () => gebruikersTable.id,
    { onDelete: "set null" },
  ),
});
