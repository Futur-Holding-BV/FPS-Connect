import { pgTable, serial, text, integer, real, boolean, timestamp } from "drizzle-orm/pg-core";
import { gebouwenTable } from "./gebouwen";
import { gebruikersTable } from "./gebruikers";
import { medewerkersTable } from "./hrm";
import { planningItemsTable } from "./planning";
import { documentenTable } from "./documenten";
import { projectenTable } from "./projecten";
import { opdrachtenTable } from "./opdrachten";
import { modCalcNormtijdenTable } from "./mod-calculatie";

// Dagelijkse urenregistraties — één rij per medewerker per dagdeel/project.
// Meerdere rijen per dag zijn mogelijk (bijv. ochtend project A, middag project B).
// status: concept → ingediend → goedgekeurd | afgewezen
// UREN_01 §6b: indirecte werkzaamheden — beheerd in een scherm, niet in code.
// Een gebruikte code wordt nooit verwijderd, alleen op inactief gezet.
export const indirecteWerkzaamhedenTable = pgTable("indirecte_werkzaamheden", {
  id: serial("id").primaryKey(),
  naam: text("naam").notNull(),
  actief: boolean("actief").notNull().default(true),
  volgorde: integer("volgorde").notNull().default(0),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

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
  // UREN_01 §6b: uurcode uit de werkbegroting van de opdracht — vervangt de
  // vrije tekst werkzaamheid_categorie voor uren op een opdracht.
  normtijdId: integer("normtijd_id").references(() => modCalcNormtijdenTable.id, { onDelete: "set null" }),
  // óf een beheerbare indirecte werkzaamheid (opruimen, reistijd, …)
  indirecteWerkzaamheidId: integer("indirecte_werkzaamheid_id").references(() => indirecteWerkzaamhedenTable.id, { onDelete: "set null" }),
  // óf: werk past niet op een begrotingscode — informatie, geen fout (signaal WVB)
  nietInBegroting: boolean("niet_in_begroting").notNull().default(false),
  nietInBegrotingOmschrijving: text("niet_in_begroting_omschrijving"),
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

// UREN_01 §4 — Overwerkslot per project. Standaard dicht: boven de weekgrens
// (CAO-drempel + ADV, doorgaans 40u) mag alleen geschreven worden op een
// project waarvan het slot op de datum van de urenregel open stond.
// status: aangevraagd (toestemming gevraagd, nog dicht) → open → gesloten.
// Een slot zonder einddatum bestaat niet; het plafond sluit het slot vanzelf.
export const overwerkSlotenTable = pgTable("overwerk_sloten", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projectenTable.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("aangevraagd"),
  geldigVan: text("geldig_van"),
  geldigTot: text("geldig_tot"),
  urenPlafond: real("uren_plafond"),
  verbruikteUren: real("verbruikte_uren").notNull().default(0),
  reden: text("reden"),
  aangevraagdDoorId: integer("aangevraagd_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangevraagdOp: timestamp("aangevraagd_op"),
  motivatieAanvraag: text("motivatie_aanvraag"),
  geopendDoorId: integer("geopend_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  geopendOp: timestamp("geopend_op"),
  geslotenDoorId: integer("gesloten_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  geslotenOp: timestamp("gesloten_op"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});
