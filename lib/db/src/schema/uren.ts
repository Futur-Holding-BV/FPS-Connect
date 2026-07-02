import { pgTable, serial, text, integer, real, boolean, timestamp } from "drizzle-orm/pg-core";
import { gebouwenTable } from "./gebouwen";
import { gebruikersTable } from "./gebruikers";
import { medewerkersTable } from "./hrm";
import { planningItemsTable } from "./planning";
import { documentenTable } from "./documenten";
import { projectenTable } from "./projecten";
import { opdrachtenTable } from "./opdrachten";

// Dagelijkse urenregistraties — één rij per medewerker per dagdeel/project.
// Meerdere rijen per dag zijn mogelijk (bijv. ochtend project A, middag project B).
// status: concept → ingediend → goedgekeurd | afgewezen
export const urenRegistratiesTable = pgTable("uren_registraties", {
  id: serial("id").primaryKey(),
  datum: text("datum").notNull(),                                         // "YYYY-MM-DD"
  medewerkerId: integer("medewerker_id").notNull().references(() => medewerkersTable.id, { onDelete: "cascade" }),
  gebouwId: integer("gebouw_id").references(() => gebouwenTable.id, { onDelete: "set null" }),
  projectId: integer("project_id").references(() => projectenTable.id, { onDelete: "set null" }),
  projectNaam: text("project_naam"),                                       // vrij tekst als geen gebouw_id
  werkzaamheden: text("werkzaamheden"),
  werkzaamheidCategorie: text("werkzaamheid_categorie"),                   // gestructureerde categorie (Branddeuren, Doorvoeringen, …)
  ruimte: text("ruimte"),                                                  // ruimte / locatie binnen gebouw
  objectOmschrijving: text("object_omschrijving"),                         // spot of objectomschrijving
  beginTijd: text("begin_tijd").notNull(),                                 // "HH:MM"
  eindTijd: text("eind_tijd").notNull(),                                   // "HH:MM"
  pauzeMinuten: integer("pauze_minuten").notNull().default(30),
  nettoUren: real("netto_uren").notNull(),
  opmerkingen: text("opmerkingen"),
  // Workflow
  status: text("status").notNull().default("concept"),                     // concept | ingediend | goedgekeurd | afgewezen
  planningItemId: integer("planning_item_id").references(() => planningItemsTable.id, { onDelete: "set null" }),
  opdrachtId: integer("opdracht_id").references(() => opdrachtenTable.id, { onDelete: "set null" }),
  ingediendOp: timestamp("ingediend_op"),
  goedgekeurdDoorId: integer("goedgekeurd_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  goedgekeurdOp: timestamp("goedgekeurd_op"),
  afgewezen: boolean("afgewezen").notNull().default(false),
  afwijzingReden: text("afwijzing_reden"),
  // Audit
  // Regie-specifieke velden (null bij niet-regieprojecten)
  tariefgroep: text("tariefgroep"),                                       // monteur | timmerman | voorman | projectleider | werkvoorbereider | onderaannemer
  reisUren: real("reis_uren"),
  wachtTijd: real("wacht_tijd"),                                          // wachttijd in uren
  akkoordVereist: boolean("akkoord_vereist").notNull().default(false),
  akkoordGegeven: boolean("akkoord_gegeven"),
  akkoordDoorNaam: text("akkoord_door_naam"),
  aangemaaktDoorId: integer("aangemaakt_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// Weekstaten — samenvatting per medewerker per week.
// Bevat de totale uren en ADV-opbouw voor die week.
// Status: concept → ingediend → goedgekeurd | afgewezen
// documentId: optioneel gegenereerde PDF-weekstaat (V1.4+)
export const weekStatenTable = pgTable("week_staten", {
  id: serial("id").primaryKey(),
  medewerkerId: integer("medewerker_id").notNull().references(() => medewerkersTable.id, { onDelete: "cascade" }),
  jaar: integer("jaar").notNull(),
  weekNummer: integer("week_nummer").notNull(),
  status: text("status").notNull().default("concept"),                     // concept | ingediend | goedgekeurd | afgewezen
  totaalUren: real("totaal_uren"),
  advUren: real("adv_uren"),
  notities: text("notities"),
  afwijzingReden: text("afwijzing_reden"),
  ingediendOp: timestamp("ingediend_op"),
  goedgekeurdDoorId: integer("goedgekeurd_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  goedgekeurdOp: timestamp("goedgekeurd_op"),
  documentId: integer("document_id").references(() => documentenTable.id, { onDelete: "set null" }),
  // Vergrendeling — HRM kan week op slot zetten zodat monteur niet meer kan muteren
  vergrendeld: boolean("vergrendeld").notNull().default(false),
  vergrendeldOp: timestamp("vergrendeld_op"),
  vergrendeldDoorId: integer("vergrendeld_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangemaaktDoorId: integer("aangemaakt_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});
