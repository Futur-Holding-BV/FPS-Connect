import { pgTable, serial, text, integer, real, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { opnamesTable } from "./opname";
import { gebouwenTable } from "./gebouwen";
import { gebruikersTable } from "./gebruikers";

export const calculatiesTable = pgTable("calculaties", {
  id: serial("id").primaryKey(),
  // NUMMER_01: C-volgnummer uit seq_nummer_c (doorlopend, systeem-uitgegeven)
  nummer: integer("nummer").notNull().default(sql`nextval('seq_nummer_c')`).unique(),
  // NUMMER_01 §4.4: welke meeting (opname) tot deze calculatie leidde
  opnameId: integer("opname_id").references(() => opnamesTable.id, { onDelete: "set null" }),
  // NUMMER_01 §4.10: herziening = kopie met nieuw nummer; origineel blijft staan
  gekopieerdVanId: integer("gekopieerd_van_id"),
  verzondenOp: timestamp("verzonden_op"),
  naam: text("naam").notNull(),
  gebouwId: integer("gebouw_id").references(() => gebouwenTable.id, { onDelete: "set null" }),
  status: text("status").notNull().default("concept"),
  omschrijving: text("omschrijving"),
  aangemaaktDoorId: integer("aangemaakt_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export const calculatieRegelsTable = pgTable("calculatie_regels", {
  id: serial("id").primaryKey(),
  calculatieId: integer("calculatie_id")
    .notNull()
    .references(() => calculatiesTable.id, { onDelete: "cascade" }),
  categorie: text("categorie").notNull().default("arbeid"),
  omschrijving: text("omschrijving").notNull(),
  eenheid: text("eenheid").notNull().default("st"),
  hoeveelheid: real("hoeveelheid").notNull().default(0),
  stukprijs: real("stukprijs").notNull().default(0),
  totaal: real("totaal").notNull().default(0),
  volgorde: integer("volgorde").notNull().default(0),
  opmerkingen: text("opmerkingen"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});
