import {
  pgTable, serial, text, integer, boolean, timestamp, index, unique,
} from "drizzle-orm/pg-core";
import { gebruikersTable } from "./gebruikers";

// ─── Microsoft OAuth tokens per gebruiker ─────────────────────────────────────
export const werkInboxTokensTable = pgTable("werk_inbox_tokens", {
  id:              serial("id").primaryKey(),
  gebruikerId:     integer("gebruiker_id").notNull().references(() => gebruikersTable.id, { onDelete: "cascade" }),
  microsoftEmail:  text("microsoft_email").notNull(),
  accessTokenEnc:  text("access_token_enc").notNull(),
  refreshTokenEnc: text("refresh_token_enc").notNull(),
  verlooptOp:      timestamp("verloopt_op").notNull(),
  scope:           text("scope").notNull().default("Mail.Read offline_access"),
  // AANVRAAG_01: verwerk ook de persoonlijke mailbox als aanvraag-ingang
  // (klanten mailen René vaak rechtstreeks).
  aanvraagIntakePersoonlijk: boolean("aanvraag_intake_persoonlijk").notNull().default(false),
  aangemaaktOp:    timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp:    timestamp("bijgewerkt_op").notNull().defaultNow(),
}, (t) => [
  unique("werk_inbox_tokens_gebruiker_uq").on(t.gebruikerId),
]);

// ─── Mailboxen als organisatiebezit (MAIL_01) ─────────────────────────────────
// Een mailbox is van de organisatie, niet van een gebruiker. Wie hem ziet en
// wat diegene mag, staat in werk_inbox_mailbox_toegang. De modus bepaalt het
// AI-gedrag; is_factuurmailbox/is_aanvraagmailbox blijven bestaan als
// verfijning bínnen de modus 'verwerken'.
export const werkInboxMailboxenTable = pgTable("werk_inbox_mailboxen", {
  id:           serial("id").primaryKey(),
  emailAdres:   text("email_adres").notNull(),
  label:        text("label"),
  volgorde:     integer("volgorde").notNull().default(0),
  actief:       boolean("actief").notNull().default(true),
  // verwerken | ondersteunen | registreren
  modus:        text("modus").notNull().default("ondersteunen"),
  // FACTUUR_02: mails in deze mailbox gaan automatisch de factuurstroom in.
  isFactuurmailbox: boolean("is_factuurmailbox").notNull().default(false),
  // AANVRAAG_01: mails in deze mailbox gaan automatisch de aanvraagstroom in.
  isAanvraagmailbox: boolean("is_aanvraagmailbox").notNull().default(false),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
}, (t) => [
  unique("werk_inbox_mailboxen_adres_uq").on(t.emailAdres),
]);

