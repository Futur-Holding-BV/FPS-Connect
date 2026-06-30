import { pgTable, serial, text, integer, real, timestamp, numeric } from "drizzle-orm/pg-core";
import { gebruikersTable } from "./gebruikers";
import { opdrachtenTable } from "./opdrachten";

export const onderhandenWerkOverridesTable = pgTable("onderhanden_werk_overrides", {
  id: serial("id").primaryKey(),
  opdrachtId: integer("opdracht_id").notNull().references(() => opdrachtenTable.id, { onDelete: "cascade" }),
  waarderingsmethode: text("waarderingsmethode").notNull().default("percentage_gereed"),
  percentageGereed: real("percentage_gereed"),
  handmatigBedrag: numeric("handmatig_bedrag", { precision: 12, scale: 2 }),
  opmerkingen: text("opmerkingen"),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
  bijgewerktDoorId: integer("bijgewerkt_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
});

export type OnderhandenWerkOverride = typeof onderhandenWerkOverridesTable.$inferSelect;
export type InsertOnderhandenWerkOverride = typeof onderhandenWerkOverridesTable.$inferInsert;
