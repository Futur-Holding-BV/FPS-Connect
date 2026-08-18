// MARKETING_01 — doelgroepen, sjablonen en campagnes.
// Toestemming/afmelding/onbestelbaar leeft op crm_contactpersonen (zie crm.ts).
import { pgTable, serial, text, integer, timestamp, jsonb, unique, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { gebruikersTable } from "./gebruikers";
import { werkgeversTable } from "./hrm";
import { crmKlantenTable, crmContactpersonenTable } from "./crm";

export const CAMPAGNE_STATUSSEN = ["concept", "gepland", "verzendend", "verzonden", "gestopt"] as const;
export type CampagneStatus = typeof CAMPAGNE_STATUSSEN[number];

export const ONTVANGER_STATUSSEN = ["gepland", "verzonden", "gebounced", "afgemeld", "overgeslagen"] as const;
export type OntvangerStatus = typeof ONTVANGER_STATUSSEN[number];

// Doelgroep-criteria: bewaarde selectie; leden worden altijd live berekend
// (toestemming is een harde server-side poort, nooit een opgeslagen lijst).
export type DoelgroepCriteria = {
  branche?: string[];
  stad?: string[];
  relatieStatus?: string[];   // crm_klanten.relatie_status
  klantStatus?: string[];     // crm_klanten.status (klant | prospect | ...)
  orgType?: string[];         // crm_klanten.type
  laatsteContactVoor?: string; // ISO-datum: alleen contactpersonen zonder contact sinds deze datum
};

export const marketingDoelgroepenTable = pgTable("marketing_doelgroepen", {
  id: serial("id").primaryKey(),
  naam: text("naam").notNull(),
  omschrijving: text("omschrijving"),
  criteria: jsonb("criteria").notNull().default({}),
  aangemaaktDoorId: integer("aangemaakt_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export const marketingSjablonenTable = pgTable("marketing_sjablonen", {
  id: serial("id").primaryKey(),
  naam: text("naam").notNull(),
  onderwerp: text("onderwerp").notNull(),
  // Platte tekst/HTML met velden {{naam}} en {{organisatie}} die per ontvanger
  // worden ingevuld; de mail-shell (huisstijl) komt uit de mailservice.
  inhoud: text("inhoud").notNull(),
  aangemaaktDoorId: integer("aangemaakt_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export const marketingCampagnesTable = pgTable("marketing_campagnes", {
  id: serial("id").primaryKey(),
  naam: text("naam").notNull(),
  doel: text("doel"),
  werkgeverId: integer("werkgever_id").references(() => werkgeversTable.id, { onDelete: "set null" }),
  doelgroepId: integer("doelgroep_id").references(() => marketingDoelgroepenTable.id, { onDelete: "set null" }),
  sjabloonId: integer("sjabloon_id").references(() => marketingSjablonenTable.id, { onDelete: "set null" }),
  status: text("status").notNull().default("concept"),
  geplandOp: timestamp("gepland_op"),
  // Proefverzending is een harde voorwaarde vóór echte verzending.
  proefVerzondenOp: timestamp("proef_verzonden_op"),
  proefVerzondenDoorId: integer("proef_verzonden_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  gestartOp: timestamp("gestart_op"),
  afgerondOp: timestamp("afgerond_op"),
  gestoptOp: timestamp("gestopt_op"),
  gestoptReden: text("gestopt_reden"),
  aangemaaktDoorId: integer("aangemaakt_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export const marketingCampagneOntvangersTable = pgTable("marketing_campagne_ontvangers", {
  id: serial("id").primaryKey(),
  campagneId: integer("campagne_id").notNull().references(() => marketingCampagnesTable.id, { onDelete: "cascade" }),
  contactpersoonId: integer("contactpersoon_id").notNull().references(() => crmContactpersonenTable.id, { onDelete: "cascade" }),
  klantId: integer("klant_id").references(() => crmKlantenTable.id, { onDelete: "set null" }),
  // Snapshot van het adres op verzendmoment (contactgegevens kunnen later wijzigen).
  email: text("email").notNull(),
  // Publieke token voor afmeldlink (zonder inloggen) én open/klik-registratie.
  afmeldToken: text("afmeld_token").notNull(),
  status: text("status").notNull().default("gepland"),
  verzondenOp: timestamp("verzonden_op"),
  geopendOp: timestamp("geopend_op"),
  gekliktOp: timestamp("geklikt_op"),
  gebouncedOp: timestamp("gebounced_op"),
  afgemeldOp: timestamp("afgemeld_op"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
}, (t) => [
  unique("marketing_campagne_ontvangers_uq").on(t.campagneId, t.contactpersoonId),
  unique("marketing_campagne_ontvangers_token_uq").on(t.afmeldToken),
  index("marketing_campagne_ontvangers_campagne_idx").on(t.campagneId),
]);

export const insertMarketingDoelgroepSchema = createInsertSchema(marketingDoelgroepenTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export type InsertMarketingDoelgroep = z.infer<typeof insertMarketingDoelgroepSchema>;
export type MarketingDoelgroep = typeof marketingDoelgroepenTable.$inferSelect;

export const insertMarketingSjabloonSchema = createInsertSchema(marketingSjablonenTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export type InsertMarketingSjabloon = z.infer<typeof insertMarketingSjabloonSchema>;
export type MarketingSjabloon = typeof marketingSjablonenTable.$inferSelect;

export const insertMarketingCampagneSchema = createInsertSchema(marketingCampagnesTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export type InsertMarketingCampagne = z.infer<typeof insertMarketingCampagneSchema>;
export type MarketingCampagne = typeof marketingCampagnesTable.$inferSelect;

export type MarketingCampagneOntvanger = typeof marketingCampagneOntvangersTable.$inferSelect;
