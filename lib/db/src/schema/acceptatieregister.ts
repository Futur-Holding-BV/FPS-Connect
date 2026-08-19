// Acceptatieregister (REGISTER_01) — één regel per acceptatiepunt per opdracht.
// Standen: gehaald | niet_gebouwd | onbewezen | wacht_op_rene.
// "onbewezen" = bestaat in de code maar het door de opdracht geëiste bewijs
// ontbreekt. Zie migratie 0093.
import { pgTable, serial, text, integer, timestamp, unique } from "drizzle-orm/pg-core";

export const acceptatieRegisterTable = pgTable(
  "acceptatie_register",
  {
    id: serial("id").primaryKey(),
    opdrachtCode: text("opdracht_code").notNull(),
    puntNummer: integer("punt_nummer").notNull(),
    omschrijving: text("omschrijving").notNull(),
    stand: text("stand").notNull().default("onbewezen"),
    bewijsVindplaats: text("bewijs_vindplaats"),
    bronBestand: text("bron_bestand"),
    toelichting: text("toelichting"),
    aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
    bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
  },
  (t) => [unique("acceptatie_register_uniek").on(t.opdrachtCode, t.puntNummer)],
);

export const ACCEPTATIE_STANDEN = ["gehaald", "niet_gebouwd", "onbewezen", "wacht_op_rene"] as const;
export type AcceptatieStand = (typeof ACCEPTATIE_STANDEN)[number];
