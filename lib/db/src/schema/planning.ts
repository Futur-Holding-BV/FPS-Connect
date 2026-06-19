import { pgTable, serial, text, integer, real, boolean, timestamp } from "drizzle-orm/pg-core";
import { gebouwenTable } from "./gebouwen";
import { gebruikersTable } from "./gebruikers";
import { medewerkersTable } from "./hrm";

export const planningItemsTable = pgTable("planning_items", {
  id: serial("id").primaryKey(),
  titel: text("titel").notNull(),
  omschrijving: text("omschrijving"),
  medewerkerId: integer("medewerker_id").references(() => medewerkersTable.id, { onDelete: "set null" }),
  gebouwId: integer("gebouw_id").references(() => gebouwenTable.id, { onDelete: "set null" }),
  projectNaam: text("project_naam"),
  datumStart: text("datum_start").notNull(),
  datumEind: text("datum_eind").notNull(),
  tijdStart: text("tijd_start"),
  tijdEind: text("tijd_eind"),
  uren: real("uren").notNull().default(8),
  status: text("status").notNull().default("concept"),
  type: text("type").notNull().default("intern"),
  werknummer: text("werknummer"),
  tijdsloten: text("tijdsloten"),
  dagNotities: text("dag_notities"),
  notities: text("notities"),
  aangemaaktDoorId: integer("aangemaakt_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export const planningAfwezigheidTable = pgTable("planning_afwezigheid", {
  id: serial("id").primaryKey(),
  medewerkerId: integer("medewerker_id").notNull().references(() => medewerkersTable.id, { onDelete: "cascade" }),
  type: text("type").notNull().default("vakantie"),
  datumStart: text("datum_start").notNull(),
  datumEind: text("datum_eind").notNull(),
  omschrijving: text("omschrijving"),
  status: text("status").notNull().default("aangevraagd"),
  goedgekeurdDoorId: integer("goedgekeurd_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangemaaktDoorId: integer("aangemaakt_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});
