import { pgTable, serial, text, integer, real, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { gebruikersTable } from "./gebruikers";
import { leveranciersTable } from "./leveranciers";
import { facturenTable } from "./facturen";

// ── ALGEMENE INKOOP (NP_INKOOP_01) ────────────────────────────────────────────
// Inkoop die NIET aan een project/opdracht hangt: kantoorartikelen, gereedschap,
// PBM, webshopbestellingen. Bewust een eigen tabel — de bestaande inkooptabellen
// houden `opdracht_id NOT NULL` (de factuurcontrole rust op die verplichting).
//
// Twee soorten, één register:
//  - op_rekening    → nummer (A-reeks) ontstaat direct bij aanmaken; het nummer
//                     is een herkenningspunt voor de latere factuur, géén
//                     bestelproces. Status: besteld → factuur_ontvangen → afgehandeld.
//  - direct_betaald → geen nummer-functie vooraf; bon (foto/pdf) is verplicht
//                     om af te ronden. Status: open → afgehandeld.
// Boven de goedkeuringsgrens start de regel in `ter_goedkeuring` (generieke
// goedkeuringsmotor, documenttype "algemene_inkoop"); na goedkeuring valt hij
// terug op de normale beginstatus van zijn soort.
export const ALGEMENE_INKOOP_SOORTEN = ["op_rekening", "direct_betaald"] as const;
export type AlgemeneInkoopSoort = typeof ALGEMENE_INKOOP_SOORTEN[number];

export const ALGEMENE_INKOOP_STATUSSEN = [
  "ter_goedkeuring",
  "besteld",            // op_rekening: nummer uitgereikt, wacht op factuur
  "factuur_ontvangen",  // op_rekening: factuurstroom heeft de factuur gekoppeld
  "open",               // direct_betaald: vastgelegd, bon nog niet compleet/afgerond
  "afgehandeld",
] as const;
export type AlgemeneInkoopStatus = typeof ALGEMENE_INKOOP_STATUSSEN[number];

export const ALGEMENE_INKOOP_BETAALWIJZEN = ["zakelijke_pas", "creditcard", "contant", "ideal"] as const;

// Kostensoorten sluiten aan op de factuurcategorieën (facturen.categorie),
// zodat de overname als voorstel op de factuur geen vertaalslag nodig heeft.
export const ALGEMENE_INKOOP_KOSTENSOORTEN = [
  "algemene_kosten",
  "gereedschap",
  "wagenpark",
  "investering",
  "representatie",
  "software",
  "verzekering",
] as const;

export const algemeneInkopenTable = pgTable("algemene_inkopen", {
  id: serial("id").primaryKey(),
  // A-reeks (NUMMER_01-conform: DB-sequence, doorlopend, nooit hergebruikt).
  nummer: integer("nummer").notNull().default(sql`nextval('seq_nummer_a')`),
  soort: text("soort").notNull(), // AlgemeneInkoopSoort
  status: text("status").notNull(), // AlgemeneInkoopStatus

  // Leverancier: FK naar het bestaande `leveranciers`-register + naam-cache
  // (zelfde patroon als elders; GEEN derde register).
  leverancierId: integer("leverancier_id").references(() => leveranciersTable.id, { onDelete: "set null" }),
  leverancierNaam: text("leverancier_naam").notNull(),

  omschrijving: text("omschrijving").notNull(),
  kostensoort: text("kostensoort").notNull(), // verplicht — geen inkoop zonder kostensoort
  verwachtBedrag: real("verwacht_bedrag"),    // incl. btw; op_rekening: vergelijking met factuur
  besteldDoorId: integer("besteld_door_id").notNull().references(() => gebruikersTable.id, { onDelete: "restrict" }),

  // Direct betaald
  betaalwijze: text("betaalwijze"),  // zakelijke_pas | creditcard | contant | ideal
  betaaldOp: text("betaald_op"),     // ISO-date
  bedrag: real("bedrag"),            // werkelijk betaald bedrag (direct betaald)
  bonPad: text("bon_pad"),           // /objects/... — bewijsstuk (foto of pdf)

  // Factuurkoppeling (op rekening) — gezet door de factuurstroom bij nummermatch
  factuurId: integer("factuur_id").references(() => facturenTable.id, { onDelete: "set null" }),
  factuurGekoppeldOp: timestamp("factuur_gekoppeld_op"),

  opmerkingen: text("opmerkingen"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export type AlgemeneInkoop = typeof algemeneInkopenTable.$inferSelect;
