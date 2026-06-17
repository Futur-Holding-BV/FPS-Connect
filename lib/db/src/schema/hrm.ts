// HRM-module (Fase 1) — Parallel spoor, formeel akkoord gebruiker.
//
// Medewerkers, functiehuis, opleidingen/certificaten, bekwaamheidsmatrix en
// verlof (opbouw/opname/saldo, CAO-gebaseerd incl. juridische kaders en
// werknemerstoelichting) voor de volledige FPS Groep (FPS Bouw, FPS
// Brandpreventie, FPS Onderhoud, Fuegro). Fase 1 bevat BEWUST GEEN
// salarisadministratie.
import { pgTable, serial, text, integer, real, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { gebruikersTable } from "./gebruikers";
import { documentenTable } from "./documenten";

// Werkgever — hoofdentiteit binnen de FPS Groep. Elke werkmaatschappij is een
// eigen werkgever met eigen CAO, huisstijl (logo/briefpapier), personeelsbeleid,
// contractsjablonen en ondertekenaars. medewerkers/functies/verlofsoorten
// verwijzen hiernaar via werkgever_id; het bestaande tekstveld werkmaatschappij
// blijft als legacy/weergave-cache bestaan tot alle aanroepers zijn omgezet.
export const werkgeversTable = pgTable("werkgevers", {
  id: serial("id").primaryKey(),
  naam: text("naam").notNull().unique(),
  cao: text("cao").notNull().default("Metaal & Techniek"),
  logoDocumentId: integer("logo_document_id").references(() => documentenTable.id, { onDelete: "set null" }),
  briefpapierDocumentId: integer("briefpapier_document_id").references(() => documentenTable.id, { onDelete: "set null" }),
  personeelsbeleid: text("personeelsbeleid"),
  adres: text("adres"),
  kvk: text("kvk"),
  btw: text("btw"),
  telefoon: text("telefoon"),
  email: text("email"),
  website: text("website"),
  voettekst: text("voettekst"),
  actief: boolean("actief").notNull().default(true),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// Functiehuis — per werkmaatschappij. Taken, verantwoordelijkheden, competenties,
// opleidingsvereisten en doorgroeipad. Staat los van rol/bevoegdheden: de functie
// beschrijft het werk, de bevoegdheden-matrix bepaalt de toegang.
export const functiesTable = pgTable("functies", {
  id: serial("id").primaryKey(),
  werkmaatschappij: text("werkmaatschappij").notNull().default("FPS Brandpreventie"),
  werkgeverId: integer("werkgever_id").references(() => werkgeversTable.id, { onDelete: "set null" }),
  naam: text("naam").notNull(),
  omschrijving: text("omschrijving"),
  taken: text("taken"),
  verantwoordelijkheden: text("verantwoordelijkheden"),
  competenties: text("competenties"),
  opleidingsvereisten: text("opleidingsvereisten"),
  doorgroeipad: text("doorgroeipad"),
  actief: boolean("actief").notNull().default(true),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// Medewerkers — kan, maar hoeft geen systeemaccount (gebruiker) te hebben.
// Persoons-/contactgegevens, werkmaatschappij, CAO en dienstverband.
export const medewerkersTable = pgTable("medewerkers", {
  id: serial("id").primaryKey(),
  gebruikerId: integer("gebruiker_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  naam: text("naam").notNull(),
  email: text("email"),
  telefoon: text("telefoon"),
  mobiel: text("mobiel"),
  werkmaatschappij: text("werkmaatschappij").notNull().default("FPS Brandpreventie"),
  werkgeverId: integer("werkgever_id").references(() => werkgeversTable.id, { onDelete: "set null" }),
  functieId: integer("functie_id").references(() => functiesTable.id, { onDelete: "set null" }),
  cao: text("cao"),
  dienstverband: text("dienstverband").notNull().default("vast"),
  contracturenPerWeek: real("contracturen_per_week"),
  inDienstSinds: text("in_dienst_sinds"),
  uitDienstPer: text("uit_dienst_per"),
  noodcontactNaam: text("noodcontact_naam"),
  noodcontactTelefoon: text("noodcontact_telefoon"),
  actief: boolean("actief").notNull().default(true),
  opmerkingen: text("opmerkingen"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// Opleidingen/certificeringen-catalogus. geldigheidMaanden = null betekent geen
// verloop; verplicht markeert opleidingen waarop het systeem moet signaleren.
//
// soort onderscheidt een volledige 'opleiding' (diplomagericht) van een 'cursus'
// (korte training/certificering). niveau/opleider/studieduur/studiebelasting/
// lesvorm en de kostenverdeling werkgever/werknemer zijn velden die de AI per
// functie kan voorstellen (een mens bevestigt; AI slaat nooit zelfstandig op).
export const opleidingenTable = pgTable("opleidingen", {
  id: serial("id").primaryKey(),
  naam: text("naam").notNull(),
  categorie: text("categorie").notNull().default("overig"),
  soort: text("soort").notNull().default("cursus"),
  omschrijving: text("omschrijving"),
  niveau: text("niveau"),
  opleider: text("opleider"),
  studieduur: text("studieduur"),
  studiebelasting: text("studiebelasting"),
  lesvorm: text("lesvorm"),
  kostenIndicatie: text("kosten_indicatie"),
  kostenWerkgeverPct: integer("kosten_werkgever_pct"),
  kostenWerknemerPct: integer("kosten_werknemer_pct"),
  geldigheidMaanden: integer("geldigheid_maanden"),
  verplicht: boolean("verplicht").notNull().default(false),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// Koppeling functie <-> opleiding (veel-op-veel). Eén opleiding/cursus (bijv. VCA,
// BHV) kan bij meerdere functies horen; AI-voorstellen worden hier per functie
// vastgelegd zonder de catalogus te dupliceren.
export const functieOpleidingenTable = pgTable("functie_opleidingen", {
  id: serial("id").primaryKey(),
  functieId: integer("functie_id").notNull().references(() => functiesTable.id, { onDelete: "cascade" }),
  opleidingId: integer("opleiding_id").notNull().references(() => opleidingenTable.id, { onDelete: "cascade" }),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
});

// Behaalde opleidingen/certificaten per medewerker. Optionele koppeling naar het
// documentregister voor het bewijsstuk (certificaat).
export const medewerkerOpleidingenTable = pgTable("medewerker_opleidingen", {
  id: serial("id").primaryKey(),
  medewerkerId: integer("medewerker_id").notNull().references(() => medewerkersTable.id, { onDelete: "cascade" }),
  opleidingId: integer("opleiding_id").notNull().references(() => opleidingenTable.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("behaald"),
  behaaldOp: text("behaald_op"),
  verlooptOp: text("verloopt_op"),
  certificaatDocumentId: integer("certificaat_document_id").references(() => documentenTable.id, { onDelete: "set null" }),
  opmerking: text("opmerking"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// Bekwaamheidsmatrix — per medewerker welke werkzaamheden/producten/inspecties/
// projecten zijn toegestaan, met niveau (niet_bevoegd / onder_begeleiding /
// zelfstandig / specialist / trainer).
export const bekwaamhedenTable = pgTable("bekwaamheden", {
  id: serial("id").primaryKey(),
  medewerkerId: integer("medewerker_id").notNull().references(() => medewerkersTable.id, { onDelete: "cascade" }),
  categorie: text("categorie").notNull().default("werkzaamheid"),
  onderwerp: text("onderwerp").notNull(),
  niveau: text("niveau").notNull().default("niet_bevoegd"),
  vastgesteldDoor: text("vastgesteld_door"),
  vastgesteldOp: text("vastgesteld_op"),
  opmerking: text("opmerking"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// ── Verlof (CAO-gebaseerd) ──────────────────────────────────────────────────
// Op verzoek toegevoegd: verlofopbouw/-opname/-saldo met juridische kaders en
// werknemerstoelichting (wanneer verlof opgenomen moet worden of vervalt).
//
// verlofsoorten = catalogus met regels per CAO (Metaal & Techniek, Bouw & Infra).
// categorie: wettelijk | bovenwettelijk | adv | collectief | bijzonder.
export const verlofsoortenTable = pgTable("verlofsoorten", {
  id: serial("id").primaryKey(),
  naam: text("naam").notNull(),
  categorie: text("categorie").notNull().default("wettelijk"),
  cao: text("cao"),
  werkmaatschappij: text("werkmaatschappij"),
  werkgeverId: integer("werkgever_id").references(() => werkgeversTable.id, { onDelete: "set null" }),
  betaald: boolean("betaald").notNull().default(true),
  collectief: boolean("collectief").notNull().default(false),
  opbouwUrenPerJaar: real("opbouw_uren_per_jaar"),
  opbouwRegel: text("opbouw_regel"),
  vervalRegel: text("verval_regel"),
  juridischKader: text("juridisch_kader"),
  toelichting: text("toelichting"),
  actief: boolean("actief").notNull().default(true),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// Verlofsaldo per medewerker, per soort, per jaar (in uren).
export const verlofSaldiTable = pgTable("verlof_saldi", {
  id: serial("id").primaryKey(),
  medewerkerId: integer("medewerker_id").notNull().references(() => medewerkersTable.id, { onDelete: "cascade" }),
  verlofsoortId: integer("verlofsoort_id").notNull().references(() => verlofsoortenTable.id, { onDelete: "cascade" }),
  jaar: integer("jaar").notNull(),
  beginsaldoUren: real("beginsaldo_uren").notNull().default(0),
  opgebouwdUren: real("opgebouwd_uren").notNull().default(0),
  opgenomenUren: real("opgenomen_uren").notNull().default(0),
  saldoUren: real("saldo_uren").notNull().default(0),
  vervaltOp: text("vervalt_op"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// Verlofaanvragen/-opname. status: aangevraagd | goedgekeurd | afgewezen | ingetrokken.
export const verlofAanvragenTable = pgTable("verlofaanvragen", {
  id: serial("id").primaryKey(),
  medewerkerId: integer("medewerker_id").notNull().references(() => medewerkersTable.id, { onDelete: "cascade" }),
  verlofsoortId: integer("verlofsoort_id").notNull().references(() => verlofsoortenTable.id, { onDelete: "cascade" }),
  startDatum: text("start_datum").notNull(),
  eindDatum: text("eind_datum").notNull(),
  aantalUren: real("aantal_uren").notNull().default(0),
  status: text("status").notNull().default("aangevraagd"),
  reden: text("reden"),
  opmerking: text("opmerking"),
  beoordeeldDoorId: integer("beoordeeld_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  beoordeeldOp: timestamp("beoordeeld_op"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export const insertWerkgeverSchema = createInsertSchema(werkgeversTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export const insertFunctieSchema = createInsertSchema(functiesTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export const insertMedewerkerSchema = createInsertSchema(medewerkersTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export const insertOpleidingSchema = createInsertSchema(opleidingenTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export const insertFunctieOpleidingSchema = createInsertSchema(functieOpleidingenTable).omit({ id: true, aangemaaktOp: true });
export const insertMedewerkerOpleidingSchema = createInsertSchema(medewerkerOpleidingenTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export const insertBekwaamheidSchema = createInsertSchema(bekwaamhedenTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export const insertVerlofsoortSchema = createInsertSchema(verlofsoortenTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export const insertVerlofSaldoSchema = createInsertSchema(verlofSaldiTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export const insertVerlofAanvraagSchema = createInsertSchema(verlofAanvragenTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });

export type InsertWerkgever = z.infer<typeof insertWerkgeverSchema>;
export type InsertFunctie = z.infer<typeof insertFunctieSchema>;
export type InsertMedewerker = z.infer<typeof insertMedewerkerSchema>;
export type InsertOpleiding = z.infer<typeof insertOpleidingSchema>;
export type InsertFunctieOpleiding = z.infer<typeof insertFunctieOpleidingSchema>;
export type InsertMedewerkerOpleiding = z.infer<typeof insertMedewerkerOpleidingSchema>;
export type InsertBekwaamheid = z.infer<typeof insertBekwaamheidSchema>;
export type InsertVerlofsoort = z.infer<typeof insertVerlofsoortSchema>;
export type InsertVerlofSaldo = z.infer<typeof insertVerlofSaldoSchema>;
export type InsertVerlofAanvraag = z.infer<typeof insertVerlofAanvraagSchema>;

export type Werkgever = typeof werkgeversTable.$inferSelect;
export type Functie = typeof functiesTable.$inferSelect;
export type Medewerker = typeof medewerkersTable.$inferSelect;
export type Opleiding = typeof opleidingenTable.$inferSelect;
export type FunctieOpleiding = typeof functieOpleidingenTable.$inferSelect;
export type MedewerkerOpleiding = typeof medewerkerOpleidingenTable.$inferSelect;
export type Bekwaamheid = typeof bekwaamhedenTable.$inferSelect;
export type Verlofsoort = typeof verlofsoortenTable.$inferSelect;
export type VerlofSaldo = typeof verlofSaldiTable.$inferSelect;
export type VerlofAanvraag = typeof verlofAanvragenTable.$inferSelect;
