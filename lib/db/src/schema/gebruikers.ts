import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const gebruikersTable = pgTable("gebruikers", {
  id: serial("id").primaryKey(),
  naam: text("naam").notNull(),
  email: text("email").notNull().unique(),
  rol: text("rol").notNull().default("viewer"),
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
});

export const insertGebruikerSchema = createInsertSchema(gebruikersTable).omit({ id: true, aangemaaktOp: true });
export type InsertGebruiker = z.infer<typeof insertGebruikerSchema>;
export type Gebruiker = typeof gebruikersTable.$inferSelect;
