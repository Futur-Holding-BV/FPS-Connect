import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { gebruikersTable } from "./gebruikers";

export const slimUploadLogTable = pgTable("slim_upload_log", {
  id: serial("id").primaryKey(),
  gebruikerId: integer("gebruiker_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  bestandsnaam: text("bestandsnaam").notNull(),
  categorie: text("categorie").notNull(),
  actie: text("actie").notNull(),
  impactNiveau: text("impact_niveau").notNull().default("geen"),
  bevestigd: boolean("bevestigd").notNull().default(false),
  geweigerd: boolean("geweigerd").notNull().default(false),
  opmerking: text("opmerking"),
  ipAdres: text("ip_adres"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
});
