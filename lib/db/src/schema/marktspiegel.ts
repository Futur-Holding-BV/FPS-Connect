// ── PRIJS_01 §8 — De marktspiegel ────────────────────────────────────────────
// Een achtergronddienst die, op aanvraag (NOOIT doorlopend — §8.2), voor een
// prijsafspraak, een financieel contract of een vrije vraag naar buiten kijkt:
// "dit betaal je, dit vraagt de markt". Twee harde regels (§8.3, §9):
//   - Elke vergelijking draagt verplicht een vindplaats (bron-URL) en datum.
//     Wat niet gevonden is blijft leeg — nooit geschat, nooit geïnterpoleerd.
//   - Het systeem adviseert NOOIT om over te stappen. Het doel is weten, niet
//     wisselen; de gebruikelijke vervolgstap is een gesprek met de bestaande
//     leverancier.
// Het onderzoek draait asynchroon (fire-and-forget): status bezig → klaar/fout.
import { pgTable, serial, text, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Vorm van het (gefilterde) resultaat dat de service in `resultaat` opslaat.
export type MarktspiegelVergelijking = {
  aanbieder: string;
  indicatie_prijs: string; // mag een bandbreedte zijn
  eenheid: string | null;
  vindplaats_url: string; // VERPLICHT — regels zonder URL worden weggegooid
  gevonden_op: string; // JJJJ-MM-DD
  toelichting: string | null;
};

export type MarktspiegelResultaat = {
  vergelijkingen: MarktspiegelVergelijking[];
  samenvatting: string;
};

export const marktspiegelOnderzoekenTable = pgTable("marktspiegel_onderzoeken", {
  id: serial("id").primaryKey(),
  // 'prijsafspraak' | 'financieel_contract' | 'vrij'
  onderwerpType: text("onderwerp_type").notNull(),
  onderwerpId: integer("onderwerp_id"),
  vraag: text("vraag").notNull(),
  // 'bezig' | 'klaar' | 'fout'
  status: text("status").notNull().default("bezig"),
  resultaat: jsonb("resultaat").$type<MarktspiegelResultaat>(),
  fout: text("fout"),
  aangevraagdDoor: integer("aangevraagd_door"),
  // 'afloop' | 'prijsverhoging' | 'handmatig'
  aanleiding: text("aanleiding").notNull().default("handmatig"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  klaarOp: timestamp("klaar_op"),
}, (t) => ({
  statusIdx: index("marktspiegel_onderzoeken_status_idx").on(t.status),
  onderwerpIdx: index("marktspiegel_onderzoeken_onderwerp_idx").on(t.onderwerpType, t.onderwerpId),
}));

export const insertMarktspiegelOnderzoekSchema = createInsertSchema(marktspiegelOnderzoekenTable).omit({
  id: true,
  aangemaaktOp: true,
});
export type InsertMarktspiegelOnderzoek = z.infer<typeof insertMarktspiegelOnderzoekSchema>;
export type MarktspiegelOnderzoek = typeof marktspiegelOnderzoekenTable.$inferSelect;
