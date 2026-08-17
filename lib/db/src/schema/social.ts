// SOCIAL_01 — plannen, publiceren en meten van social media.
// Eén kalender per werkmaatschappij (werkgever); een bericht heeft per kanaal
// een eigen variant (tekst-override + plaatsingsstatus). Koppelingen per
// werkmaatschappij per kanaal, met vastgelegde modus (publiceren of alleen
// klaarzetten als concept op het account).
import { pgTable, serial, text, integer, timestamp, jsonb, boolean, unique, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { gebruikersTable } from "./gebruikers";
import { werkgeversTable } from "./hrm";
import { crmKlantenTable } from "./crm";
import { gebouwenTable } from "./gebouwen";
import { marketingCampagnesTable } from "./marketing";

export const SOCIAL_KANALEN = ["linkedin", "facebook", "instagram", "tiktok"] as const;
export type SocialKanaal = typeof SOCIAL_KANALEN[number];

// Wat mag Connect feitelijk met het gekoppelde account? Vastgelegd bij het
// koppelen en getoond in het beheerscherm (SOCIAL_01 deel C/E).
export const KOPPELING_MODI = ["publiceren", "klaarzetten"] as const;
export type KoppelingModus = typeof KOPPELING_MODI[number];

export const KOPPELING_STATUSSEN = ["actief", "verlopen", "ingetrokken"] as const;

// Statusmachine bericht (deel B): concept → klaar → gepland → uitkomst.
// De uitkomst is eerlijk: 'geplaatst' alleen als álle kanalen echt geplaatst
// zijn; 'deels_geplaatst' bij een gemengd resultaat (incl. concepten die de
// planner nog moet afmaken); 'mislukt' als geen enkel kanaal slaagde.
export const BERICHT_STATUSSEN = ["concept", "klaar", "gepland", "geplaatst", "deels_geplaatst", "mislukt"] as const;
export type SocialBerichtStatus = typeof BERICHT_STATUSSEN[number];

// Per-kanaal plaatsingsstatus (deel C). "bezig" = lease van de planner tijdens
// de adaptercall (verlopen leases worden hersteld). "concept_klaargezet" =
// Connect mocht niet rechtstreeks publiceren en heeft het bericht als concept
// op het account gezet + een werkbak-taak gemaakt. "mislukt" is een eindstatus
// die ALTIJD gepaard gaat met een werkbak-taak — nooit stilzwijgend niet geplaatst.
export const KANAAL_PLAATSING_STATUSSEN = ["wachtend", "bezig", "geplaatst", "concept_klaargezet", "mislukt"] as const;
export type KanaalPlaatsingStatus = typeof KANAAL_PLAATSING_STATUSSEN[number];

export const SOCIAL_MEDIA_TYPES = ["beeld", "video"] as const;

export const socialKoppelingenTable = pgTable("social_koppelingen", {
  id: serial("id").primaryKey(),
  werkgeverId: integer("werkgever_id").notNull().references(() => werkgeversTable.id, { onDelete: "cascade" }),
  kanaal: text("kanaal").notNull(),
  accountNaam: text("account_naam").notNull(),
  // Vastgelegd bij het koppelen: wat mag Connect feitelijk (deel C).
  modus: text("modus").notNull().default("klaarzetten"),
  status: text("status").notNull().default("actief"),
  // Toegangsgegevens; verloop wordt bewaakt (deel E). Tokens zijn geheimen —
  // nooit teruggeven via de API (mapper strip't ze).
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  verlooptOp: timestamp("verloopt_op"),
  laatstVernieuwdOp: timestamp("laatst_vernieuwd_op"),
  laatsteFout: text("laatste_fout"),
  // Dedupe: wanneer is voor dit verloop een werkbak-taak gemaakt?
  verloopTaakOp: timestamp("verloop_taak_op"),
  aangemaaktDoorId: integer("aangemaakt_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
}, (t) => [
  unique("social_koppelingen_wg_kanaal_uq").on(t.werkgeverId, t.kanaal),
]);

export const socialBerichtenTable = pgTable("social_berichten", {
  id: serial("id").primaryKey(),
  werkgeverId: integer("werkgever_id").notNull().references(() => werkgeversTable.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("concept"),
  // Gedeelde tekst = vertrekpunt; per kanaal aan te passen (bericht_kanalen).
  tekst: text("tekst").notNull().default(""),
  // Eén media-item per bericht: uit de beeldbank of los geüpload.
  mediaPad: text("media_pad"),
  mediaType: text("media_type"),
  visualId: integer("visual_id"),
  geplandOp: timestamp("gepland_op"),
  // Herleidbaarheid (deel A): campagne uit MARKETING_01, project/relatie uit CRM.
  campagneId: integer("campagne_id").references(() => marketingCampagnesTable.id, { onDelete: "set null" }),
  crmKlantId: integer("crm_klant_id").references(() => crmKlantenTable.id, { onDelete: "set null" }),
  gebouwId: integer("gebouw_id").references(() => gebouwenTable.id, { onDelete: "set null" }),
  makerId: integer("maker_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  // Wie plande het bericht — die krijgt de werkbak-taak als plaatsen niet
  // (volledig) automatisch kon (deel C).
  plannerId: integer("planner_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  klaarOp: timestamp("klaar_op"),
  geplaatstOp: timestamp("geplaatst_op"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
}, (t) => [
  index("social_berichten_wg_gepland_idx").on(t.werkgeverId, t.geplandOp),
  index("social_berichten_status_gepland_idx").on(t.status, t.geplandOp),
]);

export const socialBerichtKanalenTable = pgTable("social_bericht_kanalen", {
  id: serial("id").primaryKey(),
  berichtId: integer("bericht_id").notNull().references(() => socialBerichtenTable.id, { onDelete: "cascade" }),
  kanaal: text("kanaal").notNull(),
  // NULL = gebruik de gedeelde tekst van het bericht.
  tekstOverride: text("tekst_override"),
  plaatsingStatus: text("plaatsing_status").notNull().default("wachtend"),
  externId: text("extern_id"),
  geplaatstOp: timestamp("geplaatst_op"),
  conceptKlaargezetOp: timestamp("concept_klaargezet_op"),
  pogingen: integer("pogingen").notNull().default(0),
  laatstePogingOp: timestamp("laatste_poging_op"),
  laatsteFout: text("laatste_fout"),
  // Is er voor dit kanaal een werkbak-taak gemaakt (concept/mislukt)?
  taakGemaakt: boolean("taak_gemaakt").notNull().default(false),
  // Cijfers uit het kanaal (deel D): weergaven, reacties, klikken, volgers erbij.
  cijfers: jsonb("cijfers"),
  cijfersOpgehaaldOp: timestamp("cijfers_opgehaald_op"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
}, (t) => [
  unique("social_bericht_kanalen_uq").on(t.berichtId, t.kanaal),
  index("social_bericht_kanalen_status_idx").on(t.plaatsingStatus),
]);

export const insertSocialKoppelingSchema = createInsertSchema(socialKoppelingenTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export type SocialKoppeling = typeof socialKoppelingenTable.$inferSelect;
export type SocialBericht = typeof socialBerichtenTable.$inferSelect;
export type SocialBerichtKanaal = typeof socialBerichtKanalenTable.$inferSelect;
export const zSocialKanaal = z.enum(SOCIAL_KANALEN);
