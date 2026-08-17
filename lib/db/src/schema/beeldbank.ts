import { pgTable, serial, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { gebouwenTable } from "./gebouwen";
import { opdrachtenTable } from "./opdrachten";
import { gebruikersTable } from "./gebruikers";

// MERK_01 deel B — handmatige uploads in de beeldbank.
// Automatische bronnen (spotfoto's per fase, opnamefoto's, inspectiefoto's)
// worden live geaggregeerd uit hun eigen tabellen; alleen handmatige uploads
// krijgen een eigen rij. gemaakt_door_id wordt server-side uit de sessie
// afgeleid, nooit uit de request-body.
export const beeldbankUploadsTable = pgTable("beeldbank_uploads", {
  id: serial("id").primaryKey(),
  objectPath: text("object_path").notNull(),
  bijschrift: text("bijschrift"),
  gebouwId: integer("gebouw_id").references(() => gebouwenTable.id, { onDelete: "set null" }),
  opdrachtId: integer("opdracht_id").references(() => opdrachtenTable.id, { onDelete: "set null" }),
  werksoort: text("werksoort"),
  gemaaktDoorId: integer("gemaakt_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
}, (t) => [index("beeldbank_uploads_gebouw_idx").on(t.gebouwId)]);
