import { pgTable, serial, text, integer, timestamp, boolean, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { gebruikersTable } from "./gebruikers";

// WERKBAK_01 — één werkbak per persoon: alles wat een handeling of aandacht
// vraagt landt hier, ongeacht de module. De bestaande signaal-/meldingtabellen
// blijven de detailbron; zij (of de bewakingsloop) schrijven een verwijzing
// hierheen. Een item verdwijnt NOOIT vanzelf: alleen door afhandelen of bewust
// wegzetten met reden. Bron-reconciliatie (bron is opgelost → item afgehandeld
// door "systeem") telt als afhandeling, niet als uitdoven.
export const werkbakItemsTable = pgTable(
  "werkbak_items",
  {
    id: serial("id").primaryKey(),
    // "doen" = er wordt een beslissing/handeling gevraagd; "weten" = aandacht.
    soort: text("soort").notNull(),
    // Bron uit de vaste lijst (§5 WERKBAK_01). Niets erin buiten die lijst om.
    bron: text("bron").notNull(),
    titel: text("titel").notNull(),
    // Waarom nu — nooit medische informatie (§4 HRM_01 geldt ook hier).
    omschrijving: text("omschrijving"),
    // Doelgroep: specifiek persoon en/of bevoegdheid en/of alleen-hoofdbeheerder.
    // Zichtbaar = (gebruikerId == ik) OF (gebruikerId null EN bevoegdheid-match).
    gebruikerId: integer("gebruiker_id").references(() => gebruikersTable.id, { onDelete: "cascade" }),
    vereisteModule: text("vereiste_module"),
    vereistNiveau: integer("vereist_niveau"),
    alleenHoofdbeheerder: boolean("alleen_hoofdbeheerder").notNull().default(false),
    // Rangschikking op consequentie (hoger = eerder). Bedrag/termijn meegewogen.
    gewicht: integer("gewicht").notNull().default(0),
    // Deep-link naar het item zelf (niet het moduleoverzicht).
    actiePad: text("actie_pad"),
    // Inline afhandelbare actie ("verlof_beoordelen" | "goedkeuring_beslissen" | null)
    actieType: text("actie_type"),
    // Herkomst: module + object.
    herkomstType: text("herkomst_type").notNull(),
    herkomstId: integer("herkomst_id"),
    // Idempotentie: één open item per sleutel (partiële unieke index).
    dedupSleutel: text("dedup_sleutel").notNull(),
    // open | afgehandeld | weggezet
    status: text("status").notNull().default("open"),
    afgehandeldDoorId: integer("afgehandeld_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
    afgehandeldOp: timestamp("afgehandeld_op"),
    weggezetReden: text("weggezet_reden"),
    aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
    bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("werkbak_items_open_dedup_uq").on(t.dedupSleutel).where(sql`status = 'open'`),
    index("werkbak_items_status_idx").on(t.status),
    index("werkbak_items_gebruiker_idx").on(t.gebruikerId),
  ],
);

// Logboek van bewakingsdraaien: elke draai wordt vastgelegd, zodat achteraf
// vaststaat dát hij gedraaid heeft. Een stille bewaking die stopt is erger dan
// geen bewaking — het uitblijven van een draai is zelf een werkbak-item.
export const bewakingDraaienTable = pgTable("bewaking_draaien", {
  id: serial("id").primaryKey(),
  gestartOp: timestamp("gestart_op").notNull().defaultNow(),
  klaarOp: timestamp("klaar_op"),
  // bezig | klaar | fout
  status: text("status").notNull().default("bezig"),
  // Per voeder: { naam: { items: n, fout?: string } }
  samenvatting: jsonb("samenvatting"),
  fout: text("fout"),
});

export type WerkbakItem = typeof werkbakItemsTable.$inferSelect;
export type BewakingDraai = typeof bewakingDraaienTable.$inferSelect;
