import { pgTable, serial, text, integer, real, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
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

export const modCalcLeveranciersTable = pgTable("mod_calc_leveranciers", {
  id: serial("id").primaryKey(),
  naam: text("naam").notNull(),
  contactpersoon: text("contactpersoon"),
  email: text("email"),
  telefoon: text("telefoon"),
  website: text("website"),
  notities: text("notities"),
  actief: boolean("actief").notNull().default(true),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export const modCalcArtekelenTable = pgTable("mod_calc_artikelen", {
  id: serial("id").primaryKey(),
  leverancierId: integer("leverancier_id").references(() => modCalcLeveranciersTable.id, { onDelete: "set null" }),
  artikelcode: text("artikelcode"),
  omschrijving: text("omschrijving").notNull(),
  eenheid: text("eenheid").notNull().default("st"),
  inkoopprijs: real("inkoopprijs").notNull().default(0),
  verkoopprijs: real("verkoopprijs").notNull().default(0),
  categorie: text("categorie").notNull().default("materiaal"),
  actief: boolean("actief").notNull().default(true),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
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
  opslagMateriaal: real("opslag_materiaal").notNull().default(0),
  opslagArbeid: real("opslag_arbeid").notNull().default(0),
  opslagAk: real("opslag_ak").notNull().default(15),
  opslagAbk: real("opslag_abk").notNull().default(10),
  opslagRisico: real("opslag_risico").notNull().default(5),
  opslagWinst: real("opslag_winst").notNull().default(10),
  korting: real("korting").notNull().default(0),
  akIsVast: boolean("ak_is_vast").notNull().default(false),
  abkIsVast: boolean("abk_is_vast").notNull().default(false),
  risicoIsVast: boolean("risico_is_vast").notNull().default(false),
  winstIsVast: boolean("winst_is_vast").notNull().default(false),
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
  artikelId: integer("artikel_id").references(() => modCalcArtekelenTable.id, { onDelete: "set null" }),
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
  isBouwplaatskosten: boolean("is_bouwplaatskosten").notNull().default(false),
  hoofdstuk: text("hoofdstuk").notNull().default("Overige werkzaamheden"),
  klanttekst: text("klanttekst"),
  btwTarief: text("btw_tarief").notNull().default("21"),
  wandPlafond: text("wand_plafond"),
  toepassingTekst: text("toepassing_tekst"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export const modCalcVersiesTable = pgTable("mod_calc_versies", {
  id: serial("id").primaryKey(),
  calculatieId: integer("calculatie_id").notNull().references(() => modCalcHeadersTable.id, { onDelete: "cascade" }),
  versienummer: integer("versienummer").notNull().default(1),
  label: text("label"),
  snapshot: jsonb("snapshot").notNull().$type<Record<string, unknown>>(),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  aangemaaktDoorId: integer("aangemaakt_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
});
