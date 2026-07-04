import {
  pgTable, serial, text, integer, real, boolean, timestamp, pgEnum, unique, jsonb,
} from "drizzle-orm/pg-core";
import { artikelenTable } from "./artikelen";
import { gebruikersTable } from "./gebruikers";
import { opdrachtenTable } from "./opdrachten";

// ═══════════════════════════════════════════════════════════
// Locaties
// ═══════════════════════════════════════════════════════════

export const magazijnLocatiesTable = pgTable("magazijn_locaties", {
  id:           serial("id").primaryKey(),
  naam:         text("naam").notNull(),
  type:         text("type").notNull().default("rek"),   // rek | bus | vak | ruimte | extern
  parentId:     integer("parent_id"),                    // self-ref, FK gecreëerd als ALTER
  omschrijving: text("omschrijving"),
  actief:       boolean("actief").notNull().default(true),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// ═══════════════════════════════════════════════════════════
// Voorraad (hoeveelheid per artikel × locatie)
// ═══════════════════════════════════════════════════════════

export const voorraadTable = pgTable(
  "voorraad",
  {
    id:           serial("id").primaryKey(),
    artikelId:    integer("artikel_id").notNull().references(() => artikelenTable.id, { onDelete: "cascade" }),
    locatieId:    integer("locatie_id").references(() => magazijnLocatiesTable.id, { onDelete: "set null" }),
    hoeveelheid:  real("hoeveelheid").notNull().default(0),
    gereserveerd: real("gereserveerd").notNull().default(0),
    besteld:      real("besteld").notNull().default(0),
    bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
  },
  (t) => [unique("voorraad_artikel_locatie").on(t.artikelId, t.locatieId)],
);

// ═══════════════════════════════════════════════════════════
// Mutaties (volledig audit-trail)
// ═══════════════════════════════════════════════════════════

export const voorraadMutatiesTable = pgTable("voorraad_mutaties", {
  id:              serial("id").primaryKey(),
  artikelId:       integer("artikel_id").notNull().references(() => artikelenTable.id, { onDelete: "cascade" }),
  locatieId:       integer("locatie_id").references(() => magazijnLocatiesTable.id, { onDelete: "set null" }),
  type:            text("type").notNull(),   // inkoop | uitgifte | retour | correctie | reservering | vrijgave
  hoeveelheid:     real("hoeveelheid").notNull(),   // altijd positief
  delta:           real("delta").notNull(),          // positief = toename, negatief = afname
  referentieType:  text("referentie_type"),          // opdracht | inkoopbon | reservering | null
  referentieId:    integer("referentie_id"),
  opdrachtId:      integer("opdracht_id").references(() => opdrachtenTable.id, { onDelete: "set null" }),
  gebruikerId:     integer("gebruiker_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  omschrijving:    text("omschrijving"),
  aangemaaktOp:    timestamp("aangemaakt_op").notNull().defaultNow(),
});

// ═══════════════════════════════════════════════════════════
// Reserveringen
// ═══════════════════════════════════════════════════════════

export const reserveringenTable = pgTable("reserveringen", {
  id:              serial("id").primaryKey(),
  artikelId:       integer("artikel_id").notNull().references(() => artikelenTable.id, { onDelete: "cascade" }),
  opdrachtId:      integer("opdracht_id").references(() => opdrachtenTable.id, { onDelete: "set null" }),
  hoeveelheid:     real("hoeveelheid").notNull(),
  gereserveerdOp:  timestamp("gereserveerd_op").notNull().defaultNow(),
  status:          text("status").notNull().default("open"),   // open | gedeeltelijk | volledig | geannuleerd
  omschrijving:    text("omschrijving"),
  aangemaaktDoorId: integer("aangemaakt_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  bijgewerktOp:    timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// ═══════════════════════════════════════════════════════════
// Stellingscans (AI-gestuurde voorraadcontrole via foto)
// ═══════════════════════════════════════════════════════════

export const magazijnStellingscansTable = pgTable("magazijn_stellingscans", {
  id:                serial("id").primaryKey(),
  scanType:          text("scan_type").notNull().default("voorraadcontrole"), // voorraadcontrole | retour
  fotoPad:           text("foto_pad").notNull(),
  locatieId:         integer("locatie_id").references(() => magazijnLocatiesTable.id, { onDelete: "set null" }),
  aangemaaaktDoorId: integer("aangemaakt_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangemaaktOp:      timestamp("aangemaakt_op").notNull().defaultNow(),
  status:            text("status").notNull().default("analyseren"), // analyseren | gereed | goedgekeurd
  aiSuggesties:      jsonb("ai_suggesties"),
  goedgekeurdOp:     timestamp("goedgekeurd_op"),
  goedgekeurdDoorId: integer("goedgekeurd_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  // Retour-specifiek: vanuit welk project en locatie komen de artikelen terug
  retourProjectId:   integer("retour_project_id").references(() => opdrachtenTable.id, { onDelete: "set null" }),
  retourOmschrijving: text("retour_omschrijving"),
});
