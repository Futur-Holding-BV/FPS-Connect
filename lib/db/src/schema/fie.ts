// Financial Intelligence Engine (FIE) — centrale financiële rekenmotor FPS Connect.
// Alle marges, AK-normen en prognoses lopen via deze engine.
// Fase 1+2: jaarbegroting, AK-posten, capaciteitssnapsots.
// Fase 3: jaarbedrijfsprognose met persistente observaties.
import { pgTable, serial, text, integer, real, boolean, timestamp } from "drizzle-orm/pg-core";
import { werkgeversTable } from "./hrm";

// ─── Jaarbegroting ───────────────────────────────────────────────────────────
// Één actieve begroting per boekjaar. Bevat de bedrijfsdoelen en AK-normen
// die de FIE gebruikt om per calculatie advies te geven.
export const fieJaarbegrotingenTable = pgTable("fie_jaarbegrotingen", {
  id: serial("id").primaryKey(),
  boekjaar: integer("boekjaar").notNull(),
  status: text("status").notNull().default("concept"), // concept | actief | gesloten
  omzetDoel: real("omzet_doel"),                       // gewenste omzet in euro
  directeKostenDoel: real("directe_kosten_doel"),      // verwachte directe kosten
  doelMargePct: real("doel_marge_pct").notNull().default(15), // gewenste nettomarge %
  akPerProductiefUur: real("ak_per_productief_uur"),   // AK-bedrag per factureerbaar uur
  productieveUrenDoel: integer("productieve_uren_doel"), // verwachte productieve uren
  verdeelsleutel: text("verdeelsleutel").notNull().default("uren"), // uren | omzet
  opmerkingen: text("opmerkingen"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// ─── AK-posten ───────────────────────────────────────────────────────────────
// Individuele indirecte-kostenposten per jaarbegroting, per werkgever.
// Categorie: huisvesting | personeel_indirect | voertuigen | ict | overig
export const fieAkPostenTable = pgTable("fie_ak_posten", {
  id: serial("id").primaryKey(),
  begrotingId: integer("begroting_id").notNull().references(() => fieJaarbegrotingenTable.id, { onDelete: "cascade" }),
  werkgeverId: integer("werkgever_id").references(() => werkgeversTable.id, { onDelete: "set null" }),
  categorie: text("categorie").notNull().default("overig"),
  omschrijving: text("omschrijving").notNull(),
  bedragJaarbasis: real("bedrag_jaarbasis").notNull().default(0),
  actief: boolean("actief").notNull().default(true),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// ─── Capaciteitssnapsots ─────────────────────────────────────────────────────
// Momentopname van de productieve capaciteit per boekjaar en werkgever.
// Wordt gebruikt om ak_per_productief_uur af te leiden uit totale AK-kosten.
export const fieCapaciteitSnapshotsTable = pgTable("fie_capaciteit_snapshots", {
  id: serial("id").primaryKey(),
  boekjaar: integer("boekjaar").notNull(),
  werkgeverId: integer("werkgever_id").references(() => werkgeversTable.id, { onDelete: "set null" }),
  productieveUren: real("productieve_uren").notNull().default(0),
  fte: real("fte").default(0),
  snapshotDatum: text("snapshot_datum").notNull(), // ISO date
  bron: text("bron").notNull().default("handmatig"), // handmatig | hrm_berekend
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
});

// ─── Prognose observaties (Fase 3) ───────────────────────────────────────────
// Auto-gegenereerd bij GET /fie/prognose/:boekjaar; vervangen bij elke aanroep.
// type: omzet_risico | omzet_achterstand | omzet_voorsprong | lege_pipeline |
//        geen_begroting | break_even_risico | ak_onderdekking
// ernst: info | waarschuwing | kritiek
export const fieObservatiesTable = pgTable("fie_observaties", {
  id: serial("id").primaryKey(),
  boekjaar: integer("boekjaar").notNull(),
  type: text("type").notNull(),
  ernst: text("ernst").notNull().default("info"),
  omschrijving: text("omschrijving").notNull(),
  waarde: real("waarde"),
  drempelwaarde: real("drempelwaarde"),
  afwijkingPct: real("afwijking_pct"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export type FieObservatie = typeof fieObservatiesTable.$inferSelect;

// ─── Nacalculatie-records (Fase 5) ───────────────────────────────────────────
// Per afgesloten opdracht: calculatie vs. werkelijk per kostensoort.
// Wordt gevuld door de dagelijkse achtergrondtaak na projectafsluiting.
export const fieNacalculatiesTable = pgTable("fie_nacalculaties", {
  id: serial("id").primaryKey(),
  opdrachtId: integer("opdracht_id").notNull(),
  werktype: text("werktype").notNull().default("algemeen"),
  calcArbeidUren: real("calc_arbeid_uren").default(0),
  werkelijkArbeidUren: real("werkelijk_arbeid_uren").default(0),
  afwijkingPctArbeid: real("afwijking_pct_arbeid"),
  calcMateriaalBedrag: real("calc_materiaal_bedrag").default(0),
  werkelijkMateriaalBedrag: real("werkelijk_materiaal_bedrag").default(0),
  afwijkingPctMateriaal: real("afwijking_pct_materiaal"),
  calcOnderaannemingBedrag: real("calc_onderaanneming_bedrag").default(0),
  werkelijkOnderaannemingBedrag: real("werkelijk_onderaanneming_bedrag").default(0),
  afwijkingPctOnderaanneming: real("afwijking_pct_onderaanneming"),
  afgesloten: boolean("afgesloten").notNull().default(false),
  berekendOp: timestamp("berekend_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// ─── Leermomenten (Fase 5) ────────────────────────────────────────────────────
// Geaggregeerde afwijkingen per werktype over meerdere projecten.
// Dagelijks herberekend uit fie_nacalculaties; handmatig aanpasbaar (correctie_factor).
export const fieLeerMomentenTable = pgTable("fie_leermomenten", {
  id: serial("id").primaryKey(),
  werktype: text("werktype").notNull().unique(),
  afwijkingPctArbeid: real("afwijking_pct_arbeid").notNull().default(0),
  afwijkingPctMateriaal: real("afwijking_pct_materiaal").notNull().default(0),
  gebaseerdOpNProjecten: integer("gebaseerd_op_n_projecten").notNull().default(0),
  correctieFactor: real("correctie_factor").notNull().default(1.0),
  opmerkingen: text("opmerkingen"),
  laatsteUpdate: timestamp("laatste_update").notNull().defaultNow(),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
});

export type FieNacalculatie = typeof fieNacalculatiesTable.$inferSelect;
export type FieLeermoment = typeof fieLeerMomentenTable.$inferSelect;
