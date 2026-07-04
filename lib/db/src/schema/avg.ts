import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { gebruikersTable } from "./gebruikers";

export const avgInzageverzoekTable = pgTable("avg_inzageverzoeken", {
  id: serial("id").primaryKey(),
  gebruikerId: integer("gebruiker_id")
    .notNull()
    .references(() => gebruikersTable.id, { onDelete: "cascade" }),
  type: text("type").notNull().default("inzage"),
  status: text("status").notNull().default("open"),
  opmerking: text("opmerking"),
  beheerderOpmerking: text("beheerder_opmerking"),
  afgerondOp: timestamp("afgerond_op"),
  geanonimiseerdOp: timestamp("geanonimiseerd_op"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export type AvgInzageverzoek = typeof avgInzageverzoekTable.$inferSelect;
