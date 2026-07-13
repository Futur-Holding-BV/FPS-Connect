import { pgTable, serial, integer, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { gebruikersTable } from "./gebruikers";

export const avgInzageverzoekTable = pgTable("avg_inzageverzoeken", {
  id: serial("id").primaryKey(),
  gebruikerId: integer("gebruiker_id")
    .notNull()
    .references(() => gebruikersTable.id, { onDelete: "cascade" }),
  type: text("type").notNull().default("inzage"),
  status: text("status").notNull().default("open"),
  opmerking: text("opmerking"),
  beheerderOpmerking: text("beheerder_opmerking"),
  afgerondOp: timestamp("afgerond_op"),
  geanonimiseerdOp: timestamp("geanonimiseerd_op"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export type AvgInzageverzoek = typeof avgInzageverzoekTable.$inferSelect;

// Logregel per uitvoering van de geautomatiseerde AVG-opschoonjob
// (activiteiten-retentie + anonimisering van langdurig inactieve accounts).
export const avgOpschoonLogTable = pgTable("avg_opschoon_log", {
  id: serial("id").primaryKey(),
  activiteitenVerwijderd: integer("activiteiten_verwijderd").notNull().default(0),
  accountsGeanonimiseerd: integer("accounts_geanonimiseerd").notNull().default(0),
  uitgevoerdOp: timestamp("uitgevoerd_op").notNull().defaultNow(),
});

export type AvgOpschoonLog = typeof avgOpschoonLogTable.$inferSelect;

// Verwerkersregister (AVG art. 30 lid 2): externe (sub-)verwerkers die namens
// de verwerkingsverantwoordelijke persoonsgegevens verwerken.
export const avgVerwerkersTable = pgTable("avg_verwerkers", {
  id: serial("id").primaryKey(),
  naam: text("naam").notNull(),
  land: text("land"),
  doel: text("doel"),
  categoriePersoonsgegevens: text("categorie_persoonsgegevens"),
  grondslag: text("grondslag"),
  vwoAanwezig: boolean("vwo_aanwezig").notNull().default(false),
  vwoDatum: text("vwo_datum"),
  contactpersoon: text("contactpersoon"),
  notities: text("notities"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export type AvgVerwerker = typeof avgVerwerkersTable.$inferSelect;
