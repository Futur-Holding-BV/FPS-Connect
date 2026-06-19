import { pgTable, serial, text, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { gebruikersTable } from "./gebruikers";

// Gesprekken — container voor direct (2 deelnemers) of groep (>2, heeft naam)
export const chatGesprekkenTable = pgTable("chat_gesprekken", {
  id: serial("id").primaryKey(),
  type: text("type").notNull().default("direct"),     // "direct" | "groep"
  naam: text("naam"),                                  // alleen voor groepen
  aangemaaktDoorId: integer("aangemaakt_door_id").references(
    () => gebruikersTable.id,
    { onDelete: "set null" },
  ),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(), // update bij elk nieuw bericht
});

// Deelnemers — wie is lid van welk gesprek; gelezenTot = id van het laatste gelezen bericht
export const chatDeelnemersTable = pgTable(
  "chat_deelnemers",
  {
    id: serial("id").primaryKey(),
    gesprekId: integer("gesprek_id")
      .notNull()
      .references(() => chatGesprekkenTable.id, { onDelete: "cascade" }),
    gebruikerId: integer("gebruiker_id")
      .notNull()
      .references(() => gebruikersTable.id, { onDelete: "cascade" }),
    gelezenTot: integer("gelezen_tot"),  // id van het laatste bericht dat de gebruiker heeft gelezen
    joinedOp: timestamp("joined_op").notNull().defaultNow(),
  },
  (t) => [unique("chat_deelnemers_gesprek_gebruiker").on(t.gesprekId, t.gebruikerId)],
);

// Berichten — inhoud van elk bericht binnen een gesprek
export const chatBerichtenTable = pgTable("chat_berichten", {
  id: serial("id").primaryKey(),
  gesprekId: integer("gesprek_id")
    .notNull()
    .references(() => chatGesprekkenTable.id, { onDelete: "cascade" }),
  afzenderId: integer("afzender_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  inhoud: text("inhoud").notNull(),
  bijlageUrl: text("bijlage_url"),    // objectPath in object storage
  bijlageType: text("bijlage_type"), // "foto"
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
});

export type ChatGesprek = typeof chatGesprekkenTable.$inferSelect;
export type ChatDeelnemer = typeof chatDeelnemersTable.$inferSelect;
export type ChatBericht = typeof chatBerichtenTable.$inferSelect;
