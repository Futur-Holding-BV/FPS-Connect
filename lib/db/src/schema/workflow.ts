import {
  pgTable, serial, text, integer, boolean, timestamp,
} from "drizzle-orm/pg-core";

export const workflowDefinitiesTable = pgTable("workflow_definities", {
  id: serial("id").primaryKey(),
  naam: text("naam").notNull(),
  type: text("type").notNull(),
  omschrijving: text("omschrijving"),
  actief: boolean("actief").notNull().default(true),
  volgorde: integer("volgorde").notNull().default(0),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export const workflowLanesTable = pgTable("workflow_lanes", {
  id: serial("id").primaryKey(),
  workflowId: integer("workflow_id")
    .notNull()
    .references(() => workflowDefinitiesTable.id, { onDelete: "cascade" }),
  naam: text("naam").notNull(),
  kleur: text("kleur").notNull().default("#64748b"),
  volgorde: integer("volgorde").notNull().default(0),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
});

export const workflowCardsTable = pgTable("workflow_cards", {
  id: serial("id").primaryKey(),
  workflowId: integer("workflow_id")
    .notNull()
    .references(() => workflowDefinitiesTable.id, { onDelete: "cascade" }),
  laneId: integer("lane_id")
    .notNull()
    .references(() => workflowLanesTable.id, { onDelete: "cascade" }),
  type: text("type").notNull().default("stap"),
  titel: text("titel").notNull(),
  omschrijving: text("omschrijving"),
  invoer: text("invoer"),
  uitvoer: text("uitvoer"),
  rol: text("rol"),
  aiTaak: text("ai_taak"),
  akkoordDoor: text("akkoord_door"),
  gekoppeldeModule: text("gekoppelde_module"),
  uitzonderingsroute: text("uitzonderingsroute"),
  actief: boolean("actief").notNull().default(true),
  volgorde: integer("volgorde").notNull().default(0),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export type WorkflowDefinitie = typeof workflowDefinitiesTable.$inferSelect;
export type WorkflowDefinitieInsert = typeof workflowDefinitiesTable.$inferInsert;
export type WorkflowLane = typeof workflowLanesTable.$inferSelect;
export type WorkflowLaneInsert = typeof workflowLanesTable.$inferInsert;
export type WorkflowCard = typeof workflowCardsTable.$inferSelect;
export type WorkflowCardInsert = typeof workflowCardsTable.$inferInsert;
