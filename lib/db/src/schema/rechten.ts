import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { gebruikersTable } from "./gebruikers";

/**
 * Object-rechten — per gebruiker × objectType × objectId.
 *
 * Ondersteunde dimensies:
 *   Object-rechten    — gebouw | project | document | medewerker | offerte | dossier | onderhoudscontract
 *   Tijdelijke rechten — geldigVan / geldigTot (null = permanent)
 *   Module-scope      — moduleId null = alle modules; ingevuld = module-specifiek
 *   Werkmaatschappij  — werkmaatschappijId (toekomstige multi-tenant scope)
 *
 * Niveau 0–4: identiek aan de module-bevoegdheden-matrix.
 * Een verlopen recht (geldigTot < NOW()) wordt behandeld als niveau 0.
 */
export const objectRechtenTable = pgTable(
  "object_rechten",
  {
    id: serial("id").primaryKey(),
    gebruikerId: integer("gebruiker_id")
      .references(() => gebruikersTable.id, { onDelete: "cascade" })
      .notNull(),
    objectType: text("object_type").notNull(),
    objectId: integer("object_id").notNull(),
    moduleId: text("module_id"),
    niveau: integer("niveau").notNull().default(0),
    geldigVan: timestamp("geldig_van"),
    geldigTot: timestamp("geldig_tot"),
    verleendDoor: integer("verleend_door").references(
      () => gebruikersTable.id,
      { onDelete: "set null" },
    ),
    werkmaatschappijId: integer("werkmaatschappij_id"),
    reden: text("reden"),
    aangemaaktOp: timestamp("aangemaakt_op").defaultNow().notNull(),
  },
  (table) => [
    index("object_rechten_gebruiker_idx").on(table.gebruikerId),
    index("object_rechten_object_idx").on(table.objectType, table.objectId),
    index("object_rechten_geldig_tot_idx").on(table.geldigTot),
  ],
);

/**
 * Workflow-rechten — per (module × workflowStatus) een minimumniveau.
 *
 * Voorbeeld-regel: module=documenten, workflowStatus=definitief, rolFilter=klant
 *   → klanten hebben minimaal niveau 1 nodig om definitieve documenten te zien.
 *
 * Schema gereed; evaluatielogica volgt in PermissieEngine.heeftWorkflowRecht().
 */
export const workflowRechtenTable = pgTable(
  "workflow_rechten",
  {
    id: serial("id").primaryKey(),
    moduleId: text("module_id").notNull(),
    workflowStatus: text("workflow_status").notNull(),
    rolFilter: text("rol_filter"),
    minNiveauVereist: integer("min_niveau_vereist").notNull().default(1),
    beschrijving: text("beschrijving"),
    aangemaaktOp: timestamp("aangemaakt_op").defaultNow().notNull(),
  },
  (table) => [
    index("workflow_rechten_module_status_idx").on(
      table.moduleId,
      table.workflowStatus,
    ),
  ],
);
