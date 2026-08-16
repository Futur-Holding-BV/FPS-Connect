import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const declaratiesTable = pgTable("declaraties", {
  id:                serial("id").primaryKey(),
  medewerkerId:      integer("medewerker_id").notNull(),
  categorie:         text("categorie").notNull(),
  omschrijving:      text("omschrijving").notNull(),
  bedragTotaalCents: integer("bedrag_totaal_cents").notNull(),
  datum:             text("datum").notNull(),
  status:            text("status").notNull().default("concept"),
  ingediendOp:       timestamp("ingediend_op"),
  beoordeeldOp:      timestamp("beoordeeld_op"),
  beoordeeldDoor:    integer("beoordeeld_door"),
  afwijzingsreden:   text("afwijzingsreden"),
  // Doorzetten: beoordelaar zet een ingediende declaratie bij twijfel door
  // naar een andere beoordelaar (migratie 0057).
  doorgezetNaar:     integer("doorgezet_naar"),
  doorgezetDoor:     integer("doorgezet_door"),
  doorgezetOp:       timestamp("doorgezet_op"),
  doorzetToelichting: text("doorzet_toelichting"),
  verwerkingOp:      timestamp("verwerking_op"),
  verwerktDoor:      integer("verwerkt_door"),
  bijlagePad:        text("bijlage_pad"),
  aangemeldOp:       timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp:      timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export const declaratieBeleidTable = pgTable("declaratie_beleid", {
  id:            serial("id").primaryKey(),
  inhoud:        text("inhoud").notNull().default(""),
  bijgewerktOp:  timestamp("bijgewerkt_op").notNull().defaultNow(),
  bijgewerktDoor: integer("bijgewerkt_door"),
});
