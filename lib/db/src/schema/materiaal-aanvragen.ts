import { pgTable, serial, integer, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { gebruikersTable } from "./gebruikers";
import { opdrachtenTable } from "./opdrachten";
import { inkoopbonnenTable } from "./werkvoorbereiding";

export const materiaalAanvragenTable = pgTable("materiaal_aanvragen", {
  id: serial("id").primaryKey(),
  // BOUW_01 §6: toebehoren-aanvragen horen niet bij een project → nullable.
  opdrachtId: integer("opdracht_id").references(
    () => opdrachtenTable.id, { onDelete: "cascade" }
  ),
  // BOUW_01 §5/§6: 'materiaal' (bestaand) | 'toebehoren' (verbruik, geen project)
  soort: text("soort").notNull().default("materiaal"),
  // BOUW_01 §5: verplichte vraag "Is dit volgens de opdracht?"
  // ja | wijkt_af | weet_niet — null alleen bij historische aanvragen.
  volgensOpdracht: text("volgens_opdracht"),
  ingediendDoorId: integer("ingediend_door_id").references(
    () => gebruikersTable.id, { onDelete: "set null" }
  ),
  reden: text("reden").notNull(),
  omschrijving: text("omschrijving"),
  fotoPad: text("foto_pad"),
  status: text("status").notNull().default("nieuw"),
  aiArtikelNaam: text("ai_artikel_naam"),
  aiLeverancier: text("ai_leverancier"),
  aiPrijsIndicatie: text("ai_prijs_indicatie"),
  aiScopeCheck: text("ai_scope_check"),
  aiScopeToelichting: text("ai_scope_toelichting"),
  aiAdvies: text("ai_advies"),
  aiLogboekJson: jsonb("ai_logboek_json"),
  behandeldDoorId: integer("behandeld_door_id").references(
    () => gebruikersTable.id, { onDelete: "set null" }
  ),
  behandelNotitie: text("behandel_notitie"),
  // MATERIAAL_01 fase 3 (keuze A): verwijzing naar de automatisch aangemaakte
  // concept-inkoopbon bij goedkeuring. SET NULL zodat een verwijderde bon de
  // aanvraaghistorie niet meesleept.
  inkoopbonId: integer("inkoopbon_id").references(
    () => inkoopbonnenTable.id, { onDelete: "set null" }
  ),
  aangemaaktOp: timestamp("aangemaakt_op", { withTimezone: true }).notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op", { withTimezone: true }).notNull().defaultNow(),
});