// ─── Toegang per mailbox: lezen | behandelen | beheren ───────────────────────
export const werkInboxMailboxToegangTable = pgTable("werk_inbox_mailbox_toegang", {
  id:           serial("id").primaryKey(),
  mailboxId:    integer("mailbox_id").notNull().references(() => werkInboxMailboxenTable.id, { onDelete: "cascade" }),
  gebruikerId:  integer("gebruiker_id").notNull().references(() => gebruikersTable.id, { onDelete: "cascade" }),
  recht:        text("recht").notNull().default("behandelen"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
}, (t) => [
  unique("werk_inbox_toegang_uq").on(t.mailboxId, t.gebruikerId),
  index("werk_inbox_toegang_gebruiker_idx").on(t.gebruikerId),
]);

// ─── Mail metadata (dedup op message_id) ──────────────────────────────────────
export const werkInboxMailsTable = pgTable("werk_inbox_mails", {
  id:                  serial("id").primaryKey(),
  messageId:           text("message_id").notNull(),
  gebruikerId:         integer("gebruiker_id").notNull().references(() => gebruikersTable.id, { onDelete: "cascade" }),
  mailboxAdres:        text("mailbox_adres").notNull(),
  onderwerp:           text("onderwerp").notNull().default(""),
  afzenderNaam:        text("afzender_naam"),
  afzenderEmail:       text("afzender_email").notNull().default(""),
  ontvangenOp:         timestamp("ontvangen_op").notNull(),
  snippet:             text("snippet"),
  heeftBijlage:        boolean("heeft_bijlage").notNull().default(false),
  // FACTUUR_02: Microsoft Graph conversationId — houdt het gespreksdraad vast
  // zodat reacties van leveranciers aan dezelfde factuur gekoppeld blijven.
  conversationId:      text("conversation_id"),
  // FACTUUR_02: wanneer de factuurpijplijn deze mail heeft verwerkt (dedupe).
  factuurVerwerktOp:   timestamp("factuur_verwerkt_op"),
  // AANVRAAG_01: wanneer de aanvraagpijplijn deze mail heeft verwerkt (dedupe).
  aanvraagVerwerktOp:  timestamp("aanvraag_verwerkt_op"),
  // LOON_01: wanneer de SEPA-loonintake deze mail heeft verwerkt (dedupe).
  sepaVerwerktOp:      timestamp("sepa_verwerkt_op"),
  isGelezenMs:         boolean("is_gelezen_ms").notNull().default(false),
  verwerktOp:          timestamp("verwerkt_op"),
  afgehandeldOp:       timestamp("afgehandeld_op"),
  actieVereist:        boolean("actie_vereist").notNull().default(false),
  actieVereistReden:   text("actie_vereist_reden"),
  aiVoorstelJson:      text("ai_voorstel_json"),
  aiLogboekJson:       text("ai_logboek_json"),
  relatieCategorieAi:  text("relatie_categorie_ai"),
  // MAIL_01: gedeelde toestand per mailbox
  toegewezenAan:       integer("toegewezen_aan").references(() => gebruikersTable.id, { onDelete: "set null" }),
  // open | toegewezen | wacht_op_antwoord | afgehandeld
  samenwerkStatus:     text("samenwerk_status").notNull().default("open"),
  beantwoordOp:        timestamp("beantwoord_op"),
  gesynchroniseerdOp:  timestamp("gesynchroniseerd_op").notNull().defaultNow(),
  bijgewerktOp:        timestamp("bijgewerkt_op").notNull().defaultNow(),
}, (t) => [
  unique("werk_inbox_mails_mailbox_message_uq").on(t.mailboxAdres, t.messageId),
  index("werk_inbox_mails_gebruiker_idx").on(t.gebruikerId),
  index("werk_inbox_mails_mailbox_idx").on(t.gebruikerId, t.mailboxAdres),
  index("werk_inbox_mails_ontvangen_idx").on(t.gebruikerId, t.ontvangenOp),
  index("werk_inbox_mails_toegewezen_idx").on(t.toegewezenAan),
  index("werk_inbox_mails_status_idx").on(t.mailboxAdres, t.samenwerkStatus),
]);

// ─── Interne notities per mail ────────────────────────────────────────────────
export const werkInboxNotitiesTable = pgTable("werk_inbox_notities", {
  id:          serial("id").primaryKey(),
  messageId:   text("message_id").notNull(),
  // Mailbox-scoping (migratie 0010): message_id is alleen uniek binnen een
  // mailbox; NULL = legacy-rij van vóór de backfill (alleen via bericht leesbaar).
  mailboxAdres: text("mailbox_adres"),
  gebruikerId: integer("gebruiker_id").notNull().references(() => gebruikersTable.id, { onDelete: "cascade" }),
  tekst:       text("tekst").notNull(),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
}, (t) => [
  index("werk_inbox_notities_message_idx").on(t.messageId, t.gebruikerId),
  index("werk_inbox_notities_mailbox_idx").on(t.mailboxAdres, t.messageId),
]);

// ─── Koppelingen mail ↔ FPS-entiteit ─────────────────────────────────────────
export const werkInboxKoppelingenTable = pgTable("werk_inbox_koppelingen", {
  id:           serial("id").primaryKey(),
  messageId:    text("message_id").notNull(),
  // Mailbox-scoping (migratie 0010); uniciteit inclusief mailbox via unieke
  // expressie-index in de migratie (coalesce(mailbox_adres,'')).
  mailboxAdres: text("mailbox_adres"),
  gebruikerId:  integer("gebruiker_id").notNull().references(() => gebruikersTable.id, { onDelete: "cascade" }),
  entityType:   text("entity_type").notNull(),
  entityId:     integer("entity_id").notNull(),
  entityLabel:  text("entity_label"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
}, (t) => [
  index("werk_inbox_koppelingen_message_idx").on(t.messageId, t.gebruikerId),
  index("werk_inbox_koppelingen_mailbox_idx").on(t.mailboxAdres, t.messageId),
]);

// ─── Types ────────────────────────────────────────────────────────────────────
export type WerkInboxToken      = typeof werkInboxTokensTable.$inferSelect;
export type WerkInboxMailbox    = typeof werkInboxMailboxenTable.$inferSelect;
export type WerkInboxMailboxToegang = typeof werkInboxMailboxToegangTable.$inferSelect;

export const WERK_INBOX_RECHTEN = ["lezen", "behandelen", "beheren"] as const;
export type WerkInboxRecht = typeof WERK_INBOX_RECHTEN[number];
export const WERK_INBOX_MODI = ["verwerken", "ondersteunen", "registreren"] as const;
export type WerkInboxModus = typeof WERK_INBOX_MODI[number];
export const WERK_INBOX_STATUSSEN = ["open", "toegewezen", "wacht_op_antwoord", "afgehandeld"] as const;
export type WerkInboxStatus = typeof WERK_INBOX_STATUSSEN[number];
export type WerkInboxMail       = typeof werkInboxMailsTable.$inferSelect;
export type WerkInboxNotitie    = typeof werkInboxNotitiesTable.$inferSelect;
export type WerkInboxKoppeling  = typeof werkInboxKoppelingenTable.$inferSelect;

export const WERK_INBOX_ENTITY_TYPES = ["klant", "gebouw", "project", "calculatie", "planning", "offerte", "factuur"] as const;
export type WerkInboxEntityType = typeof WERK_INBOX_ENTITY_TYPES[number];
