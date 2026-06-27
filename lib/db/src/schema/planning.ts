import { pgTable, serial, text, integer, real, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { gebouwenTable } from "./gebouwen";
import { gebruikersTable } from "./gebruikers";
import { medewerkersTable } from "./hrm";
import { projectenTable } from "./projecten";
import { opdrachtenTable } from "./opdrachten";
import { modCalcHeadersTable, modCalcRegelsTable } from "./mod-calculatie";

export const planningItemsTable = pgTable("planning_items", {
  id: serial("id").primaryKey(),
  titel: text("titel").notNull(),
  omschrijving: text("omschrijving"),
  medewerkerId: integer("medewerker_id").references(() => medewerkersTable.id, { onDelete: "set null" }),
  gebouwId: integer("gebouw_id").references(() => gebouwenTable.id, { onDelete: "set null" }),
  projectId: integer("project_id").references(() => projectenTable.id, { onDelete: "set null" }),
  opdrachtId: integer("opdracht_id").references(() => opdrachtenTable.id, { onDelete: "set null" }),
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

// Werkbegrotingen — uitbreiding op project_begrotingen.
// Aangemaakt vanuit calculatie bij omzetten naar opdracht (opslagen/winst verwijderd).
// status: concept | vastgesteld
export const projectBegrotingenTable = pgTable("project_begrotingen", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projectenTable.id, { onDelete: "set null" }),
  gebouwId: integer("gebouw_id").references(() => gebouwenTable.id, { onDelete: "cascade" }),
  opdrachtId: integer("opdracht_id").references(() => opdrachtenTable.id, { onDelete: "set null" }),
  calculatieId: integer("calculatie_id").references(() => modCalcHeadersTable.id, { onDelete: "set null" }),
  werknummer: text("werknummer"),
  hoofdUrenBegroot: real("hoofd_uren_begroot").notNull().default(0),
  meerwerkUrenBegroot: real("meerwerk_uren_begroot").notNull().default(0),
  totaalArbeidUren: real("totaal_arbeid_uren").notNull().default(0),
  totaalMateriaalBedrag: real("totaal_materiaal_bedrag").notNull().default(0),
  omschrijving: text("omschrijving"),
  // concept | vastgesteld
  status: text("status").notNull().default("concept"),
  vastgesteldDoorId: integer("vastgesteld_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  vastgesteldOp: timestamp("vastgesteld_op"),
  aiAnalyse: jsonb("ai_analyse"),
  aiAnalyseOp: timestamp("ai_analyse_op"),
  aangemaaktDoorId: integer("aangemaakt_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// Werkbegroting regels — calculatieregels zonder opslagen/winst.
// FK begroting_id → project_begrotingen (niet getyped om circular import te voorkomen).
export const werkbegrotingRegelsTable = pgTable("werkbegroting_regels", {
  id: serial("id").primaryKey(),
  begrotingId: integer("begroting_id").notNull(),
  calcRegelId: integer("calc_regel_id").references(() => modCalcRegelsTable.id, { onDelete: "set null" }),
  categorie: text("categorie").notNull().default("arbeid"),
  omschrijving: text("omschrijving").notNull(),
  eenheid: text("eenheid").notNull().default("uur"),
  hoeveelheid: real("hoeveelheid").notNull().default(0),
  tarief: real("tarief").notNull().default(0),
  totaal: real("totaal").notNull().default(0),
  hoofdstuk: text("hoofdstuk").notNull().default("Overige werkzaamheden"),
  aiInkoopVoorstel: text("ai_inkoop_voorstel"),
  aiArbeidVoorstel: text("ai_arbeid_voorstel"),
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
