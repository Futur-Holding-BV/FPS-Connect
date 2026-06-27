import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

// ── Go-Live Manager — implementatiefasen ──────────────────────────────────────
// Wordt eenmalig geseed vanuit de route (upsert op sleutel).
// Beheerder kan status / voortgang / opmerkingen / risico aanpassen.
export const goLiveFasenTable = pgTable("go_live_fasen", {
  id: serial("id").primaryKey(),
  sleutel: text("sleutel").notNull().unique(),
  naam: text("naam").notNull(),
  beschrijving: text("beschrijving"),
  doel: text("doel"),
  afhankelijkheden: text("afhankelijkheden").array().notNull().default([]),
  verantwoordelijke: text("verantwoordelijke"),
  geschatteUren: integer("geschatte_uren"),
  status: text("status").notNull().default("open"),
  voortgangPct: integer("voortgang_pct").notNull().default(0),
  opmerkingen: text("opmerkingen"),
  risico: text("risico"),
  volgorde: integer("volgorde").notNull().default(0),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export type GoLiveFase = typeof goLiveFasenTable.$inferSelect;

// ── AI adviezen ───────────────────────────────────────────────────────────────
// AI genereert adviezen o.b.v. actuele readiness-snapshot.
// Status-lifecycle: open → geaccepteerd | later | genegeerd
export const goLiveAdviezenTable = pgTable("go_live_adviezen", {
  id: serial("id").primaryKey(),
  titel: text("titel").notNull(),
  inhoud: text("inhoud").notNull(),
  reden: text("reden"),
  impact: text("impact"),
  risico: text("risico"),
  tijdwinst_uur: integer("tijdwinst_uur"),
  afhankelijkheden: text("afhankelijkheden").array().notNull().default([]),
  status: text("status").notNull().default("open"),
  contextJson: jsonb("context_json"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export type GoLiveAdvies = typeof goLiveAdviezenTable.$inferSelect;

// ── Lessen geleerd ─────────────────────────────────────────────────────────────
// Zelflerende implementatiecoach: bewaart wat bij vorige implementaties goed/slecht ging.
export const goLiveLessenTable = pgTable("go_live_lessen", {
  id: serial("id").primaryKey(),
  faseSleutel: text("fase_sleutel").notNull(),
  omschrijving: text("omschrijving").notNull(),
  tijdKosteUur: integer("tijd_koste_uur"),
  aantalKeer: integer("aantal_keer").notNull().default(1),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export type GoLiveLes = typeof goLiveLessenTable.$inferSelect;
