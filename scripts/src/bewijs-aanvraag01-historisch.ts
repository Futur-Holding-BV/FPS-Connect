// AANVRAAG_01 — historische inbox-offertes bewijs
// Permanent read-only bewijsscript: telt en rapporteert bestaande offertes
// die via inbox_items binnengekomen zijn, en signaleert inconsistenties.
//
// NOOIT historische data wijzigen — uitsluitend SELECT.
// Draaien: pnpm --filter @workspace/scripts run bewijs-aanvraag01-historisch
// NB: vereist een toegepaste migratie 0128; pas na migratie draaien.
//
// Vereiste semantiek:
//  1. COUNT(DISTINCT offertes.id) via join inbox_items→offertes
//     (document_categorie='offerte_aanvraag' + gekoppelde_entiteit_type='offerte').
//  2. Vergelijk aanvraag_planningen ook via offerte_id waar beschikbaar.
//  3. Rapporteer: (a) inbox-offerterelatie zonder planning,
//                 (b) planning zonder inbox_item,
//                 (c) meerdere inbox_items per offerte.
// Alle queries zijn robuust bij lege tabellen (SQL aggregatie, geen JS-array-joins).

import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

async function main(): Promise<void> {
  console.log(`\n═══ AANVRAAG_01-HISTORISCH ─── bewijs-rapport (alleen-lezen) ═══\n`);

  // ── 1. COUNT(DISTINCT offertes.id) via join inbox_items → offertes ─────────
  const [telRij] = (await db.execute(sql`
    SELECT
      COUNT(DISTINCT o.id)                       AS distinct_offertes,
      COUNT(*)                                    AS inbox_offerte_relaties
    FROM inbox_items ii
    JOIN offertes o
      ON o.id = ii.gekoppelde_entiteit_id
    WHERE ii.document_categorie = 'offerte_aanvraag'
      AND ii.gekoppelde_entiteit_type = 'offerte'
  `)).rows as Array<{ distinct_offertes: number; inbox_offerte_relaties: number }>;

  console.log(`1. Historische offerte-aanvragen via inbox`);
  console.log(`   inbox_items(offerte_aanvraag → offerte)-relaties: ${telRij?.inbox_offerte_relaties ?? 0}`);
  console.log(`   DISTINCT bestaande offertes:                      ${telRij?.distinct_offertes ?? 0}`);

  // ── 2. Vergelijk aanvraag_planningen ── zowel via offerte_id als inbox_item_id ─
  const [planTel] = (await db.execute(sql`
    SELECT
      COUNT(*)                                             AS planningen_totaal,
      COUNT(*) FILTER (WHERE offerte_id IS NOT NULL)       AS planningen_met_offerte_id,
      COUNT(*) FILTER (WHERE inbox_item_id IS NOT NULL)    AS planningen_met_inbox_item_id
    FROM aanvraag_planningen
  `)).rows as Array<{ planningen_totaal: number; planningen_met_offerte_id: number; planningen_met_inbox_item_id: number }>;

  console.log(`\n2. Aanvraag_planningen`);
  console.log(`   Totaal:                    ${planTel?.planningen_totaal ?? 0}`);
  console.log(`   Met offerte_id:            ${planTel?.planningen_met_offerte_id ?? 0}`);
  console.log(`   Met inbox_item_id:         ${planTel?.planningen_met_inbox_item_id ?? 0}`);

  // ── 3a. Inbox-offerterelatie ZONDER planning ────────────────────────────────
  // Een inbox-item (offerte_aanvraag → offerte) waarvoor GEEN aanvraag_planning bestaat,
  // niet via inbox_item_id en niet via offerte_id.
  const zonderPlanning = (await db.execute(sql`
    SELECT ii.id AS inbox_item_id, ii.gekoppelde_entiteit_id AS offerte_id
    FROM inbox_items ii
    JOIN offertes o ON o.id = ii.gekoppelde_entiteit_id
    WHERE ii.document_categorie = 'offerte_aanvraag'
      AND ii.gekoppelde_entiteit_type = 'offerte'
      AND NOT EXISTS (
        SELECT 1 FROM aanvraag_planningen ap
        WHERE ap.inbox_item_id = ii.id
           OR ap.offerte_id = ii.gekoppelde_entiteit_id
      )
    ORDER BY ii.id
  `)).rows as Array<{ inbox_item_id: number; offerte_id: number }>;

  console.log(`\n3a. Inbox-offerterelaties ZONDER planning: ${zonderPlanning.length}`);
  for (const r of zonderPlanning.slice(0, 50)) {
    console.log(`    ⚠ inbox_item #${r.inbox_item_id} → offerte #${r.offerte_id}`);
  }
  if (zonderPlanning.length > 50) console.log(`    … en nog ${zonderPlanning.length - 50} meer`);

  // ── 3b. Planning ZONDER inbox_item ──────────────────────────────────────────
  // Wees-planningen: inbox_item_id is null OF verwijst naar een niet-bestaand inbox_item.
  const planningZonderInbox = (await db.execute(sql`
    SELECT ap.id AS planning_id, ap.inbox_item_id, ap.offerte_id
    FROM aanvraag_planningen ap
    WHERE ap.inbox_item_id IS NULL
       OR NOT EXISTS (
         SELECT 1 FROM inbox_items ii WHERE ii.id = ap.inbox_item_id
       )
    ORDER BY ap.id
  `)).rows as Array<{ planning_id: number; inbox_item_id: number | null; offerte_id: number | null }>;

  console.log(`\n3b. Planningen ZONDER (geldig) inbox_item: ${planningZonderInbox.length}`);
  for (const r of planningZonderInbox.slice(0, 50)) {
    console.log(`    ⚠ planning #${r.planning_id} (inbox_item_id=${r.inbox_item_id ?? "null"}, offerte_id=${r.offerte_id ?? "null"})`);
  }
  if (planningZonderInbox.length > 50) console.log(`    … en nog ${planningZonderInbox.length - 50} meer`);

  // ── 3c. Meerdere inbox_items per offerte ────────────────────────────────────
  const dubbelePerOfferte = (await db.execute(sql`
    SELECT ii.gekoppelde_entiteit_id AS offerte_id, COUNT(*) AS aantal
    FROM inbox_items ii
    JOIN offertes o ON o.id = ii.gekoppelde_entiteit_id
    WHERE ii.document_categorie = 'offerte_aanvraag'
      AND ii.gekoppelde_entiteit_type = 'offerte'
    GROUP BY ii.gekoppelde_entiteit_id
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC, ii.gekoppelde_entiteit_id
  `)).rows as Array<{ offerte_id: number; aantal: number }>;

  console.log(`\n3c. Offertes met MEERDERE inbox_items: ${dubbelePerOfferte.length}`);
  for (const r of dubbelePerOfferte.slice(0, 50)) {
    console.log(`    ⚠ offerte #${r.offerte_id}: ${r.aantal} inbox_items`);
  }
  if (dubbelePerOfferte.length > 50) console.log(`    … en nog ${dubbelePerOfferte.length - 50} meer`);

  // ── Samenvatting ────────────────────────────────────────────────────────────
  console.log(`\n═══ Samenvatting ═══`);
  console.log(`  DISTINCT offertes via inbox:            ${telRij?.distinct_offertes ?? 0}`);
  console.log(`  Inbox-offerterelaties:                  ${telRij?.inbox_offerte_relaties ?? 0}`);
  console.log(`  Relaties zonder planning:               ${zonderPlanning.length}`);
  console.log(`  Planningen zonder (geldig) inbox_item:  ${planningZonderInbox.length}`);
  console.log(`  Offertes met meerdere inbox_items:      ${dubbelePerOfferte.length}`);
  console.log(`\nScript voltooid. GEEN wijzigingen aangebracht.`);
}

main().catch((err) => {
  console.error("Script fout:", err);
  process.exit(1);
});
