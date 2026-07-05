import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { artikelenTable } from "./artikelen";
import { fpsBedrijfsstandaardenTable } from "./kb";

// ── FPS VISUALS — centrale Visual Library ─────────────────────────────────────
// Opslag van goedgekeurde visuals (tekeningen, referentiefoto's, animaties, etc.)
// actief=false is default: beheerder moet expliciet activeren na review.
// bron_type is verplicht: een visual zonder geldige bron wordt nooit getoond.
// spot_type[] met GIN-index voor efficiënte VGE-selectie.

export const VISUAL_TYPES = [
  "detailtekening",
  "projecttekening_uitsnede",
  "referentiefoto",
  "exploded_view",
  "animatie",
  "checklist",
  "productblad",
  "montagevoorschrift",
  "schema",
  "3d_weergave",
] as const;

export const BRON_TYPES = [
  "projecttekening",
  "ETA",
  "DoP",
  "montagevoorschrift",
  "fps_standaard",
  "praktijkfoto",
  "productblad",
] as const;

export const fpsVisualsTable = pgTable(
  "fps_visuals",
  {
    id: serial("id").primaryKey(),
    naam: text("naam").notNull(),
    visualType: text("visual_type").notNull(),
    bronType: text("bron_type").notNull(),
    bronReferentie: text("bron_referentie"),
    objectPath: text("object_path").notNull(),
    thumbnailPath: text("thumbnail_path"),
    spotType: text("spot_type").array().notNull().default(sql`'{}'::text[]`),
    artikelId: integer("artikel_id").references(() => artikelenTable.id, {
      onDelete: "set null",
    }),
    bedrijfsstandaardId: integer("bedrijfsstandaard_id").references(
      () => fpsBedrijfsstandaardenTable.id,
      { onDelete: "set null" },
    ),
    taal: text("taal").notNull().default("nl"),
    actief: boolean("actief").notNull().default(false),
    aangemaaktOp: timestamp("aangemaakt_op", { withTimezone: true })
      .notNull()
      .defaultNow(),
    bijgewerktOp: timestamp("bijgewerkt_op", { withTimezone: true }),
  },
  (t) => [
    index("idx_fps_visuals_spot_type").using("gin", t.spotType),
    index("idx_fps_visuals_visual_type_actief").on(t.visualType, t.actief),
    check(
      "fps_visuals_bron_type_check",
      sql`${t.bronType} IN ('projecttekening','ETA','DoP','montagevoorschrift','fps_standaard','praktijkfoto','productblad')`,
    ),
  ],
);

export type FpsVisual = typeof fpsVisualsTable.$inferSelect;
export const insertFpsVisualSchema = createInsertSchema(fpsVisualsTable).omit({
  id: true,
  aangemaaktOp: true,
  bijgewerktOp: true,
});
export type InsertFpsVisual = z.infer<typeof insertFpsVisualSchema>;

// ── FPS VISUAL ANNOTATIES — AI-annotaties gescheiden van origineel ────────────
// Twee expliciete paden: origineel NOOIT overschreven, annotatie apart bestand.
// CHECK-constraint: originele_foto_path <> annotatie_path (harde DB-afbakening).

export const fpsVisualAnnotatiesTable = pgTable(
  "fps_visual_annotaties",
  {
    id: serial("id").primaryKey(),
    originaleFotoPath: text("originele_foto_path").notNull(),
    annotatiePath: text("annotatie_path").notNull(),
    context: text("context").notNull(),
    afwijkingStatus: text("afwijking_status").notNull(),
    bevindingen: text("bevindingen").array(),
    pimStapId: integer("pim_stap_id"),
    gegenereedDoorModel: text("gegenereerd_door_model"),
    gegenererdOp: timestamp("gegenereerd_op", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "fps_visual_annotaties_paden_check",
      sql`${t.originaleFotoPath} <> ${t.annotatiePath}`,
    ),
  ],
);

export type FpsVisualAnnotatie = typeof fpsVisualAnnotatiesTable.$inferSelect;
