// Offerte Intelligence (Fase 1 — PREP) — Parallel spoor, formeel akkoord gebruiker.
//
// Datamodel + structuur op basis van het echte FPS-offerteformat (Parkzicht
// Oldenzaal / WBO Wonen + bijbehorend prijzenblad). Fase 1 bevat BEWUST GEEN
// AI-logica en GEEN automatische offerteverzending. De aiVeld/aiHint/aiVoorstel
// velden zijn voorbereidingen zodat later "Spot -> Calculatie -> Offerte" en
// AI-voorstellen kunnen worden aangezet; AI stelt voor, een mens beslist.
//
// Geïdentificeerde structuur:
//  - Vaste hoofdstukken: Aanbiedingsbrief, Communicatie & afspraakplanner,
//    Begroting, Communicatieplan, Algemene voorwaarden (bijlage).
//  - Variabele onderdelen: project/gebouw, opdrachtgever, kenmerken, prijzen.
//  - Begrotingsstructuur: maatregelregels (per snag/spot) + algemene kosten,
//    eenheid (st/m2/deur/m1/pst), aantal, prijs per eenheid, excl/incl btw.
//  - Risicoanalyse/uitgangspunten/voorbehouden: per snag meer-/minderwerk,
//    adviezen en condities.
import { pgTable, serial, text, integer, real, boolean, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { gebouwenTable } from "./gebouwen";
import { gebruikersTable } from "./gebruikers";
import { crmKlantenTable } from "./crm";
import { voorzieningenTable } from "./voorzieningen";

// Offertesjabloon — vaste structuur per werkmaatschappij (bv. FPS Bouw).
export const offerteSjablonenTable = pgTable("offerte_sjablonen", {
  id: serial("id").primaryKey(),
  naam: text("naam").notNull(),
  omschrijving: text("omschrijving"),
  werkmaatschappij: text("werkmaatschappij").notNull().default("FPS Bouw"),
  actief: boolean("actief").notNull().default(true),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// Standaardhoofdstukken binnen een sjabloon. type = vast | variabel | bijlage.
// aiVeld/aiHint markeren tekstblokken die later door AI ingevuld kunnen worden.
export const offerteHoofdstukkenTable = pgTable("offerte_hoofdstukken", {
  id: serial("id").primaryKey(),
  sjabloonId: integer("sjabloon_id").notNull().references(() => offerteSjablonenTable.id, { onDelete: "cascade" }),
  titel: text("titel").notNull(),
  volgorde: integer("volgorde").notNull().default(0),
  type: text("type").notNull().default("variabel"),
  standaardtekst: text("standaardtekst"),
  aiVeld: boolean("ai_veld").notNull().default(false),
  aiHint: text("ai_hint"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// Offerte-kop — variabele onderdelen + kenmerkenblok uit het FPS-format.
export const offertesTable = pgTable("offertes", {
  id: serial("id").primaryKey(),
  offertenummer: text("offertenummer"),
  titel: text("titel").notNull(),
  gebouwId: integer("gebouw_id").references(() => gebouwenTable.id, { onDelete: "set null" }),
  klantId: integer("klant_id").references(() => crmKlantenTable.id, { onDelete: "set null" }),
  sjabloonId: integer("sjabloon_id").references(() => offerteSjablonenTable.id, { onDelete: "set null" }),
  opdrachtgever: text("opdrachtgever"),
  onsKenmerk: text("ons_kenmerk"),
  uwKenmerk: text("uw_kenmerk"),
  uwBriefVan: text("uw_brief_van"),
  behandeldDoorId: integer("behandeld_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  datum: text("datum"),
  geldigheidDagen: integer("geldigheid_dagen").notNull().default(30),
  voorwaarden: text("voorwaarden"),
  bedragExclBtw: real("bedrag_excl_btw").notNull().default(0),
  btwPercentage: real("btw_percentage").notNull().default(21),
  bedragInclBtw: real("bedrag_incl_btw").notNull().default(0),
  kleurthema: text("kleurthema").default("fps-oranje"),
  status: text("status").notNull().default("concept"),
  portaalStatus: text("portaal_status").notNull().default("concept"),
  aangemaaktDoorId: integer("aangemaakt_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// Begrotingsregels (prijzenblad). categorie = maatregel | algemene_kosten.
// voorzieningId koppelt een regel aan een spot (Spot -> Calculatie -> Offerte).
export const offerteRegelsTable = pgTable("offerte_regels", {
  id: serial("id").primaryKey(),
  offerteId: integer("offerte_id").notNull().references(() => offertesTable.id, { onDelete: "cascade" }),
  categorie: text("categorie").notNull().default("maatregel"),
  snagReferentie: text("snag_referentie"),
  voorzieningId: integer("voorziening_id").references(() => voorzieningenTable.id, { onDelete: "set null" }),
  maatregel: text("maatregel").notNull(),
  ruimte: text("ruimte"),
  uitgangspunten: text("uitgangspunten"),
  eenheid: text("eenheid").notNull().default("st"),
  aantal: real("aantal").notNull().default(0),
  prijsPerEenheid: real("prijs_per_eenheid").notNull().default(0),
  kosten: real("kosten").notNull().default(0),
  volgorde: integer("volgorde").notNull().default(0),
  aiVoorstel: boolean("ai_voorstel").notNull().default(false),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// Uitgangspunten / voorbehouden / risicoanalyse op projectniveau.
// type = uitgangspunt | voorbehoud | advies | meerwerk | minderwerk | risico.
export const offerteUitgangspuntenTable = pgTable("offerte_uitgangspunten", {
  id: serial("id").primaryKey(),
  offerteId: integer("offerte_id").notNull().references(() => offertesTable.id, { onDelete: "cascade" }),
  snagReferentie: text("snag_referentie"),
  voorzieningId: integer("voorziening_id").references(() => voorzieningenTable.id, { onDelete: "set null" }),
  type: text("type").notNull().default("uitgangspunt"),
  tekst: text("tekst").notNull(),
  volgorde: integer("volgorde").notNull().default(0),
  aiVoorstel: boolean("ai_voorstel").notNull().default(false),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// Offerte-secties — tekstblokken voor de Proposal Studio.
// sectie_type: aanbiedingsbrief | projectomschrijving | aanpak | team | planning | voorwaarden | slotwoord | vrij
export const offerteSectiesTable = pgTable("offerte_secties", {
  id: serial("id").primaryKey(),
  offerteId: integer("offerte_id").notNull().references(() => offertesTable.id, { onDelete: "cascade" }),
  sectieType: text("sectie_type").notNull().default("vrij"),
  volgorde: integer("volgorde").notNull().default(0),
  actief: boolean("actief").notNull().default(true),
  titel: text("titel").notNull().default(""),
  inhoud: text("inhoud"),
  aiGegenereerd: boolean("ai_gegenereerd").notNull().default(false),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// Versie-snapshots van een offerte (handmatig aangemaakt door gebruiker).
export const offerteVersiesTable = pgTable("offerte_versies", {
  id: serial("id").primaryKey(),
  offerteId: integer("offerte_id").notNull().references(() => offertesTable.id, { onDelete: "cascade" }),
  versienummer: integer("versienummer").notNull().default(1),
  snapshot: jsonb("snapshot"),
  samenvatting: text("samenvatting"),
  aangemaaktDoorId: integer("aangemaakt_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
});

// Bijlagen/verwijzingen bij een offerte (links, certificaten, foto's, tekeningen).
export const offerteBijlagenTable = pgTable("offerte_bijlagen", {
  id: serial("id").primaryKey(),
  offerteId: integer("offerte_id").notNull().references(() => offertesTable.id, { onDelete: "cascade" }),
  bijlageType: text("bijlage_type").notNull().default("overig"),
  naam: text("naam").notNull().default(""),
  beschrijving: text("beschrijving"),
  url: text("url"),
  volgorde: integer("volgorde").notNull().default(0),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// ── Portaal & ondertekening ───────────────────────────────────────────────────
// Eénmalige token-links voor de klantenportaalpagina.
export const offertePortaalTokensTable = pgTable("offerte_portaal_tokens", {
  id:          serial("id").primaryKey(),
  offerteId:   integer("offerte_id").notNull().references(() => offertesTable.id, { onDelete: "cascade" }),
  token:       text("token").notNull().unique(),
  verlooptOp:  timestamp("verloopt_op").notNull(),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
}, (t) => [index("idx_portaal_tokens_token").on(t.token)]);

// Vastgelegde digitale handtekeningen (onveranderbaar bewijs).
export const offerteHandtekeningenTable = pgTable("offerte_handtekeningen", {
  id:             serial("id").primaryKey(),
  offerteId:      integer("offerte_id").notNull().references(() => offertesTable.id, { onDelete: "restrict" }),
  naam:           text("naam").notNull(),
  bedrijf:        text("bedrijf"),
  functie:        text("functie"),
  datum:          text("datum").notNull(),
  ip:             text("ip"),
  handtekeningDataUrl: text("handtekening_data_url").notNull(),
  versienummer:   integer("versienummer").notNull().default(1),
  portaalToken:   text("portaal_token"),
  aangemaaktOp:   timestamp("aangemaakt_op").notNull().defaultNow(),
});

// Vragen van bezoekers via de portaalpagina.
export const offerteVragenTable = pgTable("offerte_vragen", {
  id:           serial("id").primaryKey(),
  offerteId:    integer("offerte_id").notNull().references(() => offertesTable.id, { onDelete: "cascade" }),
  bezoekerNaam: text("bezoeker_naam"),
  vraag:        text("vraag").notNull(),
  antwoord:     text("antwoord"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// Log van verstuurde offerte-e-mails.
export const offerteEmailLogTable = pgTable("offerte_email_log", {
  id:           serial("id").primaryKey(),
  offerteId:    integer("offerte_id").notNull().references(() => offertesTable.id, { onDelete: "cascade" }),
  ontvanger:    text("ontvanger").notNull(),
  onderwerp:    text("onderwerp").notNull(),
  status:       text("status").notNull().default("verzonden"),
  portaalToken: text("portaal_token"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// Tracking-events per portaalbezoek.
export const offerteTrackingTable = pgTable("offerte_tracking", {
  id:           serial("id").primaryKey(),
  offerteId:    integer("offerte_id").notNull().references(() => offertesTable.id, { onDelete: "cascade" }),
  event:        text("event").notNull(),
  portaalToken: text("portaal_token"),
  ip:           text("ip"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
}, (t) => [index("idx_offerte_tracking_offerte").on(t.offerteId)]);

export const insertOfferteSjabloonSchema = createInsertSchema(offerteSjablonenTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export const insertOfferteHoofdstukSchema = createInsertSchema(offerteHoofdstukkenTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export const insertOfferteSchema = createInsertSchema(offertesTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export const insertOfferteRegelSchema = createInsertSchema(offerteRegelsTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export const insertOfferteUitgangspuntSchema = createInsertSchema(offerteUitgangspuntenTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export const insertOfferteSectieSchema = createInsertSchema(offerteSectiesTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export const insertOfferteVersieSchema = createInsertSchema(offerteVersiesTable).omit({ id: true, aangemaaktOp: true });
export const insertOfferteBijlageSchema = createInsertSchema(offerteBijlagenTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });

export type InsertOfferteSjabloon = z.infer<typeof insertOfferteSjabloonSchema>;
export type InsertOfferteHoofdstuk = z.infer<typeof insertOfferteHoofdstukSchema>;
export type InsertOfferte = z.infer<typeof insertOfferteSchema>;
export type InsertOfferteRegel = z.infer<typeof insertOfferteRegelSchema>;
export type InsertOfferteUitgangspunt = z.infer<typeof insertOfferteUitgangspuntSchema>;
export type InsertOfferteSectie = z.infer<typeof insertOfferteSectieSchema>;
export type InsertOfferteVersie = z.infer<typeof insertOfferteVersieSchema>;
export type InsertOfferteBijlage = z.infer<typeof insertOfferteBijlageSchema>;

export type OfferteSjabloon = typeof offerteSjablonenTable.$inferSelect;
export type OfferteHoofdstuk = typeof offerteHoofdstukkenTable.$inferSelect;
export type Offerte = typeof offertesTable.$inferSelect;
export type OfferteRegel = typeof offerteRegelsTable.$inferSelect;
export type OfferteUitgangspunt = typeof offerteUitgangspuntenTable.$inferSelect;
export type OfferteSectie = typeof offerteSectiesTable.$inferSelect;
export type OfferteVersie = typeof offerteVersiesTable.$inferSelect;
export type OfferteBijlage = typeof offerteBijlagenTable.$inferSelect;
