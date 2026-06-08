import { pgTable, serial, text, boolean, integer, timestamp, doublePrecision } from "drizzle-orm/pg-core";
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
