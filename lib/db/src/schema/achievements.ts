import { integer, pgTable, serial, text, timestamp, date } from "drizzle-orm/pg-core";
import { gebruikersTable } from "./gebruikers";
import { medewerkersTable } from "./hrm";

export const monteurAchievementsTable = pgTable("monteur_achievements", {
  id: serial("id").primaryKey(),
  gebruikerId: integer("gebruiker_id")
    .notNull()
    .references(() => gebruikersTable.id, { onDelete: "cascade" }),
  medewerkerId: integer("medewerker_id")
    .references(() => medewerkersTable.id, { onDelete: "set null" }),
  spotsMijlpaal: integer("spots_mijlpaal").notNull(),
  rang: text("rang").notNull(),
  beloning: text("beloning").notNull(),
  behaaldOp: date("behaald_op").notNull(),
  aangemaaktOp: timestamp("aangemaakt_op").defaultNow().notNull(),
});
