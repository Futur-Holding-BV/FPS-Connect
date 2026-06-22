import { pgTable, serial, text, integer, real, boolean, timestamp } from "drizzle-orm/pg-core";
import { gebouwenTable } from "./gebouwen";
import { gebruikersTable } from "./gebruikers";
import { medewerkersTable } from "./hrm";
import { projectenTable } from "./projecten";

export const planningItemsTable = pgTable("planning_items", {
  id: serial("id").primaryKey(),
  titel: text("titel").notNull(),
  omschrijving: text("omschrijving"),
  medewerkerId: integer("medewerker_id").references(() => medewerkersTable.id, { onDelete: "set null" }),
  gebouwId: integer("gebouw_id").references(() => gebouwenTable.id, { onDelete: "set null" }),
  projectId: integer("project_id").references(() => projectenTable.id, { onDelete: "set null" }),
  projectNaam: text("project_naam"),
  datumStart: text("datum_start").notNull(),
  datumEind: text("datum_eind").notNull(),
  tijdStart: text("tijd_start"),
  tijdEind: text("tijd_eind"),
  uren: real("uren").notNull().default(8),
  status: text("status").notNull().default("concept"),
  type: text("type").notNull().default("intern"),
  opdrachtType: text("opdracht_type"),
  locaties: text("locaties"),
  werknummer: text("werknummer"),
  tijdsloten: text("tijdsloten"),
  dagNotities: text("dag_notities"),
  notities: text("notities"),
  uitvoeringStatus: text("uitvoering_status").notNull().default("gepland"),
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

export const projectBegrotingenTable = pgTable("project_begrotingen", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projectenTable.id, { onDelete: "set null" }),
  gebouwId: integer("gebouw_id").references(() => gebouwenTable.id, { onDelete: "cascade" }),
  werknummer: text("werknummer"),
  hoofdUrenBegroot: real("hoofd_uren_begroot").notNull().default(0),
  meerwerkUrenBegroot: real("meerwerk_uren_begroot").notNull().default(0),
  omschrijving: text("omschrijving"),
  aangemaaktDoorId: integer("aangemaakt_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export const planningMeerwerkTable = pgTable("planning_meerwerk", {
  id: serial("id").primaryKey(),
  planningItemId: integer("planning_item_id").notNull().references(() => planningItemsTable.id, { onDelete: "cascade" }),
  meerwerkNummer: text("meerwerk_nummer"),
  omschrijving: text("omschrijving"),
  status: text("status").notNull().default("concept"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});
