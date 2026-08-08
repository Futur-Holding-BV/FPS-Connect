import { pgTable, serial, text, integer, real, boolean, timestamp } from "drizzle-orm/pg-core";
import { opdrachtenTable } from "./opdrachten";
import { gebruikersTable } from "./gebruikers";
import { medewerkersTable } from "./hrm";

// ── Regie-voorwaarden — één per regieproject ────────────────────────────────
// Legt alle contractuele afspraken vast: contactpersonen, toeslagen,
// bewijsvereisten, betaaltermijn en facturatiefrequentie.
export const regieVoorwaardenTable = pgTable("regie_voorwaarden", {
  id: serial("id").primaryKey(),
  opdrachtId: integer("opdracht_id").notNull().references(() => opdrachtenTable.id, { onDelete: "cascade" }),
  // Partijen
  contactpersoonOpdrachtgever: text("contactpersoon_opdrachtgever"),
  akkoordgeverOpdrachtgever: text("akkoordgever_opdrachtgever"),
  projectleiderFps: text("projectleider_fps"),
  // Opslagen
  materiaalopslag: real("materiaalopslag").notNull().default(0),         // % bovenop inkoopprijs
  materieelopslag: real("materieelopslag").notNull().default(0),         // % bovenop huurprijs
  transportkosten: real("transportkosten").notNull().default(0),         // euro per rit
  voorrijkosten: real("voorrijkosten").notNull().default(0),             // euro per keer
  // Toeslagen (%)
  toeslagAvond: real("toeslag_avond").notNull().default(0),
  toeslagWeekend: real("toeslag_weekend").notNull().default(0),
  toeslagSpoed: real("toeslag_spoed").notNull().default(0),
  // Betalingsafspraken
  betaaltermijn: integer("betaaltermijn").notNull().default(30),         // dagen
  facturatiefrequentie: text("facturatiefrequentie").notNull().default("maandelijks"),
  // maandelijks | tweewekelijks | wekelijks | projectafronding
  // Bewijsvereisten
  handtekeningVereist: boolean("handtekening_vereist").notNull().default(false),
  weekstaatVereist: boolean("weekstaat_vereist").notNull().default(false),
  fotosVereist: boolean("fotos_vereist").notNull().default(false),
  bewijsvereisten: text("bewijsvereisten"),                              // vrij tekst
  notities: text("notities"),
  aangemaaktDoorId: integer("aangemaakt_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// ── Regie-tarieven — uurtarief per functiegroep, FK → regie_voorwaarden ─────
export const regieTarievenTable = pgTable("regie_tarieven", {
  id: serial("id").primaryKey(),
  voorwaardenId: integer("voorwaarden_id").notNull().references(() => regieVoorwaardenTable.id, { onDelete: "cascade" }),
  functiegroep: text("functiegroep").notNull(),
  // monteur | timmerman | voorman | projectleider | werkvoorbereider | onderaannemer
  // uur | dagdeel — dagdeel is een eigen tariefsoort (WVB_01), nooit stilzwijgend 4 uur
  tariefsoort: text("tariefsoort").notNull().default("uur"),
  uurtarief: real("uurtarief").notNull(),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
});

// ── Regie-begroting — indicatief bewakingsbudget (GEEN vaste aanneemsom) ────
export const regieBegrotingTable = pgTable("regie_begroting", {
  id: serial("id").primaryKey(),
  opdrachtId: integer("opdracht_id").notNull().references(() => opdrachtenTable.id, { onDelete: "cascade" }),
  // Ramingen
  verwachtUren: real("verwacht_uren"),
  verwachtMateriaal: real("verwacht_materiaal"),                         // euro
  verwachtMaterieel: real("verwacht_materieel"),                         // euro
  verwachtDoorlooptijdDagen: integer("verwacht_doorlooptijd_dagen"),
  maximaalBudget: real("maximaal_budget"),                               // euro — bewakingsgrens
  meldgrensOpdrachtgever: real("meldgrens_opdrachtgever"),               // euro — AI signaleert hierop
  // AI-signalering vlag — true = AI mag signaleren
  aiSignaleringActief: boolean("ai_signalering_actief").notNull().default(true),
  aangemaaktDoorId: integer("aangemaakt_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// ── Regie-materiaalregels — materiaalboekingen per regieproject ──────────────
// Bronnen: magazijn | busvoorraad | projectinkoop | losse_bon | leverancier | onderaannemer
export const regieMaterialenTable = pgTable("regie_materialen", {
  id: serial("id").primaryKey(),
  opdrachtId: integer("opdracht_id").notNull().references(() => opdrachtenTable.id, { onDelete: "cascade" }),
  datum: text("datum").notNull(),                                        // "YYYY-MM-DD"
  artikel: text("artikel").notNull(),
  omschrijving: text("omschrijving"),
  hoeveelheid: real("hoeveelheid").notNull().default(1),
  eenheid: text("eenheid").notNull().default("st"),
  inkoopprijs: real("inkoopprijs"),                                      // euro per eenheid
  verkoopprijs: real("verkoopprijs"),                                    // euro per eenheid (na opslag)
  bron: text("bron").notNull().default("magazijn"),
  // magazijn | busvoorraad | projectinkoop | losse_bon | leverancier | onderaannemer
  leverancier: text("leverancier"),
  bonnummer: text("bonnummer"),
  fotoPad: text("foto_pad"),                                             // bon-foto
  // workflow
  status: text("status").notNull().default("concept"),                   // concept | goedgekeurd | gefactureerd
  geboektDoorId: integer("geboekt_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  geboektDoorMedewerkerId: integer("geboekt_door_medewerker_id").references(() => medewerkersTable.id, { onDelete: "set null" }),
  opmerking: text("opmerking"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});
