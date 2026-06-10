import { pgTable, serial, text, integer, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { gebouwenTable } from "./gebouwen";

export interface EmailContactpersoon {
  rol: string;
  naam: string;
  organisatie: string | null;
  email: string | null;
  telefoon: string | null;
  /** Functietitel binnen de organisatie (bijv. "Projectleider", "Directeur") */
  functie?: string | null;
  /** AI-voorstel, door beheerder bevestigd, of afgewezen */
  status?: "voorstel" | "bevestigd" | "afgewezen";
  /** AI-inschatting van relevantie voor het FPS-project */
  relevantie?: "relevant" | "ter_controle";
  /** ID van de e-mail waaruit dit contact is geëxtraheerd */
  bron_email_id?: number | null;
  /** Onderwerp van de bronemail (voor weergave) */
  bron_onderwerp?: string | null;
}

export const gebouwEmailsTable = pgTable("gebouw_emails", {
  id: serial("id").primaryKey(),
  gebouwId: integer("gebouw_id").notNull().references(() => gebouwenTable.id, { onDelete: "cascade" }),
  bestandsnaam: text("bestandsnaam").notNull(),
  objectPad: text("object_pad"),
  afzender: text("afzender"),
  ontvanger: text("ontvanger"),
  onderwerp: text("onderwerp"),
  datum: text("datum"),
  inhoudTekst: text("inhoud_tekst"),
  aiOmschrijving: text("ai_omschrijving"),
  aiNaw: text("ai_naw"),
  aiContactinfo: text("ai_contactinfo"),
  aiTekeningen: text("ai_tekeningen"),
  aiActiepunten: text("ai_actiepunten"),
  aiRelevant: boolean("ai_relevant"),
  aiRelevantReden: text("ai_relevant_reden"),
  status: text("status").notNull().default("in_behandeling"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
});

export const gebouwEmailBijlagenTable = pgTable("gebouw_email_bijlagen", {
  id: serial("id").primaryKey(),
  emailId: integer("email_id").notNull().references(() => gebouwEmailsTable.id, { onDelete: "cascade" }),
  bestandsnaam: text("bestandsnaam").notNull(),
  objectPad: text("object_pad"),
  contentType: text("content_type"),
  grootte: integer("grootte"),
});

export type GebouwEmail = typeof gebouwEmailsTable.$inferSelect;
export type GebouwEmailBijlage = typeof gebouwEmailBijlagenTable.$inferSelect;

export const gebouwEmailSamenvattingenTable = pgTable("gebouw_email_samenvattingen", {
  id: serial("id").primaryKey(),
  gebouwId: integer("gebouw_id").notNull().unique().references(() => gebouwenTable.id, { onDelete: "cascade" }),
  opdrachtomschrijving: text("opdrachtomschrijving"),
  opdrachtgever: text("opdrachtgever"),
  contactgegevens: text("contactgegevens"),
  afspraken: text("afspraken"),
  actiepunten: text("actiepunten"),
  besluiten: text("besluiten"),
  tekeningen: text("tekeningen"),
  risicos: text("risicos"),
  contactpersonen: jsonb("contactpersonen").$type<EmailContactpersoon[]>().notNull().default([]),
  aantalEmails: integer("aantal_emails").notNull().default(0),
  geverifieerd: boolean("geverifieerd").notNull().default(false),
  gecontroleerdDoor: text("gecontroleerd_door"),
  gecontroleerdOp: timestamp("gecontroleerd_op"),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export type GebouwEmailSamenvatting = typeof gebouwEmailSamenvattingenTable.$inferSelect;
