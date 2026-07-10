// Governance & Approval Engine — generieke kernmotor.
//
// Eén platformbrede goedkeuringsmotor voor élk documenttype (offertes, facturen,
// inkooporders, contracten, ...) i.p.v. losse goedkeuringstracks per module. Een
// aanvraag is polymorf gekoppeld (objectType/objectId) aan het onderliggende
// document; het onderliggende document behoudt zijn eigen status-levenscyclus.
//
// Bewust NIET via de bestaande generieke `WorkflowService` (workflow-engine.ts):
// die gaat uit van precies één statusveld per entiteit. Deze motor heeft N-van-M-
// goedkeuringen en drempel-gedreven goedkeurder-toewijzing nodig, wat niet in dat
// model past. Wel hergebruik van dezelfde onderliggende tabellen voor de tijdlijn
// (workflow_transitie_log) en het auditspoor (audit_log) — geen nieuwe logtabel.
import {
  pgTable, serial, text, integer, real, boolean, timestamp, jsonb, index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { gebruikersTable } from "./gebruikers";

// Beleidsregel — bepaalt per documenttype + bedragsband wie moet goedkeuren,
// hoeveel goedkeuringen nodig zijn en of vier-ogen verplicht is. Meerdere regels
// per documentType mogen naast elkaar bestaan (verschillende bandbreedtes); de
// motor kiest de best passende (smalste) band op basis van ondergrens/bovengrens.
// Een null-grens betekent "geen ondergrens" resp. "geen bovengrens".
export const goedkeuringBeleidsregelsTable = pgTable(
  "goedkeuring_beleidsregels",
  {
    id: serial("id").primaryKey(),
    naam: text("naam").notNull(),
    documentType: text("document_type").notNull(),
    werkmaatschappijId: integer("werkmaatschappij_id"),
    ondergrens: real("ondergrens"),
    bovengrens: real("bovengrens"),
    // Goedkeurder-toewijzing — precies één van beide mechanismen moet gevuld zijn
    // (afgedwongen in de Zod-schema/service-laag, niet als DB-constraint):
    //  - specifieke gebruiker, of
    //  - iedereen met minimaal dit niveau op de gegeven bevoegdheden-module
    //    (hergebruikt de bestaande matrix; geen nieuwe HRM-afhankelijkheid).
    goedkeurderGebruikerId: integer("goedkeurder_gebruiker_id")
      .references(() => gebruikersTable.id, { onDelete: "set null" }),
    goedkeurderModule: text("goedkeurder_module"),
    goedkeurderMinNiveau: integer("goedkeurder_min_niveau"),
    aantalGoedkeuringenVereist: integer("aantal_goedkeuringen_vereist").notNull().default(1),
    vierOgenVerplicht: boolean("vier_ogen_verplicht").notNull().default(true),
    vervangerGebruikerId: integer("vervanger_gebruiker_id")
      .references(() => gebruikersTable.id, { onDelete: "set null" }),
    reactietermijnUren: integer("reactietermijn_uren"),
    actief: boolean("actief").notNull().default(true),
    aangemaaktDoorId: integer("aangemaakt_door_id")
      .references(() => gebruikersTable.id, { onDelete: "set null" }),
    aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
    bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
  },
  (t) => [
    index("goedkeuring_beleidsregels_documenttype_idx").on(t.documentType),
  ],
);

// Aanvraag — één ingediend goedkeuringsverzoek voor een polymorf gekoppeld
// document. status: concept | ingediend | goedgekeurd | afgewezen | ingetrokken
// | vervangen. beleidSnapshot bevriest de op indien-moment geldende regel zodat
// latere beleidswijzigingen historische aanvragen nooit met terugwerkende kracht
// veranderen.
export const goedkeuringAanvragenTable = pgTable(
  "goedkeuring_aanvragen",
  {
    id: serial("id").primaryKey(),
    objectType: text("object_type").notNull(),
    objectId: integer("object_id").notNull(),
    documentType: text("document_type").notNull(),
    omschrijving: text("omschrijving"),
    bedrag: real("bedrag"),
    werkmaatschappijId: integer("werkmaatschappij_id"),
    status: text("status").notNull().default("concept"),
    beleidsregelId: integer("beleidsregel_id")
      .references(() => goedkeuringBeleidsregelsTable.id, { onDelete: "set null" }),
    beleidSnapshot: jsonb("beleid_snapshot"),
    vereisteGoedkeuringen: integer("vereiste_goedkeuringen").notNull().default(1),
    ontvangenGoedkeuringen: integer("ontvangen_goedkeuringen").notNull().default(0),
    ingediendDoorId: integer("ingediend_door_id")
      .references(() => gebruikersTable.id, { onDelete: "set null" }),
    ingediendOp: timestamp("ingediend_op"),
    afgehandeldOp: timestamp("afgehandeld_op"),
    afwijzingReden: text("afwijzing_reden"),
    vervangenDoorId: integer("vervangen_door_id"),
    aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
    bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
  },
  (t) => [
    index("goedkeuring_aanvragen_object_idx").on(t.objectType, t.objectId),
    index("goedkeuring_aanvragen_status_idx").on(t.status),
    index("goedkeuring_aanvragen_documenttype_idx").on(t.documentType),
  ],
);

// Stap — individuele goedkeurings-/afwijzingsactie. Ondersteunt N-van-M
// (aantalGoedkeuringenVereist > 1): elke actie is een losse rij, de aanvraag
// telt ontvangenGoedkeuringen op en bepaalt zelf wanneer de drempel is gehaald.
export const goedkeuringStappenTable = pgTable(
  "goedkeuring_stappen",
  {
    id: serial("id").primaryKey(),
    aanvraagId: integer("aanvraag_id").notNull()
      .references(() => goedkeuringAanvragenTable.id, { onDelete: "cascade" }),
    actie: text("actie").notNull(),
    gebruikerId: integer("gebruiker_id")
      .references(() => gebruikersTable.id, { onDelete: "set null" }),
    gebruikerNaam: text("gebruiker_naam"),
    reden: text("reden"),
    aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  },
  (t) => [
    index("goedkeuring_stappen_aanvraag_idx").on(t.aanvraagId),
  ],
);

export const insertGoedkeuringBeleidsregelSchema = createInsertSchema(goedkeuringBeleidsregelsTable)
  .omit({ id: true, aangemaaktOp: true, bijgewerktOp: true })
  .refine(
    (v) => Boolean(v.goedkeurderGebruikerId) || Boolean(v.goedkeurderModule && v.goedkeurderMinNiveau),
    { message: "Wijs een specifieke goedkeurder aan óf een module + minimumniveau." },
  );
export const insertGoedkeuringAanvraagSchema = createInsertSchema(goedkeuringAanvragenTable)
  .omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export const insertGoedkeuringStapSchema = createInsertSchema(goedkeuringStappenTable)
  .omit({ id: true, aangemaaktOp: true });

export type InsertGoedkeuringBeleidsregel = z.infer<typeof insertGoedkeuringBeleidsregelSchema>;
export type InsertGoedkeuringAanvraag = z.infer<typeof insertGoedkeuringAanvraagSchema>;
export type InsertGoedkeuringStap = z.infer<typeof insertGoedkeuringStapSchema>;

export type GoedkeuringBeleidsregel = typeof goedkeuringBeleidsregelsTable.$inferSelect;
export type GoedkeuringAanvraag = typeof goedkeuringAanvragenTable.$inferSelect;
export type GoedkeuringStap = typeof goedkeuringStappenTable.$inferSelect;
