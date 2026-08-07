// Schema-drift-check (SCHEMA_01 §2.5) — vergelijkt de live database met de
// vastgelegde verwachting in lib/db/schema-verwachting.txt en meldt verschillen.
//
// De verwachting is een genormaliseerde, volgorde-onafhankelijke lijst:
//   KOLOM|tabel|kolom|datatype|nullable|default
//   INDEX|tabel|indexnaam
// gegenereerd uit de productiedatabase (nulpunt 7 aug 2026) plus de sindsdien
// via migraties toegevoegde objecten. Bij elke nieuwe migratie hoort dit
// bestand mee te veranderen: draai dit script met --update tegen een database
// waarop alle migraties zijn toegepast.
//
// Standaard is drift NIET fataal (exit 0, wel luid gemeld); zet
// SCHEMA_DRIFT_FATAAL=1 om bij drift met exit 1 te stoppen.

import pg from "pg";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const { Pool } = pg;
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[drift-check] DATABASE_URL ontbreekt; stoppen.");
  process.exit(1);
}
const VERWACHTING = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../schema-verwachting.txt");
const update = process.argv.includes("--update");

const pool = new Pool({ connectionString: url });

async function leesLive() {
  const kolommen = await pool.query(`
    SELECT 'KOLOM|'||table_name||'|'||column_name||'|'||data_type||'|'||is_nullable||'|'||COALESCE(column_default,'') AS r
      FROM information_schema.columns WHERE table_schema='public'
  `);
  const indexen = await pool.query(`
    SELECT 'INDEX|'||tablename||'|'||indexname AS r FROM pg_indexes WHERE schemaname='public'
  `);
  return [...kolommen.rows, ...indexen.rows].map((x) => x.r).sort();
}

async function main() {
  const live = await leesLive();
  if (update) {
    writeFileSync(VERWACHTING, live.join("\n") + "\n");
    console.log(`[drift-check] Verwachting bijgewerkt: ${live.length} regels → ${VERWACHTING}`);
    return;
  }
  const verwacht = readFileSync(VERWACHTING, "utf8").split("\n").filter(Boolean).sort();
  const liveSet = new Set(live);
  const verwachtSet = new Set(verwacht);
  const ontbreekt = verwacht.filter((r) => !liveSet.has(r));   // in verwachting, niet live
  const extra = live.filter((r) => !verwachtSet.has(r));       // live, niet in verwachting

  if (ontbreekt.length === 0 && extra.length === 0) {
    console.log(`[drift-check] Geen drift: database komt overeen met schema-verwachting (${live.length} objecten).`);
    return;
  }
  console.warn(`[drift-check] DRIFT GEVONDEN — ${ontbreekt.length} ontbrekend in database, ${extra.length} onverwacht aanwezig:`);
  for (const r of ontbreekt) console.warn(`  ONTBREEKT IN DB : ${r}`);
  for (const r of extra) console.warn(`  ONVERWACHT IN DB: ${r}`);
  console.warn("[drift-check] Ontbrekende kolommen zijn precies het faalpatroon van eerdere productie-uitval — onderzoek vóór livegang.");
  if (process.env.SCHEMA_DRIFT_FATAAL === "1") process.exit(1);
}

main()
  .catch((err) => {
    console.error("[drift-check] Onverwachte fout:", err);
    process.exit(1);
  })
  .finally(() => pool.end());
