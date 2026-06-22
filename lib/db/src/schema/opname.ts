import { pgTable, serial, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { gebouwenTable } from "./gebouwen";
import { verdiepingenTable } from "./gebouwen";
import { gebruikersTable } from "./gebruikers";

// Opname — een veldopname van een gebouw door de projectleider
export const opnamesTable = pgTable("opnames", {
  id:               serial("id").primaryKey(),
  gebouwId:         integer("gebouw_id").references(() => gebouwenTable.id, { onDelete: "set null" }),
  naam:             text("naam").notNull(),
  datum:            text("datum").notNull(),           // ISO-datum (YYYY-MM-DD)
  status:           text("status").notNull().default("concept"),  // concept | definitief
  notities:         text("notities"),
  aangemaaktDoorId: integer("aangemaakt_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangemaaktOp:     timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp:     timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// OpnameItem — één bevinding/waarneming binnen een opname
export const opnameItemsTable = pgTable("opname_items", {
  id:              serial("id").primaryKey(),
  opnameId:        integer("opname_id").notNull().references(() => opnamesTable.id, { onDelete: "cascade" }),
  spotType:        text("spot_type").notNull(),         // branddeur | doorvoering | brandklep | manchet | coating | luik | dakdoorvoer | overig
  ruimte:          text("ruimte"),
  verdiepingId:    integer("verdieping_id").references(() => verdiepingenTable.id, { onDelete: "set null" }),
  beschrijving:    text("beschrijving"),                // wat er te zien is / de huidige situatie
  actie:           text("actie").notNull().default("controleren"), // vervangen | opwaarderen | controleren | niet-brandwerend-afwerken
  bereikbaarheid:  text("bereikbaarheid").notNull().default("goed"), // goed | beperkt | moeilijk
  aantal:          integer("aantal").notNull().default(1),
  afmetingen:      text("afmetingen"),                 // vrije tekst breedte×hoogte of maat
  prioriteit:      text("prioriteit").notNull().default("normaal"), // laag | normaal | hoog
  notities:        text("notities"),
  afgerond:        boolean("afgerond").notNull().default(false),
  aangemaaktOp:    timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp:    timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// OpnameFoto — foto's gekoppeld aan een opname-item
export const opnameFotosTable = pgTable("opname_fotos", {
  id:           serial("id").primaryKey(),
  itemId:       integer("item_id").notNull().references(() => opnameItemsTable.id, { onDelete: "cascade" }),
  objectPath:   text("object_path").notNull(),          // pad in object storage
  bijschrift:   text("bijschrift"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
});

export type Opname      = typeof opnamesTable.$inferSelect;
export type OpnameItem  = typeof opnameItemsTable.$inferSelect;
export type OpnameFoto  = typeof opnameFotosTable.$inferSelect;
