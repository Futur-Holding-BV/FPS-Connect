import {
  pgTable, serial, text, integer, real, boolean, timestamp, unique, jsonb,
} from "drizzle-orm/pg-core";
import { artikelenTable } from "./artikelen";
import { gebruikersTable } from "./gebruikers";
import { opdrachtenTable } from "./opdrachten";
import { leveranciersTable } from "./leveranciers";

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
  omschrijving:        text("omschrijving"),
  aangemaaktOp:        timestamp("aangemaakt_op").notNull().defaultNow(),
  accountviewExportOp: timestamp("accountview_export_op"),
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
// Signalering-instellingen (singleton rij, id altijd 1)
// ═══════════════════════════════════════════════════════════

export const magazijnInstellingenTable = pgTable("magazijn_instellingen", {
  id:               integer("id").primaryKey().default(1),
  signaleringUur:   integer("signalering_uur").notNull().default(7),     // 0-23
  signaleringMinuut: integer("signalering_minuut").notNull().default(0), // 0-59
  signaleringMarge: integer("signalering_marge").notNull().default(0),   // extra buffer bovenop minimumvoorraad
  bijgewerktOp:     timestamp("bijgewerkt_op").notNull().defaultNow(),
  bijgewerktDoorId: integer("bijgewerkt_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
});

// ═══════════════════════════════════════════════════════════
// Snoozes — tijdelijk onderdrukken van de dagelijkse e-mail per artikel
// ═══════════════════════════════════════════════════════════

export const magazijnSnoozesTable = pgTable("magazijn_snoozes", {
  id:            serial("id").primaryKey(),
  artikelId:     integer("artikel_id").notNull().references(() => artikelenTable.id, { onDelete: "cascade" }).unique(),
  gesnoozedTot:  timestamp("gesnoozed_tot").notNull(),
  reden:         text("reden"),
  aangemaaktDoorId: integer("aangemaakt_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangemaaktOp:  timestamp("aangemaakt_op").notNull().defaultNow(),
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

// ═══════════════════════════════════════════════════════════
// Inkooporders (bestelworkflow voor voorraadaanvulling)
// Statusmachine: concept → verstuurd → bevestigd → gedeeltelijk_ontvangen → volledig_ontvangen
// ═══════════════════════════════════════════════════════════

export const magazijnInkoopordersTable = pgTable("magazijn_inkooporders", {
  id:                    serial("id").primaryKey(),
  nummer:                text("nummer"),              // INK-2026-0001 (server-generated)
  status:                text("status").notNull().default("concept"),
  // concept | verstuurd | bevestigd | gedeeltelijk_ontvangen | volledig_ontvangen | geannuleerd
  leverancierId:         integer("leverancier_id").references(() => leveranciersTable.id, { onDelete: "set null" }),
  leverancierNaam:       text("leverancier_naam"),    // naam-cache
  leverancierEmail:      text("leverancier_email"),   // e-mail-cache voor versturen
  verwachteLeverdatum:   timestamp("verwachte_leverdatum"),
  werkelijkeLeverdatum:  timestamp("werkelijke_leverdatum"),
  notities:              text("notities"),
  referentie:            text("referentie"),          // leverancier-ordernummer na bevestiging
  aangemaaktDoorId:      integer("aangemaakt_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangemaaktOp:          timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp:          timestamp("bijgewerkt_op").notNull().defaultNow(),
  verstuurdOp:           timestamp("verstuurd_op"),
  bevestigdOp:           timestamp("bevestigd_op"),
  ontvangenOp:           timestamp("ontvangen_op"),
});

export const magazijnInkooporderRegelsTable = pgTable("magazijn_inkooporder_regels", {
  id:                    serial("id").primaryKey(),
  inkooporderId:         integer("inkooporder_id").notNull().references(() => magazijnInkoopordersTable.id, { onDelete: "cascade" }),
  artikelId:             integer("artikel_id").notNull().references(() => artikelenTable.id, { onDelete: "cascade" }),
  gevraagdHoeveelheid:   real("gevraagd_hoeveelheid").notNull(),
  ontvangenHoeveelheid:  real("ontvangen_hoeveelheid").notNull().default(0),
  eenheidsprijs:         real("eenheidsprijs"),
  btwPercentage:         integer("btw_percentage").notNull().default(21),
  omschrijving:          text("omschrijving"),
  aangemaaktOp:          timestamp("aangemaakt_op").notNull().defaultNow(),
});

// ═══════════════════════════════════════════════════════════
// Picklijsten (materiaalvoorbereiding per project)
// Statusmachine: concept → in_uitvoering → voltooid | deels_voltooid
// ═══════════════════════════════════════════════════════════

export const magazijnPicklijstenTable = pgTable("magazijn_picklijsten", {
  id:                  serial("id").primaryKey(),
  opdrachtId:          integer("opdracht_id").references(() => opdrachtenTable.id, { onDelete: "set null" }),
  opdrachtTitel:       text("opdracht_titel"),   // cache
  status:              text("status").notNull().default("concept"),
  // concept | in_uitvoering | voltooid | deels_voltooid | geannuleerd
  geplandeUitgifteOp:  timestamp("geplande_uitgifte_op"),
  notities:            text("notities"),
  aangemaaktDoorId:    integer("aangemaakt_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  verwerktDoorId:      integer("verwerkt_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangemaaktOp:        timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp:        timestamp("bijgewerkt_op").notNull().defaultNow(),
  verwerktOp:          timestamp("verwerkt_op"),
});

export const magazijnPicklijstRegelsTable = pgTable("magazijn_picklijst_regels", {
  id:                  serial("id").primaryKey(),
  picklijstId:         integer("picklijst_id").notNull().references(() => magazijnPicklijstenTable.id, { onDelete: "cascade" }),
  artikelId:           integer("artikel_id").notNull().references(() => artikelenTable.id, { onDelete: "cascade" }),
  locatieId:           integer("locatie_id").references(() => magazijnLocatiesTable.id, { onDelete: "set null" }),
  gevraagdHoeveelheid: real("gevraagd_hoeveelheid").notNull(),
  gepicktHoeveelheid:  real("gepickt_hoeveelheid").notNull().default(0),
  status:              text("status").notNull().default("open"), // open | gepickt | niet_beschikbaar
  aangemaaktOp:        timestamp("aangemaakt_op").notNull().defaultNow(),
});
