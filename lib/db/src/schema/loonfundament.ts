// LOON_02A — Loonfundament: database-laag voor loonadministratie.
//
// Bevat de kernentiteiten voor de Nederlandse loonaangifte:
//  - Inkomstenverhoudingen (IKV) per medewerker/werkgever/aanstelling
//  - Loonafspraken per inkomstenverhouding (bruto, schaal/trede, toeslagen)
//  - Jaarsets en jaarbronnen (belastingparameters UWV/Belastingdienst)
//  - Jaarparameters per jaarset
//  - Loonstatenstatus en tijdvakregels per inkomstenverhouding
//  - Migratiebevindingenlog (entiteittype/veld/reden/opgelost)
//
// Geen fiscale bedragen of percentages in dit bestand; uitsluitend structuur.
import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  date,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { werkgeversTable, medewerkersTable, medewerkerAanstellingenTable } from "./hrm";
import { gebruikersTable } from "./gebruikers";

// ── Migratiebevindingenlog ─────────────────────────────────────────────────────
// Append-only auditlog van datakwaliteitsproblemen die tijdens de LOON_02A
// migratie zijn gesignaleerd. Eén rij per bevinding; opgelost_op wordt gezet
// zodra de beheerder de bevinding handmatig heeft afgehandeld.
export const loonMigratiebevindingenTable = pgTable("loon_migratiebevindingen", {
  id: serial("id").primaryKey(),
  // Entiteittype: werkgever | aanstelling | medewerker | overig
  entiteitType: text("entiteit_type").notNull(),
  entiteitId: integer("entiteit_id").notNull(),
  veld: text("veld").notNull(),
  oorspronkelijkeWaarde: text("oorspronkelijke_waarde"),
  reden: text("reden").notNull(),
  opgelostOp: timestamp("opgelost_op"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
});

export const insertLoonMigratiebevindingSchema = createInsertSchema(loonMigratiebevindingenTable).omit({ id: true, aangemaaktOp: true });
export type InsertLoonMigratiebevinding = z.infer<typeof insertLoonMigratiebevindingSchema>;
export type LoonMigratiebevinding = typeof loonMigratiebevindingenTable.$inferSelect;

// ── Inkomstenverhoudingen ─────────────────────────────────────────────────────
// Eén inkomstenverhouding (IKV) per medewerker per werkgever per aanstelling.
// Een IKV is de wettelijke eenheid voor loonaangifte bij de Belastingdienst.
// Uniek: werkgever + volgnummer (volgnummer is positief en Belastingdienst-
// toegewezen). De datumcheck bewaakt dat einde >= aanvang indien opgegeven.
export const loonInkomstenverhoudingenTable = pgTable("loon_inkomstenverhoudingen", {
  id: serial("id").primaryKey(),
  werkgeverId: integer("werkgever_id").notNull().references(() => werkgeversTable.id, { onDelete: "restrict" }),
  medewerkerId: integer("medewerker_id").notNull().references(() => medewerkersTable.id, { onDelete: "restrict" }),
  // aanstellingId is verplicht; koppelt IKV aan de HRM-aanstelling.
  aanstellingId: integer("aanstelling_id").notNull().references(() => medewerkerAanstellingenTable.id, { onDelete: "restrict" }),
  // Volgnummer zoals gehanteerd door de Belastingdienst; positief geheel getal.
  volgnummer: integer("volgnummer").notNull(),
  // Periode
  datumAanvang: date("datum_aanvang", { mode: "string" }).notNull(),
  datumEinde: date("datum_einde", { mode: "string" }),
  // Aard van de arbeidsverhouding (SV-code, bv. "1", "21", "82").
  codeAardArbeidsverhouding: text("code_aard_arbeidsverhouding"),
  // Contractkenmerken
  contractOnbepaaldeTijd: boolean("contract_onbepaalde_tijd").notNull().default(false),
  schriftelijkeArbeidsovereenkomst: boolean("schriftelijke_arbeidsovereenkomst").notNull().default(true),
  oproepovereenkomst: boolean("oproepovereenkomst").notNull().default(false),
  // Verzekeringsplicht
  verzekerdZw: boolean("verzekerd_zw").notNull().default(true),
  verzekerdWw: boolean("verzekerd_ww").notNull().default(true),
  verzekerdWia: boolean("verzekerd_wia").notNull().default(true),
  // Code invloed verzekeringsplicht (bv. "0" = geen bijzonderheden)
  codeInvloedVerzekeringsplicht: text("code_invloed_verzekeringsplicht"),
  actief: boolean("actief").notNull().default(true),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
}, (t) => [
  // Uniek per werkgever + medewerker + volgnummer (NumIv hoort bij de persoon).
  uniqueIndex("loon_ikv_werkgever_medewerker_volgnummer_uniek").on(t.werkgeverId, t.medewerkerId, t.volgnummer),
]);

export const insertLoonInkomstenverhoudingenSchema = createInsertSchema(loonInkomstenverhoudingenTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export type InsertLoonInkomstenverhouding = z.infer<typeof insertLoonInkomstenverhoudingenSchema>;
export type LoonInkomstenverhouding = typeof loonInkomstenverhoudingenTable.$inferSelect;

// ── Loonafspraken ─────────────────────────────────────────────────────────────
// Eén rij per inkomstenverhouding per ingangsdatum. Bevat de bruto
// loonafspraken: loonsoort, bedrag in centen (geen fiscale parameters),
// schaal/trede, vaste toeslagen (jsonb-array), loonheffingskorting,
// tabelkeuze, anonientarief en de vastlegger.
// bedragCents >= 0 wordt via SQL-constraint afgedwongen.
export const loonAfsprakenTable = pgTable("loon_afspraken", {
  id: serial("id").primaryKey(),
  inkomstenverhoudingId: integer("inkomstenverhouding_id").notNull().references(() => loonInkomstenverhoudingenTable.id, { onDelete: "cascade" }),
  ingangsdatum: date("ingangsdatum", { mode: "string" }).notNull(),
  // Loonsoort: uurloon | maandloon | weekloon | stukloon | overig
  loonsoort: text("loonsoort").notNull().default("maandloon"),
  // Brutobedrag in eurocenten; nooit een fiscaal bedrag of grens.
  bedragCents: integer("bedrag_cents").notNull(),
  schaal: text("schaal"),
  trede: text("trede"),
  // Vaste toeslagen als jsonb-array van objecten { omschrijving, bedragCents }.
  vasteToeslagen: jsonb("vaste_toeslagen").notNull().default([]),
  // Loonheffingskorting: true = medewerker heeft loonheffingskorting aangevraagd.
  loonheffingskorting: boolean("loonheffingskorting").notNull().default(false),
  // Tabelkeuze: wit | groen
  tabelkeuze: text("tabelkeuze").notNull().default("wit"),
  // Anoniementarief: true = anoniementarief van toepassing (geen BSN/naam).
  anoniementarief: boolean("anoniementarief").notNull().default(false),
  vastgelegdDoorId: integer("vastgelegd_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
}, (t) => [
  // Per inkomstenverhouding slechts één afspraak per ingangsdatum.
  uniqueIndex("loon_afspraken_ikv_ingangsdatum_uniek").on(t.inkomstenverhoudingId, t.ingangsdatum),
]);

export const insertLoonAfspraakSchema = createInsertSchema(loonAfsprakenTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export type InsertLoonAfspraak = z.infer<typeof insertLoonAfspraakSchema>;
export type LoonAfspraak = typeof loonAfsprakenTable.$inferSelect;

// ── Jaarsets ─────────────────────────────────────────────────────────────────
// Een jaarset bundelt alle belastingparameters voor een kalenderjaar.
// status: concept | volledig | onvolledig | bron_gewijzigd | vervangen
// Partial unique: slechts één jaarset per jaar mag status = 'volledig' hebben.
export const loonJaarsetsTable = pgTable("loon_jaarsets", {
  id: serial("id").primaryKey(),
  jaar: integer("jaar").notNull(),
  versie: integer("versie").notNull().default(1),
  // Status van de jaarset.
  status: text("status").notNull().default("concept"),
  volledig: boolean("volledig").notNull().default(false),
  parameterAantal: integer("parameter_aantal").notNull().default(0),
  // Foutenoverzicht als jsonb-array van objecten { sleutel, reden }.
  fouten: jsonb("fouten").notNull().default([]),
  geladenDoorId: integer("geladen_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  geladenOp: timestamp("geladen_op"),
  vervangenOp: timestamp("vervangen_op"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export const insertLoonJaarsetSchema = createInsertSchema(loonJaarsetsTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export type InsertLoonJaarset = z.infer<typeof insertLoonJaarsetSchema>;
export type LoonJaarset = typeof loonJaarsetsTable.$inferSelect;

// ── Jaarbronnen ───────────────────────────────────────────────────────────────
// Eén rij per bronsoort (bv. "uwv_loonheffing", "cao_mt") per jaarset.
// sha256-hash dient als integriteitscheck op het gedownloade bronbestand.
export const loonJaarbronnenTable = pgTable("loon_jaarbronnen", {
  id: serial("id").primaryKey(),
  jaarsetId: integer("jaarset_id").notNull().references(() => loonJaarsetsTable.id, { onDelete: "cascade" }),
  // Bronsoort identificeert de parametergroep (bv. "uwv_loonheffing", "cao_mt").
  bronsoort: text("bronsoort").notNull(),
  bronUrl: text("bron_url").notNull(),
  officieleBestandsnaam: text("officiele_bestandsnaam").notNull(),
  officieleVersie: text("officiele_versie").notNull(),
  // SHA-256 hex-digest van het bronbestand (64 hexadecimale tekens).
  sha256: text("sha256").notNull(),
  mimeType: text("mime_type").notNull(),
  bestandsgrootte: integer("bestandsgrootte").notNull(),
  vindplaats: text("vindplaats").notNull(),
  geladenOp: timestamp("geladen_op").notNull(),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
}, (t) => [
  // Per jaarset slechts één bron per bronsoort.
  uniqueIndex("loon_jaarbronnen_set_bronsoort_uniek").on(t.jaarsetId, t.bronsoort),
]);

export const insertLoonJaarbronSchema = createInsertSchema(loonJaarbronnenTable).omit({ id: true, aangemaaktOp: true });
export type InsertLoonJaarbron = z.infer<typeof insertLoonJaarbronSchema>;
export type LoonJaarbron = typeof loonJaarbronnenTable.$inferSelect;

// ── Jaarparameters ────────────────────────────────────────────────────────────
// Eén parameter per sleutel per jaarset. Sleutels zijn intern gedefinieerd
// (bv. "premie_ww_werknemer_pct"). Geen fiscale waarden hardcoded in TS;
// de waarde staat uitsluitend in de DB-rij (jsonb nullable).
// rekenstatus: berekend | niet_berekend
// Een parameter is niet_berekend als bron of vindplaats ontbreekt (SQL-check).
export const loonJaarparametersTable = pgTable("loon_jaarparameters", {
  id: serial("id").primaryKey(),
  jaarsetId: integer("jaarset_id").notNull().references(() => loonJaarsetsTable.id, { onDelete: "cascade" }),
  sleutel: text("sleutel").notNull(),
  // Datatype: integer | decimal | boolean | tekst | jsonb
  datatype: text("datatype").notNull().default("decimal"),
  // Parameterwaarde als jsonb (null = niet ingevuld).
  waarde: jsonb("waarde"),
  // rekenstatus: berekend als bron en vindplaats zijn opgegeven.
  rekenstatus: text("rekenstatus").notNull().default("niet_berekend"),
  reden: text("reden"),
  bronId: integer("bron_id").references(() => loonJaarbronnenTable.id, { onDelete: "set null" }),
  // Vindplaats in het bronbestand (bv. paginanummer, tabelnaam, regelreferentie).
  vindplaats: text("vindplaats"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
}, (t) => [
  // Per jaarset slechts één waarde per sleutel.
  uniqueIndex("loon_jaarparameters_set_sleutel_uniek").on(t.jaarsetId, t.sleutel),
]);

export const insertLoonJaarparameterSchema = createInsertSchema(loonJaarparametersTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export type InsertLoonJaarparameter = z.infer<typeof insertLoonJaarparameterSchema>;
export type LoonJaarparameter = typeof loonJaarparametersTable.$inferSelect;

// ── Loonstatussen ─────────────────────────────────────────────────────────────
// Één loonstaat per inkomstenverhouding per kalenderjaar.
// tijdvak: maand | vier_weken
// status: concept | gesloten
export const loonStatenTable = pgTable("loon_staten", {
  id: serial("id").primaryKey(),
  inkomstenverhoudingId: integer("inkomstenverhouding_id").notNull().references(() => loonInkomstenverhoudingenTable.id, { onDelete: "cascade" }),
  kalenderjaar: integer("kalenderjaar").notNull(),
  // Tijdvakmethode voor dit jaar: maand (12 tijdvakken) of vier_weken (13 tijdvakken).
  tijdvak: text("tijdvak").notNull().default("maand"),
  status: text("status").notNull().default("concept"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
}, (t) => [
  // Per inkomstenverhouding slechts één loonstaat per jaar.
  uniqueIndex("loon_staten_ikv_jaar_uniek").on(t.inkomstenverhoudingId, t.kalenderjaar),
]);

export const insertLoonStaatSchema = createInsertSchema(loonStatenTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export type InsertLoonStaat = z.infer<typeof insertLoonStaatSchema>;
export type LoonStaat = typeof loonStatenTable.$inferSelect;

// ── Loonstaattijdvakregels ────────────────────────────────────────────────────
// Eén rij per tijdvaknummer per loonstaat. Bevat de berekende en cumulatieve
// loonwaarden als jsonb-objecten (structuur bepaald door de rekenkern, niet
// hardcoded in dit schema). Geen fiscale bedragen in TS/JS.
// rekenstatus: berekend | niet_berekend (default niet_berekend)
// Vindplaats is verplicht; ontbreekt die, dan is de status niet_berekend (SQL-check).
export const loonStaatTijdvakregelsTable = pgTable("loon_staat_tijdvakregels", {
  id: serial("id").primaryKey(),
  loonstaatId: integer("loonstaat_id").notNull().references(() => loonStatenTable.id, { onDelete: "cascade" }),
  // Tijdvaknummer: 1..12 (maand) of 1..13 (vier_weken).
  tijdvaknummer: integer("tijdvaknummer").notNull(),
  periodeStart: date("periode_start", { mode: "string" }).notNull(),
  periodeEinde: date("periode_einde", { mode: "string" }).notNull(),
  // rekenstatus: berekend als vindplaats aanwezig is.
  rekenstatus: text("rekenstatus").notNull().default("niet_berekend"),
  reden: text("reden"),
  vindplaats: text("vindplaats"),
  // Tijdvakwaarden: loonelementen voor dit tijdvak als jsonb-object.
  tijdvakWaarden: jsonb("tijdvak_waarden").notNull().default({}),
  // Cumulatieven: jaar-tot-datum sommen als jsonb-object.
  cumulatieven: jsonb("cumulatieven").notNull().default({}),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
}, (t) => [
  // Per loonstaat slechts één regel per tijdvaknummer.
  uniqueIndex("loon_staat_tijdvakregels_staat_nummer_uniek").on(t.loonstaatId, t.tijdvaknummer),
]);

export const insertLoonStaatTijdvakregelSchema = createInsertSchema(loonStaatTijdvakregelsTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export type InsertLoonStaatTijdvakregelSchema = z.infer<typeof insertLoonStaatTijdvakregelSchema>;
export type LoonStaatTijdvakregelSchema = typeof loonStaatTijdvakregelsTable.$inferSelect;
