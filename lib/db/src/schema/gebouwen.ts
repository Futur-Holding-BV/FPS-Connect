import { pgTable, serial, text, integer, timestamp, real, boolean, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { gebruikersTable } from "./gebruikers";
import { werkgeversTable } from "./hrm";

export const gebouwenTable = pgTable("gebouwen", {
  id: serial("id").primaryKey(),
  werknummer: text("werknummer").unique(),
  projectnummer: text("projectnummer").unique(),
  naam: text("naam").notNull(),
  adres: text("adres").notNull(),
  stad: text("stad"),
  postcode: text("postcode"),
  omschrijving: text("omschrijving"),
  klantId: integer("klant_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aantalVerdiepingen: integer("aantal_verdiepingen"),
  hoogte: real("hoogte"),
  breedte: real("breedte"),
  diepte: real("diepte"),
  oppervlakte: real("oppervlakte"),
  gebouwType: text("gebouw_type"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
  gereedOp: timestamp("gereed_op"),
  gereedDoor: text("gereed_door"),
  gearchiveerd: boolean("gearchiveerd").notNull().default(false),
  gearchiveerdOp: timestamp("gearchiveerd_op"),
  werkgeverId: integer("werkgever_id").references(() => werkgeversTable.id, { onDelete: "set null" }),
  projectStatus: text("project_status"),
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
  logoX: real("logo_x"),
  logoY: real("logo_y"),
  logoBreedte: real("logo_breedte"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
});

export const insertVerdiepingSchema = createInsertSchema(verdiepingenTable).omit({ id: true, aangemaaktOp: true });
export type InsertVerdieping = z.infer<typeof insertVerdiepingSchema>;
export type Verdieping = typeof verdiepingenTable.$inferSelect;

export const gebouwToewijzingenTable = pgTable("gebouw_toewijzingen", {
  id: serial("id").primaryKey(),
  gebouwId: integer("gebouw_id").notNull().references(() => gebouwenTable.id, { onDelete: "cascade" }),
  gebruikerId: integer("gebruiker_id").notNull().references(() => gebruikersTable.id, { onDelete: "cascade" }),
  aangemaaktDoorId: integer("aangemaakt_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  projectRol: text("project_rol"),
});

export type GebouwToewijzing = typeof gebouwToewijzingenTable.$inferSelect;

export const gebouwPartijenTable = pgTable("gebouw_partijen", {
  id: serial("id").primaryKey(),
  gebouwId: integer("gebouw_id").notNull().references(() => gebouwenTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  naam: text("naam").notNull(),
  organisatie: text("organisatie"),
  telefoon: text("telefoon"),
  email: text("email"),
  website: text("website"),
  adres: text("adres"),
  postcode: text("postcode"),
  plaats: text("plaats"),
  opmerkingen: text("opmerkingen"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export const insertGebouwPartijSchema = createInsertSchema(gebouwPartijenTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export type InsertGebouwPartij = z.infer<typeof insertGebouwPartijSchema>;
export type GebouwPartij = typeof gebouwPartijenTable.$inferSelect;

export const tekeningenTable = pgTable("tekeningen", {
  id: serial("id").primaryKey(),
  gebouwId: integer("gebouw_id").notNull().references(() => gebouwenTable.id, { onDelete: "cascade" }),
  verdiepingId: integer("verdieping_id").references(() => verdiepingenTable.id, { onDelete: "set null" }),
  naam: text("naam").notNull(),
  type: text("type").notNull(),
  schaal: text("schaal"),
  url: text("url").notNull(),
  zichtbaarMonteur: boolean("zichtbaar_monteur").notNull().default(false),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export const insertTekeningSchema = createInsertSchema(tekeningenTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export type InsertTekening = z.infer<typeof insertTekeningSchema>;
export type Tekening = typeof tekeningenTable.$inferSelect;

export const scheidingenTable = pgTable("scheidingen", {
  id: serial("id").primaryKey(),
  verdiepingId: integer("verdieping_id").notNull().references(() => verdiepingenTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  waarde: text("waarde"),
  kleur: text("kleur"),
  punten: text("punten").notNull(),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export const insertScheidingSchema = createInsertSchema(scheidingenTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export type InsertScheiding = z.infer<typeof insertScheidingSchema>;
export type Scheiding = typeof scheidingenTable.$inferSelect;
