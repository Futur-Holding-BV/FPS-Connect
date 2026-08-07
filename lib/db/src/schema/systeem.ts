import { pgTable, serial, text, boolean, integer, timestamp, doublePrecision, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { gebruikersTable } from "./gebruikers";

// ── Login-pogingen (risicosignalen: nieuw apparaat / nieuw IP) ──────────────
export const loginPogingenTable = pgTable("login_pogingen", {
  id: serial("id").primaryKey(),
  gebruikerId: integer("gebruiker_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  email: text("email").notNull(),
  ip: text("ip"),
  userAgent: text("user_agent"),
  gelukt: boolean("gelukt").notNull().default(false),
  nieuwApparaat: boolean("nieuw_apparaat").notNull().default(false),
  nieuwIp: boolean("nieuw_ip").notNull().default(false),
  tijdstip: timestamp("tijdstip").notNull().defaultNow(),
});

export const insertLoginPogingSchema = createInsertSchema(loginPogingenTable).omit({ id: true, tijdstip: true });
export type InsertLoginPoging = z.infer<typeof insertLoginPogingSchema>;
export type LoginPoging = typeof loginPogingenTable.$inferSelect;

// ── Helpdesktickets ─────────────────────────────────────────────────────────
export const helpdeskTicketsTable = pgTable("helpdesk_tickets", {
  id: serial("id").primaryKey(),
  gebruikerId: integer("gebruiker_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  naam: text("naam"),
  email: text("email"),
  onderwerp: text("onderwerp").notNull(),
  bericht: text("bericht").notNull(),
  status: text("status").notNull().default("open"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export const insertHelpdeskTicketSchema = createInsertSchema(helpdeskTicketsTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export type InsertHelpdeskTicket = z.infer<typeof insertHelpdeskTicketSchema>;
export type HelpdeskTicket = typeof helpdeskTicketsTable.$inferSelect;

// ── Feedback ────────────────────────────────────────────────────────────────
export const feedbackTable = pgTable("feedback", {
  id: serial("id").primaryKey(),
  gebruikerId: integer("gebruiker_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  naam: text("naam"),
  type: text("type").notNull().default("algemeen"),
  waardering: integer("waardering"),
  bericht: text("bericht").notNull(),
  pagina: text("pagina"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
});

export const insertFeedbackSchema = createInsertSchema(feedbackTable).omit({ id: true, aangemaaktOp: true });
export type InsertFeedback = z.infer<typeof insertFeedbackSchema>;
export type Feedback = typeof feedbackTable.$inferSelect;

// ── Muisgebeurtenissen (heatmaps) ───────────────────────────────────────────
export const muisGebeurtenissenTable = pgTable("muis_gebeurtenissen", {
  id: serial("id").primaryKey(),
  gebruikerId: integer("gebruiker_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  pagina: text("pagina").notNull(),
  type: text("type").notNull(),
  x: doublePrecision("x").notNull(),
  y: doublePrecision("y").notNull(),
  tijdstip: timestamp("tijdstip").notNull().defaultNow(),
});

export const insertMuisGebeurtenisSchema = createInsertSchema(muisGebeurtenissenTable).omit({ id: true, tijdstip: true });
export type InsertMuisGebeurtenis = z.infer<typeof insertMuisGebeurtenisSchema>;
export type MuisGebeurtenis = typeof muisGebeurtenissenTable.$inferSelect;

// ── App-instellingen (singleton, bewerkt door hoofdbeheerder) ────────────────
export const appInstellingenTable = pgTable("app_instellingen", {
  id: serial("id").primaryKey(),
  supportEmail: text("support_email"),
  supportTelefoon: text("support_telefoon"),
  supportWebsite: text("support_website"),
  extraDisclaimer: text("extra_disclaimer"),
  opdrachtbevestigingAutoVerzenden: boolean("opdrachtbevestiging_auto_verzenden").notNull().default(false),
  // FPS Moments — organisatiebrede schakelaar (standaard aan); alleen de hoofdbeheerder mag dit wijzigen.
  // Uit = geen enkel Moment (verjaardag, later evt. andere types) wordt getoond, ook niet aan de jarige zelf.
  momentsVerjaardagIngeschakeld: boolean("moments_verjaardag_ingeschakeld").notNull().default(true),
  // Heatmap-tracker (klik-/muisbeweging-registratie). AVG: persoonsgegevens gekoppeld aan account.
  // Standaard UIT; alleen een beheerder mag dit expliciet inschakelen (grondslag gerechtvaardigd belang).
  heatmapTrackingIngeschakeld: boolean("heatmap_tracking_ingeschakeld").notNull().default(false),
  aiKostendrempelEur: numeric("ai_kostendrempel_eur", { precision: 10, scale: 4 }),
  aiDrempelMeldingGestuurdMaand: text("ai_drempel_melding_gestuurd_maand"),
  aiMaandelijkseExportDag: integer("ai_maandelijkse_export_dag"), // 1-28, null = uit
  aiMaandelijkseExportEmail: text("ai_maandelijkse_export_email"),
  aiMaandelijkseExportLaatstVerzondenMaand: text("ai_maandelijkse_export_laatst_verzonden_maand"), // 'JJJJ-MM'
  // AANVRAAG_01 — instelbare reactietijdgrenzen (bedrijfskeuze, nooit in code vastleggen).
  aanvraagReactietermijnUren: integer("aanvraag_reactietermijn_uren").notNull().default(24),
  aanvraagOppakTermijnUren: integer("aanvraag_oppak_termijn_uren").notNull().default(72),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
  bijgewerktDoorId: integer("bijgewerkt_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
});

export const insertAppInstellingSchema = createInsertSchema(appInstellingenTable).omit({ id: true, bijgewerktOp: true });
export type InsertAppInstelling = z.infer<typeof insertAppInstellingSchema>;
export type AppInstelling = typeof appInstellingenTable.$inferSelect;

// ── Module-beoordelingen (sign-off per module op de ontwikkelstatus) ─────────
export const moduleBeoordelingenTable = pgTable("module_beoordelingen", {
  id: serial("id").primaryKey(),
  moduleSleutel: text("module_sleutel").notNull().unique(),
  status: text("status").notNull(), // 'gereed' | 'niet_akkoord'
  opmerking: text("opmerking"),
  beoordeeldDoorId: integer("beoordeeld_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  beoordeeldDoorNaam: text("beoordeeld_door_naam"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export const insertModuleBeoordelingSchema = createInsertSchema(moduleBeoordelingenTable).omit({
  id: true,
  aangemaaktOp: true,
  bijgewerktOp: true,
});
export type InsertModuleBeoordeling = z.infer<typeof insertModuleBeoordelingSchema>;
export type ModuleBeoordeling = typeof moduleBeoordelingenTable.$inferSelect;
