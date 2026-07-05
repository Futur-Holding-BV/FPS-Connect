import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { pimUitvoeringStappenTable } from "./pim";
import { fpsVisualsTable } from "./visuals";

// ── VISUAL GUIDANCE ENGINE (VGE) ─────────────────────────────────────────────
// Ontwerp: docs/ai-visual-guidance-framework.md
//
// Grondbeginselen (harde regels die in alle code moeten worden gehandhaafd):
//  - AI selecteert uit bestaande visuals, verzint nooit technische specificaties
//  - Originele monteur-foto's worden NOOIT overschreven (annotatie is aparte laag)
//  - Een visual zonder geldig bron_type wordt nooit getoond
//  - vge_effectiviteitslog schrijft NOOIT naar productspecificatietabellen

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
