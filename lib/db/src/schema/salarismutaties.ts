import {
  pgTable, serial, text, integer, boolean, timestamp, jsonb,
} from "drizzle-orm/pg-core";
import { gebruikersTable } from "./gebruikers";
import { medewerkersTable, werkgeversTable } from "./hrm";
import { declaratiesTable } from "./declaraties";

// ── Salarismutaties ──────────────────────────────────────────────────────────
// Eén rij per mutatie per medewerker per loonperiode. HRM, handmatig of import
// als bron. Wordt door HRM/Administratie gevuld en geaccordeerd. SCAB-mail en
// boekhouderflow lezen hier uit.

export const salarisMutatiesTable = pgTable("salaris_mutaties", {
  id: serial("id").primaryKey(),
  medewerkerId: integer("medewerker_id").references(() => medewerkersTable.id, { onDelete: "set null" }),
  medewerkerNaam: text("medewerker_naam"),
  werkmaatschappij: text("werkmaatschappij").notNull(),
  werkgeverId: integer("werkgever_id").references(() => werkgeversTable.id, { onDelete: "set null" }),
  periodeJaar: integer("periode_jaar").notNull(),
  periodeMaand: integer("periode_maand").notNull(),
  type: text("type").notNull(),
  omschrijving: text("omschrijving"),
  ingangsdatum: text("ingangsdatum"),
  bron: text("bron").notNull().default("handmatig"),
  // Gevuld wanneer de mutatie automatisch uit een goedgekeurde declaratie komt
  // (bron "declaratie"); uniek per declaratie via partiële index (migratie 0054).
  declaratieId: integer("declaratie_id").references(() => declaratiesTable.id, { onDelete: "set null" }),
  bijlageObjectPath: text("bijlage_object_path"),
  bijlageNaam: text("bijlage_naam"),
  bijlageGrootte: integer("bijlage_grootte"),
  status: text("status").notNull().default("concept"),
  gecontroleerd: boolean("gecontroleerd").notNull().default(false),
  gecontroleerdDoorId: integer("gecontroleerd_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  gecontroleerdDoorNaam: text("gecontroleerd_door_naam"),
  gecontroleerdOp: timestamp("gecontroleerd_op"),
  akkoord: boolean("akkoord"),
  notities: text("notities"),
  aangemaaktDoorId: integer("aangemaakt_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangemaaktDoorNaam: text("aangemaakt_door_naam"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export type SalarisMutatie = typeof salarisMutatiesTable.$inferSelect;

// ── SCAB-mails ────────────────────────────────────────────────────────────────
// AI-samengestelde conceptmails aan SCAB (salarisverwerker FPS Bouw en
// Renovatie). Gebruiker controleert en past aan vóór verzending.

export const scabMailsTable = pgTable("scab_mails", {
  id: serial("id").primaryKey(),
  werkmaatschappij: text("werkmaatschappij").notNull(),
  werkgeverId: integer("werkgever_id").references(() => werkgeversTable.id, { onDelete: "set null" }),
  periodeJaar: integer("periode_jaar").notNull(),
  periodeMaand: integer("periode_maand").notNull(),
  onderwerp: text("onderwerp").notNull(),
  inhoud: text("inhoud").notNull(),
  scabEmailAdres: text("scab_email_adres"),
  contactpersoon: text("contactpersoon"),
  status: text("status").notNull().default("concept"),
  verzondOp: timestamp("verzond_op"),
  verzondDoorId: integer("verzond_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  verzondDoorNaam: text("verzond_door_naam"),
  aantalMutaties: integer("aantal_mutaties").notNull().default(0),
  aiContextJson: jsonb("ai_context_json"),
  aangemaaktDoorId: integer("aangemaakt_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangemaaktDoorNaam: text("aangemaakt_door_naam"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export type ScabMail = typeof scabMailsTable.$inferSelect;

// ── SCAB-mail bijlagen ─────────────────────────────────────────────────────
// Bijlagen die bij een SCAB-conceptmail worden geselecteerd. Verwijst naar
// object-storage. Gevoelige documenten (BSN/ID) krijgen een waarschuwingsvlag.

export const scabMailBijlagenTable = pgTable("scab_mail_bijlagen", {
  id: serial("id").primaryKey(),
  scabMailId: integer("scab_mail_id").references(() => scabMailsTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  omschrijving: text("omschrijving"),
  objectPath: text("object_path").notNull(),
  bestandsnaam: text("bestandsnaam").notNull(),
  bestandsgrootte: integer("bestandsgrootte"),
  isGevoelig: boolean("is_gevoelig").notNull().default(false),
  medewerkerId: integer("medewerker_id").references(() => medewerkersTable.id, { onDelete: "set null" }),
  medewerkerNaam: text("medewerker_naam"),
  aangemaaktDoorId: integer("aangemaakt_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
});

export type ScabMailBijlage = typeof scabMailBijlagenTable.$inferSelect;

// ── Loon-outputbestanden ──────────────────────────────────────────────────────
// Bestanden die boekhouder of SCAB terugleveren na salarisverwerking.
// Loonstroken/jaaropgaven worden pas zichtbaar voor medewerkers na publicatie.

export const loonOutputBestandenTable = pgTable("loon_output_bestanden", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  werkmaatschappij: text("werkmaatschappij"),
  werkgeverId: integer("werkgever_id").references(() => werkgeversTable.id, { onDelete: "set null" }),
  periodeJaar: integer("periode_jaar"),
  periodeMaand: integer("periode_maand"),
  medewerkerId: integer("medewerker_id").references(() => medewerkersTable.id, { onDelete: "set null" }),
  medewerkerNaam: text("medewerker_naam"),
  bron: text("bron").notNull().default("boekhouder"),
  bestandsnaam: text("bestandsnaam").notNull(),
  objectPath: text("object_path").notNull(),
  bestandsgrootte: integer("bestandsgrootte"),
  mimeType: text("mime_type"),
  status: text("status").notNull().default("ontvangen"),
  zichtbaarMedewerker: boolean("zichtbaar_medewerker").notNull().default(false),
  gepubliceerdOp: timestamp("gepubliceerd_op"),
  gepubliceerdDoorId: integer("gepubliceerd_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  uploadBatchRef: text("upload_batch_ref"),
  notities: text("notities"),
  uploaderId: integer("uploader_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  uploaderNaam: text("uploader_naam"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export type LoonOutputBestand = typeof loonOutputBestandenTable.$inferSelect;

// ── Boekhouder-uploads ────────────────────────────────────────────────────────
// Documenten die de externe boekhouder uploadt in het portaal.
// Ingedeeld per vaste map (jaarrekening, btw-aangifte, etc.).

export const boekhouderUploadsTable = pgTable("boekhouder_uploads", {
  id: serial("id").primaryKey(),
  map: text("map").notNull(),
  werkmaatschappij: text("werkmaatschappij"),
  werkgeverId: integer("werkgever_id").references(() => werkgeversTable.id, { onDelete: "set null" }),
  periodeJaar: integer("periode_jaar"),
  periodeMaand: integer("periode_maand"),
  omschrijving: text("omschrijving"),
  bestandsnaam: text("bestandsnaam").notNull(),
  objectPath: text("object_path").notNull(),
  bestandsgrootte: integer("bestandsgrootte"),
  mimeType: text("mime_type"),
  gelezen: boolean("gelezen").notNull().default(false),
  uploaderId: integer("uploader_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  uploaderNaam: text("uploader_naam"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export type BoekhouderUpload = typeof boekhouderUploadsTable.$inferSelect;

// ── Salaris audit extended ────────────────────────────────────────────────────
// Uitgebreide auditlog voor salaris/boekhouder acties.

export const salarisAuditExtTable = pgTable("salaris_audit_ext", {
  id: serial("id").primaryKey(),
  actie: text("actie").notNull(),
  entityType: text("entity_type"),
  entityId: integer("entity_id"),
  gebruikerId: integer("gebruiker_id"),
  gebruikerNaam: text("gebruiker_naam"),
  werkmaatschappij: text("werkmaatschappij"),
  medewerkerId: integer("medewerker_id"),
  detail: text("detail"),
  tijdstip: timestamp("tijdstip").notNull().defaultNow(),
});
