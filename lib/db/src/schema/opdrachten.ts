import { pgTable, serial, text, integer, real, boolean, numeric, timestamp } from "drizzle-orm/pg-core";
import { gebruikersTable } from "./gebruikers";
import { gebouwenTable } from "./gebouwen";
import { projectenTable } from "./projecten";
import { modCalcHeadersTable } from "./mod-calculatie";

// Opdrachten — brug tussen geaccepteerde offerte en uitvoering.
// Aangemaakt wanneer offerte status "akkoord" of "ondertekend" wordt.
// Bevat een auto-gegenereerde werkbegroting (project_begrotingen) zonder opslagen/winst.
export const opdrachtenTable = pgTable("opdrachten", {
  id: serial("id").primaryKey(),
  offerteId: integer("offerte_id"),
  calculatieId: integer("calculatie_id").references(() => modCalcHeadersTable.id, { onDelete: "set null" }),
  gebouwId: integer("gebouw_id").references(() => gebouwenTable.id, { onDelete: "set null" }),
  projectId: integer("project_id").references(() => projectenTable.id, { onDelete: "set null" }),
  titel: text("titel").notNull(),
  werknummer: text("werknummer"),
  opdrachtgever: text("opdrachtgever"),
  omschrijving: text("omschrijving"),
  // vast | regie | overig  (regie = regieproject, drempelwaarde voor LMRA-plicht)
  type: text("type").notNull().default("vast"),
  // Geplande uren — LMRA vereist indien >= 8; null = onbekend (behandeld als >= 8)
  budgetUren: real("budget_uren"),
  // actief | afgerond | gepauzeerd | geannuleerd
  status: text("status").notNull().default("actief"),
  // AI-fasering voor het Project Intelligence Model (PIM).
  // nieuw | advies | werkvoorbereiding | inkoop | uitvoering | oplevering | gereed
  aiFase: text("ai_fase"),
  // UREN_01 §6c.2: per opdracht instelbaar of een mandagstaat (mandagenregister)
  // met de factuur moet worden meegestuurd. Standaard uit — niet elke
  // opdrachtgever vraagt erom.
  mandagstaatVereist: boolean("mandagstaat_vereist").notNull().default(false),
  aangemaaktDoorId: integer("aangemaakt_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// UREN_01 §6c.3: elke generatie van een mandagstaat wordt vastgelegd — wie het
// deed, wanneer, en voor welk werk (opdracht + jaar/week). GEEN BSN in de log:
// het BSN mag uitsluitend op het mandagstaat-document zelf verschijnen (§6c.3).
export const mandagstaatLogsTable = pgTable("mandagstaat_logs", {
  id: serial("id").primaryKey(),
  opdrachtId: integer("opdracht_id").notNull().references(() => opdrachtenTable.id, { onDelete: "cascade" }),
  jaar: integer("jaar").notNull(),
  weekNummer: integer("week_nummer").notNull(),
  gegenereerdDoorId: integer("gegenereerd_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  gegenereerdOp: timestamp("gegenereerd_op").notNull().defaultNow(),
  medewerkerAantal: integer("medewerker_aantal").notNull().default(0),
  urenTotaal: numeric("uren_totaal", { precision: 10, scale: 2 }).notNull().default("0"),
});
