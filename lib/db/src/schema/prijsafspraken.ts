import { pgTable, serial, text, integer, real, boolean, timestamp, date, numeric, jsonb, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { leveranciersTable } from "./leveranciers";
import { modCalcArtekelenTable } from "./mod-calculatie";

// ── PRIJS_01 §3 — Prijsafspraken (jaarprijzen, staffels, toeslagen) ──────────
// Eigen tabel met geldigheidsperioden. Een prijsafspraak wordt NOOIT
// overschreven: een nieuwe jaarprijs is een nieuwe regel met een nieuwe periode;
// de oude blijft staan. Voor elke datum is precies één prijs geldig per
// leverancier, artikel(code) en staffel — overlappende perioden worden op
// DB-niveau geweigerd via een EXCLUDE-constraint (zie migratie 0037), met een
// nette 409 in de app-laag als eerste vangnet.
//
// Toeslagen: [{soort,bedrag,eenheid?}], soort ∈ transport|spoed|kleine_order|anders.
// bron: 'handmatig' | 'import'. Rollback van een import zet teruggedraaidOp
// i.p.v. delete, zodat de historie traceerbaar blijft (§4).
export type PrijsafspraakToeslag = {
  soort: "transport" | "spoed" | "kleine_order" | "anders";
  bedrag: number;
  eenheid?: string;
};

export const prijsafsprakenTable = pgTable("prijsafspraken", {
  id: serial("id").primaryKey(),
  leverancierId: integer("leverancier_id").notNull().references(() => leveranciersTable.id),
  // NULL = leverancierscode nog niet gekoppeld aan een eigen artikel (§4: nooit
  // automatisch een artikel aanmaken).
  artikelId: integer("artikel_id").references(() => modCalcArtekelenTable.id, { onDelete: "set null" }),
  leverancierArtikelcode: text("leverancier_artikelcode"),
  leverancierOmschrijving: text("leverancier_omschrijving"),
  prijs: numeric("prijs", { precision: 12, scale: 4 }).notNull(),
  eenheid: text("eenheid").notNull(),
  exclBtw: boolean("excl_btw").notNull().default(true),
  valuta: text("valuta").notNull().default("EUR"),
  geldigVan: date("geldig_van").notNull(),
  geldigTot: date("geldig_tot").notNull(),
  // Staffel: vanaf dit aantal geldt deze prijs; 0 = basisprijs.
  staffelVanaf: real("staffel_vanaf").notNull().default(0),
  toeslagen: jsonb("toeslagen").notNull().default(sql`'[]'::jsonb`).$type<PrijsafspraakToeslag[]>(),
  bronPrijslijst: text("bron_prijslijst"),
  bronDatum: date("bron_datum"),
  bron: text("bron").notNull().default("handmatig"),
  importId: integer("import_id"),
  aangemaaktDoor: integer("aangemaakt_door"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
  teruggedraaidOp: timestamp("teruggedraaid_op"),
}, (t) => ({
  leverancierIdx: index("prijsafspraken_leverancier_idx").on(t.leverancierId),
  artikelIdx: index("prijsafspraken_artikel_idx").on(t.artikelId),
  importIdx: index("prijsafspraken_import_idx").on(t.importId),
}));

export const insertPrijsafspraakSchema = createInsertSchema(prijsafsprakenTable).omit({
  id: true,
  aangemaaktOp: true,
  bijgewerktOp: true,
});
export type InsertPrijsafspraak = z.infer<typeof insertPrijsafspraakSchema>;
export type Prijsafspraak = typeof prijsafsprakenTable.$inferSelect;
