import { pgTable, serial, integer, text, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";

export const governanceChecksTable = pgTable("governance_checks", {
  id: serial("id").primaryKey(),
  gebruikerId: integer("gebruiker_id"),
  gebruikerNaam: text("gebruiker_naam"),
  rol: text("rol"),
  methode: text("methode").notNull(),
  route: text("route").notNull(),
  module: text("module"),
  entiteit: text("entiteit"),
  risicoNiveau: text("risico_niveau").notNull().default("groen"),
  risicoScore: integer("risico_score").notNull().default(0),
  motivatie: text("motivatie"),
  risicoFactoren: jsonb("risico_factoren"),
  afhandeling: text("afhandeling").notNull().default("automatisch"),
  geblokkeerd: boolean("geblokkeerd").notNull().default(false),
  statuscode: integer("statuscode"),
  ipAdres: text("ip_adres"),
  userAgent: text("user_agent"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
});

export const governanceWachtrijTable = pgTable("governance_wachtrij", {
  id: serial("id").primaryKey(),
  checkId: integer("check_id")
    .notNull()
    .references(() => governanceChecksTable.id, { onDelete: "cascade" }),
  vereistRol: text("vereist_rol").notNull(),
  aangevraagdVanRol: text("aangevraagd_van_rol"),
  status: text("status").notNull().default("wacht"),
  goedgekeurdDoorId: integer("goedgekeurd_door_id"),
  goedgekeurdDoorNaam: text("goedgekeurd_door_naam"),
  opmerking: text("opmerking"),
  afgehandeldOp: timestamp("afgehandeld_op"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
});
