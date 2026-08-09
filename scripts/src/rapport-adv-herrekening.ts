// UREN_01 §3.4 — herrekeningsrapport ADV. Rapporteert hoeveel bestaande
// weekstaten onder de nieuwe ADV-regel (min(max, max(0, gewerkt − drempel)))
// een ANDER ADV-saldo zouden krijgen en wat het totale urenverschil is.
// PAST NIETS AAN — René besluit op basis van dit rapport.
import { db } from "@workspace/db";
import { weekStatenTable, medewerkersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const CAO = [
  { naam: "Metaal & Techniek", drempel: 38, max: 2 },
  { naam: "Bouw & Infra", drempel: 40, max: 0 },
  { naam: "Geen CAO / individueel", drempel: 40, max: 0 },
];

function nieuweAdv(cao: string | null, dienstverband: string, gewerkt: number): number {
  const c = CAO.find((x) => x.naam === cao);
  if (!c || c.max <= 0 || dienstverband !== "vast") return 0;
  return Math.round(Math.min(c.max, Math.max(0, gewerkt - c.drempel)) * 100) / 100;
}

async function main() {
  const rijen = await db
    .select({
      id: weekStatenTable.id,
      jaar: weekStatenTable.jaar,
      week: weekStatenTable.weekNummer,
      totaal: weekStatenTable.totaalUren,
      adv: weekStatenTable.advUren,
      naam: medewerkersTable.naam,
      cao: medewerkersTable.cao,
      dienstverband: medewerkersTable.dienstverband,
    })
    .from(weekStatenTable)
    .innerJoin(medewerkersTable, eq(weekStatenTable.medewerkerId, medewerkersTable.id));

  let anders = 0;
  let verschilTotaal = 0;
  const details: string[] = [];
  for (const r of rijen) {
    const oud = r.adv ?? 0;
    const nieuw = nieuweAdv(r.cao, r.dienstverband, r.totaal ?? 0);
    const diff = Math.round((nieuw - oud) * 100) / 100;
    if (Math.abs(diff) > 1e-9) {
      anders++;
      verschilTotaal += diff;
      details.push(`  weekstaat #${r.id} ${r.naam} ${r.jaar}-w${r.week}: gewerkt ${r.totaal ?? 0}u, ADV oud ${oud} → nieuw ${nieuw} (${diff > 0 ? "+" : ""}${diff}u)`);
    }
  }
  console.log(`ADV-herrekeningsrapport (${new Date().toISOString().slice(0, 10)})`);
  console.log(`Weekstaten totaal: ${rijen.length}`);
  console.log(`Weekstaten met ander ADV-saldo onder de nieuwe regel: ${anders}`);
  console.log(`Totaal urenverschil: ${Math.round(verschilTotaal * 100) / 100}u`);
  if (details.length) console.log(details.join("\n"));
  console.log("Er is NIETS aangepast — dit is uitsluitend een rapport.");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
