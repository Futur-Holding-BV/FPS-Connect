import { pgTable, serial, text, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";

// ── Compliance-signalen (BIAE) ────────────────────────────────────────────────
// Regelgebaseerde compliance-signaleringen die de dagelijkse BIAE-compliance-job
// genereert (AVG-termijnen, verlopen certificaten, spots zonder document,
// verlofsaldi buiten CAO-grenzen). Bewust een eigen tabel i.p.v. gebruikers_
// meldingen: dit zijn systeem-signalen zonder gebruikersindiener, met een eigen
// levenscyclus (open → opgelost) en dedup-sleutel per regel+entiteit.
export const complianceSignalenTable = pgTable(
  "compliance_signalen",
  {
    id: serial("id").primaryKey(),
    // regel: avg_inzagetermijn | certificaat_verlopen | spot_zonder_document | verlofsaldo_buiten_cao
    regel: text("regel").notNull(),
    ernst: text("ernst").notNull().default("waarschuwing"), // info | waarschuwing | kritiek
    entiteitType: text("entiteit_type").notNull(),
    entiteitId: integer("entiteit_id"),
    titel: text("titel").notNull(),
    omschrijving: text("omschrijving").notNull(),
    // Dedup-sleutel: één open signaal per regel+entiteit tegelijk.
    dedupSleutel: text("dedup_sleutel").notNull(),
    status: text("status").notNull().default("open"), // open | opgelost | genegeerd
    opgelostOp: timestamp("opgelost_op"),
    aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
    bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
  },
  (t) => [
    index("compliance_signalen_status_idx").on(t.status),
    index("compliance_signalen_dedup_idx").on(t.dedupSleutel),
    index("compliance_signalen_regel_idx").on(t.regel),
  ],
);

export type ComplianceSignaal = typeof complianceSignalenTable.$inferSelect;
export type ComplianceSignaalInsert = typeof complianceSignalenTable.$inferInsert;
