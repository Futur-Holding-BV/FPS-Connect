import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { artikelenTable } from "./artikelen";
import { fpsBedrijfsstandaardenTable } from "./kb";
import { pimUitvoeringStappenTable } from "./pim";

// ── VISUAL GUIDANCE ENGINE (VGE) ─────────────────────────────────────────────
// Ontwerp: docs/ai-visual-guidance-framework.md
//
// Grondbeginselen (harde regels die in alle code moeten worden gehandhaafd):
//  - AI selecteert uit bestaande visuals, verzint nooit technische specificaties
//  - Originele monteur-foto's worden NOOIT overschreven (annotatie is aparte laag)
//  - Een visual zonder geldig bron_type wordt nooit getoond
//  - vge_effectiviteitslog schrijft NOOIT naar productspecificatietabellen

// ── fps_visuals ───────────────────────────────────────────────────────────────
// Centrale opslag van alle goedgekeurde visuals.
// actief=false (default) — beheerder moet expliciet activeren voor VGE.
export const fpsVisualsTable = pgTable(
  "fps_visuals",
  {
    id: serial("id").primaryKey(),
    naam: text("naam").notNull(),
    // detailtekening | projecttekening_uitsnede | referentiefoto | exploded_view
    // animatie | checklist | productblad | montagevoorschrift | schema | 3d_weergave
    visualType: text("visual_type").notNull(),
    // VERPLICHT — projecttekening | ETA | DoP | montagevoorschrift | fps_standaard
    //             | praktijkfoto | productblad
    bronType: text("bron_type").notNull(),
    bronReferentie: text("bron_referentie"),
    objectPath: text("object_path").notNull(),
    thumbnailPath: text("thumbnail_path"),
    // Toepasselijke spot-types, bijv. ['branddeur','doorvoering']
    spotType: text("spot_type").array().notNull().default([]),
    artikelId: integer("artikel_id").references(() => artikelenTable.id, {
      onDelete: "set null",
    }),
    bedrijfsstandaardId: integer("bedrijfsstandaard_id").references(
      () => fpsBedrijfsstandaardenTable.id,
      { onDelete: "set null" },
    ),
    taal: text("taal").notNull().default("nl"),
    // Beheerder zet actief=true na review — VGE toont nooit actief=false visuals
    actief: boolean("actief").notNull().default(false),
    aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
    bijgewerktOp: timestamp("bijgewerkt_op"),
  },
  (t) => [
    index("idx_fps_visuals_visual_type").on(t.visualType),
    index("idx_fps_visuals_actief").on(t.actief),
    index("idx_fps_visuals_spot_type").on(t.spotType),
  ],
);

export type FpsVisual = typeof fpsVisualsTable.$inferSelect;

// ── fps_visual_annotaties ─────────────────────────────────────────────────────
// AI-gegenereerde annotaties — ALTIJD gescheiden van het origineel.
// DB CHECK (originele_foto_path <> annotatie_path) — twee expliciete paden.
export const fpsVisualAnnotatiesTable = pgTable("fps_visual_annotaties", {
  id: serial("id").primaryKey(),
  // Object storage pad originele foto — NOOIT overschreven
  originaleFotoPath: text("originele_foto_path").notNull(),
  // Object storage pad annotatie-laag — apart bestand
  annotatiePath: text("annotatie_path").notNull(),
  // kwaliteitscontrole | afwijkingsmarkering | instructie
  context: text("context").notNull(),
  // akkoord | aandacht_vereist | herstel_nodig
  afwijkingStatus: text("afwijking_status").notNull(),
  bevindingen: text("bevindingen").array(),
  pimStapId: integer("pim_stap_id").references(
    () => pimUitvoeringStappenTable.id,
    { onDelete: "set null" },
  ),
  gegenereersDoorModel: text("gegenereerd_door_model"),
  gegenereersdOp: timestamp("gegenereerd_op").notNull().defaultNow(),
});

export type FpsVisualAnnotatie = typeof fpsVisualAnnotatiesTable.$inferSelect;

// ── vge_effectiviteitslog ─────────────────────────────────────────────────────
// Leerlaag voor visual-selectie. Schrijft NOOIT naar productspecificatietabellen.
export const vgeEffectiviteitslogTable = pgTable(
  "vge_effectiviteitslog",
  {
    id: serial("id").primaryKey(),
    visualId: integer("visual_id")
      .notNull()
      .references(() => fpsVisualsTable.id, { onDelete: "cascade" }),
    pimStapId: integer("pim_stap_id")
      .notNull()
      .references(() => pimUitvoeringStappenTable.id, { onDelete: "cascade" }),
    // voorbereiding | montage | controle | foto
    stapType: text("stap_type").notNull(),
    spotType: text("spot_type").notNull(),
    herstelwerkNodig: boolean("herstelwerk_nodig").notNull(),
    stapDuurSeconden: integer("stap_duur_seconden"),
    monteurVraagGesteld: boolean("monteur_vraag_gesteld")
      .notNull()
      .default(false),
    // akkoord | aandacht | herstel
    kwaliteitResultaat: text("kwaliteit_resultaat"),
    aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  },
  (t) => [
    index("idx_vge_log_visual_spot_stap").on(
      t.visualId,
      t.spotType,
      t.stapType,
    ),
  ],
);

export type VgeEffectiviteitslogEntry =
  typeof vgeEffectiviteitslogTable.$inferSelect;
