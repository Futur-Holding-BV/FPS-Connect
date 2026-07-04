// Financial Intelligence Engine (FIE) — centrale financiële rekenmotor FPS Connect.
// Alle marges, AK-normen en prognoses lopen via deze engine.
// Fase 1+2: jaarbegroting, AK-posten, capaciteitssnapsots.
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
