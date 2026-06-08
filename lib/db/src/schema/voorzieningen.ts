import { pgTable, serial, text, integer, timestamp, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { gebouwenTable, verdiepingenTable } from "./gebouwen";
import { gebruikersTable } from "./gebruikers";

export const voorzieningenTable = pgTable("voorzieningen", {
  id: serial("id").primaryKey(),
  objectnummer: text("objectnummer").notNull().unique(),
  qrCode: text("qr_code"),
  type: text("type").notNull(),
  status: text("status").notNull().default("concept"),
  classificatie: text("classificatie").notNull().default("60"),
  gebouwId: integer("gebouw_id").notNull().references(() => gebouwenTable.id, { onDelete: "cascade" }),
  verdiepingId: integer("verdieping_id").references(() => verdiepingenTable.id, { onDelete: "set null" }),
  ruimte: text("ruimte"),
  locatieOmschrijving: text("locatie_omschrijving"),
  locatieX: real("locatie_x"),
  locatieY: real("locatie_y"),
  materialen: text("materialen"),
  opmerkingen: text("opmerkingen"),
  wbdbo: text("wbdbo"),
  wrd: text("wrd"),
  wandOfPlafond: text("wand_of_plafond"),
  monteurId: integer("monteur_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  makerMonteurId: integer("maker_monteur_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  controleurId: integer("controleur_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  installatieDatum: text("installatie_datum"),
  volgendeInspectie: text("volgende_inspectie"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export const insertVoorzieningSchema = createInsertSchema(voorzieningenTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export type InsertVoorziening = z.infer<typeof insertVoorzieningSchema>;
export type Voorziening = typeof voorzieningenTable.$inferSelect;

export const fotosTable = pgTable("fotos", {
  id: serial("id").primaryKey(),
  voorzieningId: integer("voorziening_id").notNull().references(() => voorzieningenTable.id, { onDelete: "cascade" }),
  fase: text("fase").notNull(),
  url: text("url").notNull(),
  beschrijving: text("beschrijving"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
});

export const insertFotoSchema = createInsertSchema(fotosTable).omit({ id: true, aangemaaktOp: true });
export type InsertFoto = z.infer<typeof insertFotoSchema>;
export type Foto = typeof fotosTable.$inferSelect;
