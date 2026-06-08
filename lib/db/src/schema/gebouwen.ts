import { pgTable, serial, text, integer, timestamp, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { gebruikersTable } from "./gebruikers";

export const gebouwenTable = pgTable("gebouwen", {
  id: serial("id").primaryKey(),
  naam: text("naam").notNull(),
  adres: text("adres").notNull(),
  stad: text("stad"),
  postcode: text("postcode"),
  omschrijving: text("omschrijving"),
  bouwjaar: integer("bouwjaar"),
  klantId: integer("klant_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export const insertGebouwSchema = createInsertSchema(gebouwenTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export type InsertGebouw = z.infer<typeof insertGebouwSchema>;
export type Gebouw = typeof gebouwenTable.$inferSelect;

export const verdiepingenTable = pgTable("verdiepingen", {
  id: serial("id").primaryKey(),
  gebouwId: integer("gebouw_id").notNull().references(() => gebouwenTable.id, { onDelete: "cascade" }),
  naam: text("naam").notNull(),
  niveau: integer("niveau").notNull().default(0),
  plattegrondUrl: text("plattegrond_url"),
  breedte: real("breedte"),
  hoogte: real("hoogte"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
});

export const insertVerdiepingSchema = createInsertSchema(verdiepingenTable).omit({ id: true, aangemaaktOp: true });
export type InsertVerdieping = z.infer<typeof insertVerdiepingSchema>;
export type Verdieping = typeof verdiepingenTable.$inferSelect;
