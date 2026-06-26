import { pgTable, serial, text, integer, real, boolean, timestamp } from "drizzle-orm/pg-core";
import { gebouwenTable } from "./gebouwen";
import { gebruikersTable } from "./gebruikers";

export const modCalcTarievenTable = pgTable("mod_calc_tarieven", {
  id: serial("id").primaryKey(),
  naam: text("naam").notNull(),
  tarief: real("tarief").notNull().default(0),
  eenheid: text("eenheid").notNull().default("uur"),
  categorie: text("categorie").notNull().default("arbeid"),
  actief: boolean("actief").notNull().default(true),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export const modCalcNormtijdenTable = pgTable("mod_calc_normtijden", {
  id: serial("id").primaryKey(),
  code: text("code").notNull(),
  omschrijving: text("omschrijving").notNull(),
  categorie: text("categorie").notNull().default("brandwerende afdichting"),
  eenheid: text("eenheid").notNull().default("st"),
  urenPerEenheid: real("uren_per_eenheid").notNull().default(0),
  actief: boolean("actief").notNull().default(true),
});

export const modCalcHeadersTable = pgTable("mod_calc_headers", {
  id: serial("id").primaryKey(),
  naam: text("naam").notNull(),
  referentie: text("referentie"),
  klantNaam: text("klant_naam"),
  gebouwId: integer("gebouw_id").references(() => gebouwenTable.id, { onDelete: "set null" }),
  projectNaam: text("project_naam"),
  status: text("status").notNull().default("concept"),
  omschrijving: text("omschrijving"),
  opmerkingen: text("opmerkingen"),
  opslagAk: real("opslag_ak").notNull().default(15),
  opslagAbk: real("opslag_abk").notNull().default(10),
  opslagRisico: real("opslag_risico").notNull().default(5),
  opslagWinst: real("opslag_winst").notNull().default(10),
  korting: real("korting").notNull().default(0),
  aangemaaktDoorId: integer("aangemaakt_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export const modCalcRegelsTable = pgTable("mod_calc_regels", {
  id: serial("id").primaryKey(),
  calculatieId: integer("calculatie_id").notNull().references(() => modCalcHeadersTable.id, { onDelete: "cascade" }),
  categorie: text("categorie").notNull().default("arbeid"),
  omschrijving: text("omschrijving").notNull(),
  normtijdId: integer("normtijd_id").references(() => modCalcNormtijdenTable.id, { onDelete: "set null" }),
  eenheid: text("eenheid").notNull().default("st"),
  hoeveelheid: real("hoeveelheid").notNull().default(0),
  tarief: real("tarief").notNull().default(0),
  totaal: real("totaal").notNull().default(0),
  volgorde: integer("volgorde").notNull().default(0),
  opmerkingen: text("opmerkingen"),
  regelnummer: text("regelnummer"),
  muPerEenheid: real("mu_per_eenheid").notNull().default(0),
  arbeidsTarief: real("arbeids_tarief").notNull().default(0),
  onderaannemingBedrag: real("onderaanneming_bedrag").notNull().default(0),
  isStaartkosten: boolean("is_staartkosten").notNull().default(false),
  hoofdstuk: text("hoofdstuk").notNull().default("Overige werkzaamheden"),
  klanttekst: text("klanttekst"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});
