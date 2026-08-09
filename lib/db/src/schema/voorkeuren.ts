// PANEEL_01 §4.4 / MENU_01 §4.3 — generiek per-gebruiker UI-voorkeurenmechanisme.
// Eén enkele opslag voor alle UI-voorkeuren van een gebruiker (paneelbreedtes,
// menu-inklapstatus, gekozen sorteringen/filters, enz.). Sleutel = vrije,
// door de frontend gekozen naam; waarde = willekeurige JSON. Er is bewust géén
// tweede opslag: alle UI-voorkeuren lopen via deze tabel.
import { pgTable, serial, integer, text, jsonb, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { gebruikersTable } from "./gebruikers";

export const gebruikerVoorkeurenTable = pgTable(
  "gebruiker_voorkeuren",
  {
    id: serial("id").primaryKey(),
    gebruikerId: integer("gebruiker_id")
      .notNull()
      .references(() => gebruikersTable.id, { onDelete: "cascade" }),
    // Vrije sleutel, door de frontend bepaald (bv. "paneel.breedte.projecten").
    sleutel: text("sleutel").notNull(),
    // Willekeurige JSON-waarde die bij de sleutel hoort.
    waarde: jsonb("waarde").$type<unknown>().notNull(),
    bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
  },
  (t) => [
    // Eén rij per gebruiker + sleutel; grondslag voor de upsert (onConflict).
    uniqueIndex("gebruiker_voorkeuren_gebruiker_id_sleutel_unique").on(t.gebruikerId, t.sleutel),
  ],
);

export type GebruikerVoorkeur = typeof gebruikerVoorkeurenTable.$inferSelect;
