import { pgTable, serial, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { gebouwenTable } from "./gebouwen";
import { gebruikersTable } from "./gebruikers";
import { crmKlantenTable } from "./crm";
import { medewerkersTable } from "./hrm";

export const projectenTable = pgTable("projecten", {
  id:               serial("id").primaryKey(),
  naam:             text("naam").notNull(),
  werknummer:       text("werknummer"),
  status:           text("status").notNull().default("concept"), // concept | actief | afgerond | geannuleerd
  werkmaatschappij: text("werkmaatschappij"),
  omschrijving:     text("omschrijving"),
  crmKlantId:       integer("crm_klant_id").references(() => crmKlantenTable.id, { onDelete: "set null" }),
  gebouwId:         integer("gebouw_id").references(() => gebouwenTable.id, { onDelete: "set null" }),
  startDatum:       text("start_datum"),
  eindDatum:        text("eind_datum"),
  aangemaaktDoorId: integer("aangemaakt_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangemaaktOp:     timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp:     timestamp("bijgewerkt_op").notNull().defaultNow(),
  // PROJ_1200: projectleider-toewijzing. Canonical FK naar medewerkers.id.
  // Nullable: geen projectleider (nog) toegewezen.
  projectleiderMedewerkerId: integer("projectleider_medewerker_id").references(() => medewerkersTable.id, { onDelete: "set null" }),
});

export type Project       = typeof projectenTable.$inferSelect;
export type InsertProject = typeof projectenTable.$inferInsert;

// PROJ_1200: append-only auditlog voor projectleider-wijzigingen.
// DB-trigger laat UPDATE/DELETE niet toe (zie migratie 0138).
export const projectleiderGeschiedenisTable = pgTable(
  "projectleider_geschiedenis",
  {
    id:                  serial("id").primaryKey(),
    projectId:           integer("project_id").notNull().references(() => projectenTable.id, { onDelete: "cascade" }),
    oudeMedewerkerId:    integer("oude_medewerker_id").references(() => medewerkersTable.id, { onDelete: "set null" }),
    nieuweMedewerkerId:  integer("nieuwe_medewerker_id").references(() => medewerkersTable.id, { onDelete: "set null" }),
    actorGebruikerId:    integer("actor_gebruiker_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
    reden:               text("reden"),
    tijdstip:            timestamp("tijdstip").notNull().defaultNow(),
  },
  (t) => [
    index("projectleider_geschiedenis_project_idx").on(t.projectId),
    index("projectleider_geschiedenis_tijdstip_idx").on(t.tijdstip),
  ],
);

export type ProjectleiderGeschiedenis       = typeof projectleiderGeschiedenisTable.$inferSelect;
export type InsertProjectleiderGeschiedenis = typeof projectleiderGeschiedenisTable.$inferInsert;
