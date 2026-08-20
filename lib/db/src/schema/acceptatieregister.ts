// Acceptatieregister (REGISTER_01) — één regel per acceptatiepunt per opdracht.
// Standen: gehaald | niet_gebouwd | onbewezen | wacht_op_rene.
// "onbewezen" = bestaat in de code maar het door de opdracht geëiste bewijs
// ontbreekt. Zie migratie 0093.
import { pgTable, serial, text, integer, timestamp, unique, index, check, jsonb } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const acceptatieRegisterTable = pgTable(
  "acceptatie_register",
  {
    id: serial("id").primaryKey(),
    opdrachtCode: text("opdracht_code").notNull(),
    puntNummer: integer("punt_nummer").notNull(),
    omschrijving: text("omschrijving").notNull(),
    stand: text("stand").notNull().default("onbewezen"),
    bewijsVindplaats: text("bewijs_vindplaats"),
    bronBestand: text("bron_bestand"),
    bronSoort: text("bron_soort").notNull(),
    bronDatum: timestamp("bron_datum").notNull(),
    laatsteCodeWijzigingOp: timestamp("laatste_code_wijziging_op").notNull(),
    relevanteCodepaden: text("relevante_codepaden").array().notNull().default(sql`ARRAY[]::TEXT[]`),
    beoordeeldOp: timestamp("beoordeeld_op").notNull().defaultNow(),
    toelichting: text("toelichting"),
    aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
    bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
  },
  (t) => [
    unique("acceptatie_register_uniek").on(t.opdrachtCode, t.puntNummer),
    index("acceptatie_register_bron_datum_idx").on(t.bronDatum),
    check(
      "acceptatie_register_bron_soort_check",
      sql`${t.bronSoort} IN ('bewijsscript', 'code', 'meetrapport', 'antwoorddocument')`,
    ),
    check(
      "acceptatie_register_gehaald_actueel_check",
      sql`${t.stand} <> 'gehaald' OR (${t.bewijsVindplaats} IS NOT NULL AND btrim(${t.bewijsVindplaats}) <> '' AND ${t.bronBestand} IS NOT NULL AND btrim(${t.bronBestand}) <> '' AND cardinality(${t.relevanteCodepaden}) > 0 AND ${t.bronDatum} >= ${t.laatsteCodeWijzigingOp})`,
    ),
  ],
);

export const acceptatieRegisterHergradeerRunsTable = pgTable(
  "acceptatie_register_hergradeer_runs",
  {
    sleutel: text("sleutel").primaryKey(),
    status: text("status").notNull(),
    gestartOp: timestamp("gestart_op").notNull().defaultNow(),
    voltooidOp: timestamp("voltooid_op"),
    samenvatting: jsonb("samenvatting"),
  },
  (t) => [
    check(
      "acceptatie_register_hergradeer_runs_status_check",
      sql`${t.status} IN ('bezig', 'mislukt', 'voltooid')`,
    ),
  ],
);

export const ACCEPTATIE_STANDEN = ["gehaald", "niet_gebouwd", "onbewezen", "wacht_op_rene"] as const;
export type AcceptatieStand = (typeof ACCEPTATIE_STANDEN)[number];
export const ACCEPTATIE_BRONSOORTEN = ["bewijsscript", "code", "meetrapport", "antwoorddocument"] as const;
export type AcceptatieBronsoort = (typeof ACCEPTATIE_BRONSOORTEN)[number];
export const ACCEPTATIE_BRONKRACHT: Record<AcceptatieBronsoort, number> = {
  bewijsscript: 4,
  code: 3,
  meetrapport: 2,
  antwoorddocument: 1,
};

// Gedeeld/exclusief advisory lock tussen register-PATCHes en de historische
// eenmalige hergrading. Blijft bewust stabiel over processen en deploys.
export const ACCEPTATIEREGISTER_HERGRADEER_LOCK = 1_166_082_020;
