import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { gebouwenTable } from "./gebouwen";
import { gebruikersTable } from "./gebruikers";
import { crmKlantenTable } from "./crm";

export const projectenTable = pgTable("projecten", {
  id:               serial("id").primaryKey(),
  naam:             text("naam").notNull(),
  werknummer:       text("werknummer"),
  status:           text("status").notNull().default("concept"), // concept | actief | afgerond | geannuleerd
  werkmaatschappij: text("werkmaatschappij"),
  omschrijving:     text("omschrijving"),
  crmKlantId:       integer("crm_klant_id").references(() => crmKlantenTable.id, { onDelete: "set null" }),
  gebouwId:         integer("gebouw_id").references(() => gebouwenTable.id, { onDelete: "set null" }),
  startDatum:       text("start_datum"),
  eindDatum:        text("eind_datum"),
  aangemaaktDoorId: integer("aangemaakt_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangemaaktOp:     timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp:     timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export type Project       = typeof projectenTable.$inferSelect;
export type InsertProject = typeof projectenTable.$inferInsert;
