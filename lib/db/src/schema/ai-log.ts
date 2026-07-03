import { pgTable, serial, text, integer, numeric, timestamp, jsonb } from "drizzle-orm/pg-core";

export const aiAanroepenTable = pgTable("ai_aanroepen", {
  id: serial("id").primaryKey(),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  module: text("module").notNull(),
  functie: text("functie"),
  gebruikerId: integer("gebruiker_id"),
  entiteitstype: text("entiteitstype"),
  entiteitId: integer("entiteit_id"),
  modelSlot: text("model_slot").notNull(),
  modelNaam: text("model_naam").notNull(),
  promptNaam: text("prompt_naam"),
  promptVersie: text("prompt_versie"),
  promptHash: text("prompt_hash"),
  promptTokens: integer("prompt_tokens"),
  completionTokens: integer("completion_tokens"),
  totalTokens: integer("total_tokens"),
  geschatteKostenEur: numeric("geschatte_kosten_eur"),
  duurMs: integer("duur_ms"),
  status: text("status").notNull().default("ok"),
  foutmelding: text("foutmelding"),
  contextJson: jsonb("context_json"),
});
