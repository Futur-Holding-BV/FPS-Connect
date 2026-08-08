import {
  pgTable, serial, text, integer, boolean, timestamp, numeric, real, jsonb, uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { gebruikersTable } from "./gebruikers";
import { medewerkersTable, werkgeversTable } from "./hrm";

export const salarisbatchesTable = pgTable("salarisbatches", {
  id: serial("id").primaryKey(),
  omschrijving: text("omschrijving"),
  periodeJaar: integer("periode_jaar"),
  periodeMaand: integer("periode_maand"),
  werkmaatschappij: text("werkmaatschappij"),
  werkgeverId: integer("werkgever_id").references(() => werkgeversTable.id, { onDelete: "set null" }),
  status: text("status").notNull().default("verwerken"),
  uploaderId: integer("uploader_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  uploaderNaam: text("uploader_naam"),
  totaalBestanden: integer("totaal_bestanden").notNull().default(0),
  gekoppeld: integer("gekoppeld").notNull().default(0),
  ongekoppeld: integer("ongekoppeld").notNull().default(0),
  controleNodig: integer("controle_nodig").notNull().default(0),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export const salarisbestandenTable = pgTable("salarisbestanden", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").references(() => salarisbatchesTable.id, { onDelete: "set null" }),
  type: text("type").notNull(),
  periodeJaar: integer("periode_jaar"),
  periodeMaand: integer("periode_maand"),
  medewerkerId: integer("medewerker_id").references(() => medewerkersTable.id, { onDelete: "set null" }),
  medewerkerNaamAi: text("medewerker_naam_ai"),
  status: text("status").notNull().default("geupload"),
  zichtbaarMedewerker: boolean("zichtbaar_medewerker").notNull().default(false),
  bestandsnaam: text("bestandsnaam").notNull(),
  objectPath: text("object_path").notNull(),
  bestandsgrootte: integer("bestandsgrootte"),
  mimeType: text("mime_type"),
  uploaderId: integer("uploader_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  uploaderNaam: text("uploader_naam"),
  aiZekerheid: real("ai_zekerheid"),
  aiToelichting: text("ai_toelichting"),
  bronbestandNaam: text("bronbestand_naam"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export const sepaBestandenTable = pgTable("sepa_bestanden", {
  id: serial("id").primaryKey(),
  omschrijving: text("omschrijving"),
  werkmaatschappij: text("werkmaatschappij"),
  werkgeverId: integer("werkgever_id").references(() => werkgeversTable.id, { onDelete: "set null" }),
  periodeJaar: integer("periode_jaar"),
  periodeMaand: integer("periode_maand"),
  betaaldatum: text("betaaldatum"),
  totaalbedrag: numeric("totaalbedrag", { precision: 12, scale: 2 }),
  aantalBetalingen: integer("aantal_betalingen"),
  ibanOpdrachtgever: text("iban_opdrachtgever"),
  bestandsformaat: text("bestandsformaat"),
  status: text("status").notNull().default("ontvangen"),
  bestandsnaam: text("bestandsnaam").notNull(),
  objectPath: text("object_path").notNull(),
  bestandsgrootte: integer("bestandsgrootte"),
  uploaderId: integer("uploader_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  uploaderNaam: text("uploader_naam"),
  gedownloadDoorId: integer("gedownload_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  gedownloadOp: timestamp("gedownload_op"),
  fouten: text("fouten").array(),
  batchReferentie: text("batch_referentie"),
  // LOON_01: herkomst — 'upload' (handmatig) of 'mail' (automatische intake).
  bron: text("bron").notNull().default("upload"),
  bronMailMessageId: text("bron_mail_message_id"),
  bronMailboxAdres: text("bron_mailbox_adres"),
  // LOON_01: werkgever of periode kon niet met zekerheid bepaald worden.
  onvolledig: boolean("onvolledig").notNull().default(false),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
}, (t) => [
  // LOON_01: dezelfde mailbijlage nooit twee keer in het archief (race-proof).
  uniqueIndex("sepa_bestanden_bronmail_bijlage_uq")
    .on(t.bronMailMessageId, t.bestandsnaam)
    .where(sql`${t.bronMailMessageId} IS NOT NULL`),
]);

export const salarisdocumentAuditTable = pgTable("salarisdocument_audit", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").references(() => salarisbestandenTable.id, { onDelete: "set null" }),
  sepaId: integer("sepa_id").references(() => sepaBestandenTable.id, { onDelete: "set null" }),
  actie: text("actie").notNull(),
  gebruikerId: integer("gebruiker_id"),
  gebruikerNaam: text("gebruiker_naam"),
  medewerkerId: integer("medewerker_id"),
  documentType: text("document_type"),
  batchId: integer("batch_id"),
  tijdstip: timestamp("tijdstip").notNull().defaultNow(),
  extra: jsonb("extra"),
});

export type SalarisBatch = typeof salarisbatchesTable.$inferSelect;
export type SalarisBatchInsert = typeof salarisbatchesTable.$inferInsert;
export type Salarisbestand = typeof salarisbestandenTable.$inferSelect;
export type SalarisbestandInsert = typeof salarisbestandenTable.$inferInsert;
export type SepaBestand = typeof sepaBestandenTable.$inferSelect;
export type SepaBestandInsert = typeof sepaBestandenTable.$inferInsert;
