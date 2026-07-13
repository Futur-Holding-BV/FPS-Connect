import { pgTable, serial, text, integer, real, timestamp, boolean } from "drizzle-orm/pg-core";
import { gebruikersTable } from "./gebruikers";
import { opdrachtenTable } from "./opdrachten";
import { werkbegrotingRegelsTable } from "./planning";
import { leveranciersTable } from "./leveranciers";
void leveranciersTable;

// ── INKOOPPLANNEN ─────────────────────────────────────────────────────────────
// AI-gegenereerde inkoopplanning per opdracht; één actief plan per opdracht.
// Status: concept → gereed (na goedkeuring projectleider)

export const inkoopplannenTable = pgTable("inkoopplannen", {
  id: serial("id").primaryKey(),
  opdrachtId: integer("opdracht_id").notNull().references(() => opdrachtenTable.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("concept"), // concept | gereed
  aiGegenereerd: boolean("ai_gegenereerd").notNull().default(false),
  aiGegeneerdOp: timestamp("ai_gegenereerd_op"),
  // Samenvatting van AI (totale besparing, aandachtspunten)
  aiSamenvatting: text("ai_samenvatting"),
  totaleBesparing: real("totale_besparing"),
  vastgesteldOp: timestamp("vastgesteld_op"),
  vastgesteldDoorId: integer("vastgesteld_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  opmerkingen: text("opmerkingen"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// ── INKOOPPLAN REGELS ──────────────────────────────────────────────────────────
// Één regel per materiaal-/artikel-item uit de werkbegroting.
// AI classificeert type (voorraad/project/maatwerk), berekent levertijden en besteldatums.

export const inkoopplanRegelsTable = pgTable("inkoopplan_regels", {
  id: serial("id").primaryKey(),
  inkoopplanId: integer("inkoopplan_id").notNull().references(() => inkoopplannenTable.id, { onDelete: "cascade" }),
  werkbegrotingRegelId: integer("werkbegroting_regel_id").references(() => werkbegrotingRegelsTable.id, { onDelete: "set null" }),
  omschrijving: text("omschrijving").notNull(),
  hoeveelheid: real("hoeveelheid").notNull().default(0),
  eenheid: text("eenheid").notNull().default("st"),
  // voorraad | project | maatwerk | standaard — door AI geclassificeerd
  type: text("type").notNull().default("standaard"),
  leverancier: text("leverancier"),                // door gebruiker in te vullen / AI voorstel
  aanbevolenLeverancier: text("aanbevolen_leverancier"), // AI-voorstel
  calcPrijs: real("calc_prijs"),                   // prijs uit calculatie
  inkoopprijsVerwacht: real("inkoopprijs_verwacht"), // AI-schatting marktprijs
  inkoopprijs: real("inkoopprijs"),                // definitief door gebruiker vastgesteld
  besparingPerEenheid: real("besparing_per_eenheid"),
  besparing: real("besparing"),                    // totale besparing tov calc
  levertijdWeken: integer("levertijd_weken"),      // AI-schatting
  gewensteLeverdatum: text("gewenste_leverdatum"), // ISO-date
  besteldatum: text("besteldatum"),               // ISO-date (berekend: leverdatum - levertijd)
  // open | uit_voorraad | besteld | geleverd
  status: text("status").notNull().default("open"),
  aiMotivatie: text("ai_motivatie"),              // AI-toelichting type/besparing/levertijd
  opmerkingen: text("opmerkingen"),
  // calculatie = afgeleid uit werkbegroting/AI; vrij = handmatig toegevoegd
  bron: text("bron").notNull().default("calculatie"),
  // artikelbron van de gehanteerde prijs: onbekend | jaarprijslijst | leveranciersofferte | vrij
  prijsBron: text("prijs_bron").notNull().default("onbekend"),
  // geldig tot (ISO-date) — relevant bij leveranciersofferteprijzen
  prijsGeldigTot: text("prijs_geldig_tot"),
  volgorde: integer("volgorde").notNull().default(0),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// ── INKOOPBONNEN ──────────────────────────────────────────────────────────────
// Digitale inkoopbon per leverancier, gegenereerd uit inkoopplan regels.

export const inkoopbonnenTable = pgTable("inkoopbonnen", {
  id: serial("id").primaryKey(),
  inkoopplanId: integer("inkoopplan_id").references(() => inkoopplannenTable.id, { onDelete: "set null" }),
  opdrachtId: integer("opdracht_id").notNull().references(() => opdrachtenTable.id, { onDelete: "cascade" }),
  bonNummer: text("bon_nummer"),                   // bijv. IB-2025-001
  leverancier: text("leverancier").notNull(),
  leverancierId: integer("leverancier_id").references(() => leveranciersTable.id, { onDelete: "set null" }),
  gewensteLeverdatum: text("gewenste_leverdatum"),
  totaalBedrag: real("totaal_bedrag"),
  // concept | goedgekeurd | besteld | geleverd
  status: text("status").notNull().default("concept"),
  goedgekeurdDoorId: integer("goedgekeurd_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  goedgekeurdOp: timestamp("goedgekeurd_op"),
  opmerkingen: text("opmerkingen"),
  verzondenOp: timestamp("verzonden_op"),
  verzondenNaar: text("verzonden_naar"),
  aiSuggestie: boolean("ai_suggestie").notNull().default(false),
  aiMotivatie: text("ai_motivatie"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export const inkoopbonRegelsTable = pgTable("inkoopbon_regels", {
  id: serial("id").primaryKey(),
  inkoopbonId: integer("inkoopbon_id").notNull().references(() => inkoopbonnenTable.id, { onDelete: "cascade" }),
  inkoopplanRegelId: integer("inkoopplan_regel_id").references(() => inkoopplanRegelsTable.id, { onDelete: "set null" }),
  omschrijving: text("omschrijving").notNull(),
  hoeveelheid: real("hoeveelheid").notNull().default(0),
  eenheid: text("eenheid").notNull().default("st"),
  prijs: real("prijs"),
  totaal: real("totaal"),
  volgorde: integer("volgorde").notNull().default(0),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// ── UITVOERINGSPLANNEN ────────────────────────────────────────────────────────
// AI-gegenereerde uitvoeringsplanning (géén personeelsplanning; basis voor centrale planner).

export const uitvoeringsplannenTable = pgTable("uitvoeringsplannen", {
  id: serial("id").primaryKey(),
  opdrachtId: integer("opdracht_id").notNull().references(() => opdrachtenTable.id, { onDelete: "cascade" }),
  // concept | gereed_voor_planning
  status: text("status").notNull().default("concept"),
  aiGegenereerd: boolean("ai_gegenereerd").notNull().default(false),
  aiGegeneerdOp: timestamp("ai_gegenereerd_op"),
  aiSamenvatting: text("ai_samenvatting"),
  startdatum: text("startdatum"),                 // ISO-date verwachte start
  einddatum: text("einddatum"),                   // ISO-date verwachte oplevering
  totaalWeken: integer("totaal_weken"),
  vastgesteldOp: timestamp("vastgesteld_op"),
  vastgesteldDoorId: integer("vastgesteld_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  opmerkingen: text("opmerkingen"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// ── UITVOERINGSPLAN TAKEN ─────────────────────────────────────────────────────
// Taken/werkzaamheden per uitvoeringsplan, gegroepeerd in fasen.

export const uitvoeringsplanTakenTable = pgTable("uitvoeringsplan_taken", {
  id: serial("id").primaryKey(),
  uitvoeringsplanId: integer("uitvoeringsplan_id").notNull().references(() => uitvoeringsplannenTable.id, { onDelete: "cascade" }),
  volgorde: integer("volgorde").notNull().default(0),
  fase: text("fase"),                             // bijv. "Fase 1 — Voorbereiding"
  omschrijving: text("omschrijving").notNull(),
  discipline: text("discipline"),                 // bijv. "Brandweerring", "Doorvoering"
  duurDagen: integer("duur_dagen"),
  benodigdeMedewerkers: integer("benodigde_medewerkers"),
  urenbegroting: real("urenbegroting"),
  // Afhankelijkheden: komma-gescheiden ID's van voorgaande taken
  afhankelijkVanIds: text("afhankelijk_van_ids"),
  materiaalMoment: text("materiaal_moment"),      // bijv. "dag 1: deuren, dag 5: glas"
  aiMotivatie: text("ai_motivatie"),
  opmerkingen: text("opmerkingen"),
  aiGegenereerd: boolean("ai_gegenereerd").notNull().default(true),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// ── ONDERAANNEMER ORDERS ───────────────────────────────────────────────────────
// Uitbestedingsopdrachten aan onderaannemers, per opdracht.
// Status: concept → uitbesteed → uitgevoerd → betaald
// Kan los van de inkoopplanning bestaan (niet per se afgeleid uit werkbegroting).

export const onderaannemeOrdersTable = pgTable("onderaannemer_orders", {
  id: serial("id").primaryKey(),
  opdrachtId: integer("opdracht_id").notNull().references(() => opdrachtenTable.id, { onDelete: "cascade" }),
  omschrijving: text("omschrijving").notNull(),
  bedrijf: text("bedrijf"),
  contactpersoon: text("contactpersoon"),
  werkzaamheden: text("werkzaamheden"),
  bedragExclBtw: real("bedrag_excl_btw"),
  btwPercentage: real("btw_percentage").notNull().default(21),
  // concept | uitbesteed | uitgevoerd | betaald | geannuleerd
  status: text("status").notNull().default("concept"),
  gewensteStartdatum: text("gewenste_startdatum"),
  gewensteEinddatum: text("gewenste_einddatum"),
  opmerkingen: text("opmerkingen"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});
