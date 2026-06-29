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

  // Prijzen
  inkoopprijs: real("inkoopprijs"),                      // excl. BTW
  verkoopprijs: real("verkoopprijs"),                    // excl. BTW
  btwPercentage: integer("btw_percentage").notNull().default(21),

  // Leverancier
  leverancierId: integer("leverancier_id").references(() => leveranciersTable.id, { onDelete: "set null" }),

  // Meta
  notities: text("notities"),
  actief: boolean("actief").notNull().default(true),
  bron: text("bron").notNull().default("handmatig"),     // "handmatig" | "import"

  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});
