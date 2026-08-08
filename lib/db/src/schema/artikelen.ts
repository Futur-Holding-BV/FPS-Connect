import { pgTable, serial, text, integer, real, boolean, timestamp } from "drizzle-orm/pg-core";
import { leveranciersTable } from "./leveranciers";

export const artikelenTable = pgTable("artikelen", {
  id: serial("id").primaryKey(),

  // Identificatie
  code: text("code"),                                    // artikelcode / ENK-code
  naam: text("naam").notNull(),
  omschrijving: text("omschrijving"),

  // Eigenschappen
  eenheid: text("eenheid").notNull().default("st"),      // st | m | m2 | m3 | uur | kg | set
  categorie: text("categorie"),
  merk: text("merk"),

  // Leverancier
  leverancierId: integer("leverancier_id").references(() => leveranciersTable.id, { onDelete: "set null" }),
  leveranciersArtikelNr: text("leveranciers_artikel_nr"),

  // Prijzen
  inkoopprijs: real("inkoopprijs"),                      // excl. BTW
  verkoopprijs: real("verkoopprijs"),                    // excl. BTW
  gemiddeldInkoopprijs: real("gemiddeld_inkoopprijs"),   // gewogen gemiddelde
  laatsteInkoopprijs: real("laatste_inkoopprijs"),       // meest recente inkoop
  btwPercentage: integer("btw_percentage").notNull().default(21),

  // Magazijn
  minimumVoorraad: real("minimum_voorraad"),
  gewensteVoorraad: real("gewenste_voorraad"),
  barcode: text("barcode"),
  locatieId: integer("locatie_id"),                      // FK magazijn_locaties, no Drizzle ref to avoid circular

  // Meta
  notities: text("notities"),
  actief: boolean("actief").notNull().default(true),
  bron: text("bron").notNull().default("handmatig"),     // "handmatig" | "import"
  importId: integer("import_id"),                        // IMPORT_01: verwijzing naar import_logs.id

  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),

  // KB-velden (additief — kennislaag voor AI-modules)
  goedgekeurdDoorFps: boolean("goedgekeurd_door_fps").notNull().default(false),
  toepassingsgebied: text("toepassingsgebied"),
  montagevoorschriften: text("montagevoorschriften"),
  compatibeleArtikelIds: integer("compatibele_artikel_ids").array(),
  alternatievelArtikelIds: integer("alternatieve_artikel_ids").array(),
  certificeringen: text("certificeringen").array(),
  kbNotities: text("kb_notities"),
});
