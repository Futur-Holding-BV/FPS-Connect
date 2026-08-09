// Actiepunten — persoonlijke to-dolijst van de hoofdbeheerder in de zijrand.
// Houdt acties bij waar het platform op een mens wacht (Azure, mailing, VPS,
// app-store-accounts) zodat niets vergeten wordt. Zie migratie 0031.
import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const actiepuntenTable = pgTable("actiepunten", {
  id: serial("id").primaryKey(),
  titel: text("titel").notNull(),
  omschrijving: text("omschrijving"),
  // platform | testen | app-stores | overig
  categorie: text("categorie").notNull().default("overig"),
  // open | afgerond
  status: text("status").notNull().default("open"),
  volgorde: integer("volgorde").notNull().default(0),
  afgerondOp: timestamp("afgerond_op"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});
