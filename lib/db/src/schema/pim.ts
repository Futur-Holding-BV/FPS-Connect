import { pgTable, serial, integer, boolean, jsonb, text, timestamp } from "drizzle-orm/pg-core";
import { opdrachtenTable } from "./opdrachten";
import { gebruikersTable } from "./gebruikers";

// ── PROJECT INTELLIGENCE MODEL (PIM) ────────────────────────────────────────
// Sla ALLEEN AI-context, analyse, motivatie en observaties op. GEEN operationele data.
// Eén PIM per opdracht (1:1 FK). Wordt aangemaakt bij POST /aanvragen of bij
// omzetten van een offerte naar opdracht (toekomstige Fase B).
//
// ai_fase leeft op opdrachtenTable (extern zichtbaar workflow-status);
// de inhoudelijke AI-context leeft hier (JSONB blobs, voor AI-gebruik).
//
// Klantperspectief: aanvraag_context + advies_context + oplevering_context zijn
// zichtbaar voor de klantrol; de overige context-velden worden gemaskeerd.

export const pimModellenTable = pgTable("pim_modellen", {
  id: serial("id").primaryKey(),
  opdrachtId: integer("opdracht_id").notNull().unique().references(() => opdrachtenTable.id, { onDelete: "cascade" }),
  // true als aanvraag via FPS One (klantportaal) is binnengekomen
  aanvraagViaOne: boolean("aanvraag_via_one").notNull().default(false),
  // JSONB context-velden — alleen AI-context/analyse/motivatie/observaties
  aanvraagContext: jsonb("aanvraag_context"),
  adviesContext: jsonb("advies_context"),
  werkvoorbereidingContext: jsonb("werkvoorbereiding_context"),
  // { werkpakket_sleutel: [inkoopplan_regel_id, ...] } — geen FK, temporele inversie
  inkoopContext: jsonb("inkoop_context"),
  uitvoeringsLog: jsonb("uitvoerings_log"),
  opleveringContext: jsonb("oplevering_context"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export type PimModel = typeof pimModellenTable.$inferSelect;

// ── PIM UITVOERING STAPPEN ───────────────────────────────────────────────────
// AI-gestuurde uitvoeringsstappen per PIM. Eén stap tegelijk actief per PIM
// (partial unique index pim_stap_actief_uniq op status IN ('actief','afgeweken'),
//  aangemaakt via directe SQL — Drizzle ondersteunt geen WHERE in unique constraints).
//
// status: open | actief | voltooid | afgeweken | overgeslagen
export const pimUitvoeringStappenTable = pgTable("pim_uitvoering_stappen", {
  id: serial("id").primaryKey(),
  pimId: integer("pim_id").notNull().references(() => pimModellenTable.id, { onDelete: "cascade" }),
  volgorde: integer("volgorde").notNull().default(0),
  status: text("status").notNull().default("open"),
  werkpakketSleutel: text("werkpakket_sleutel"),
  instructieJson: jsonb("instructie_json"),
  antwoordenJson: jsonb("antwoorden_json"),
  fotoUrls: text("foto_urls").array(),
  aiAnalyseJson: jsonb("ai_analyse_json"),
  afwijkingJson: jsonb("afwijking_json"),
  // Gekoppelde spots (voorziening-IDs). Informatieve koppeling — geen FK,
  // spotstatussen worden NOOIT automatisch gewijzigd door deze koppeling.
  voorzieningIds: integer("voorziening_ids").array(),
  voltooidDoorId: integer("voltooid_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  voltooidOp: timestamp("voltooid_op"),
  // VGE: geselecteerde visuele begeleiding per stap (JSONB-schema in docs/ai-visual-guidance-framework.md §4.4)
  guidanceContext: jsonb("guidance_context"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export type PimUitvoeringStap = typeof pimUitvoeringStappenTable.$inferSelect;
