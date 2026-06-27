import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
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
  // actief | afgerond | gepauzeerd | geannuleerd
  status: text("status").notNull().default("actief"),
  aangemaaktDoorId: integer("aangemaakt_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});
