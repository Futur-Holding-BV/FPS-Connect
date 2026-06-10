import { pgTable, serial, integer, text, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const gebruikersTable = pgTable("gebruikers", {
  id: serial("id").primaryKey(),
  naam: text("naam").notNull(),
  email: text("email").notNull().unique(),
  rol: text("rol").notNull().default("gebruiker"),
  telefoon: text("telefoon"),
  bedrijf: text("bedrijf"),
  wachtwoord: text("wachtwoord"),
  totpSecret: text("totp_secret"),
  tweeFactorIngeschakeld: boolean("twee_factor_ingeschakeld").notNull().default(false),
  actief: boolean("actief").notNull().default(true),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  laatstOnline: timestamp("laatst_online"),
  avatarUrl: text("avatar_url"),
  bedrijfslogoUrl: text("bedrijfslogo_url"),
  bedrijfskleuren: text("bedrijfskleuren"),
  uitnodigingStatus: text("uitnodiging_status").notNull().default("niet_uitgenodigd"),
  uitnodigingVerstuurdOp: timestamp("uitnodiging_verstuurd_op"),
  uitnodigingToken: text("uitnodiging_token").unique(),
  uitnodigingVerlooptOp: timestamp("uitnodiging_verloopt_op"),
  uitnodigingGeopendOp: timestamp("uitnodiging_geopend_op"),
  uitnodigingOpnieuwVerstuurdOp: timestamp("uitnodiging_opnieuw_verstuurd_op"),
  uitnodigingGeaccepteerdOp: timestamp("uitnodiging_geaccepteerd_op"),
  taal: text("taal").notNull().default("nl"),
  functietitels: text("functietitels").array().notNull().default([]),
  // Bevoegdheden-matrix: module-id -> niveau (0-4). Bron van toegang voor de
  // basisrol "gebruiker". Zie @workspace/permissies voor het model.
  bevoegdheden: jsonb("bevoegdheden").$type<Record<string, number>>().notNull().default({}),
  // Herkomst: het profiel (preset) dat als startpunt voor de bevoegdheden is
  // toegepast. Alleen administratieve koppeling; latere handmatige wijzigingen
  // aan de bevoegdheden veranderen dit veld niet. Wordt NULL bij verwijderen
  // van het profiel.
  herkomstProfielId: integer("herkomst_profiel_id").references(
    (): any => profielenTable.id,
    { onDelete: "set null" },
  ),
});

// Standaardprofielen (presets) die de bevoegdheden-matrix als startpunt vullen.
// systeem=true zijn de meegeleverde profielen; die blijven bestaan na een seed.
export const profielenTable = pgTable("profielen", {
  id: serial("id").primaryKey(),
  naam: text("naam").notNull().unique(),
  bevoegdheden: jsonb("bevoegdheden").$type<Record<string, number>>().notNull().default({}),
  systeem: boolean("systeem").notNull().default(false),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
});

export const insertGebruikerSchema = createInsertSchema(gebruikersTable).omit({ id: true, aangemaaktOp: true });
export type InsertGebruiker = z.infer<typeof insertGebruikerSchema>;
export type Gebruiker = typeof gebruikersTable.$inferSelect;
export type Profiel = typeof profielenTable.$inferSelect;
