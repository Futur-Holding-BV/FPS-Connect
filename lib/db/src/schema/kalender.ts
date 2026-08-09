// KALENDER_01 — jaarkalender. Alleen de twee invoerbare items leven hier;
// alle afgeleide kalenderinhoud (feestdagen, APK, keuringen, verlof,
// verjaardagen) wordt gelezen uit de brontabellen en nooit gekopieerd.
import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { werkgeversTable, verlofsoortenTable } from "./hrm";
import { gebruikersTable } from "./gebruikers";

export const collectieveVrijeDagenTable = pgTable("collectieve_vrije_dagen", {
  id: serial("id").primaryKey(),
  // NULL = geldt voor alle werkgevers (BV's)
  werkgeverId: integer("werkgever_id").references(() => werkgeversTable.id, { onDelete: "set null" }),
  datum: text("datum").notNull(), // yyyy-mm-dd
  naam: text("naam").notNull(),
  verlofsoortId: integer("verlofsoort_id").notNull().references(() => verlofsoortenTable.id),
  // Rapport van de afboeking: { verwerkt, zonder_saldo_rij: [], negatief: [] }
  afboekRapport: jsonb("afboek_rapport").$type<Record<string, unknown> | null>(),
  aangemaaktDoorId: integer("aangemaakt_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export const kalenderAfsprakenTable = pgTable("kalender_afspraken", {
  id: serial("id").primaryKey(),
  titel: text("titel").notNull(),
  omschrijving: text("omschrijving"),
  startDatum: text("start_datum").notNull(), // yyyy-mm-dd
  // geen | jaarlijks | halfjaarlijks | kwartaal
  herhaling: text("herhaling").notNull().default("jaarlijks"),
  eindDatum: text("eind_datum"),
  aantalHerhalingen: integer("aantal_herhalingen"),
  werkgeverId: integer("werkgever_id").references(() => werkgeversTable.id, { onDelete: "set null" }),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});
