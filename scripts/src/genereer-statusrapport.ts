/**
 * REGISTER_01 Fase 3 — genereert het statusrapport uit het acceptatieregister.
 *
 * Vervangt het handgeschreven statusrapport: docs/status/STATUS_<datum>.md
 * wordt opgebouwd uit de werkelijke registerstanden (GEMETEN, niet vermoed).
 *
 * Gebruik: tsx src/genereer-statusrapport.ts
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { db, acceptatieRegisterTable } from "@workspace/db";
import { asc } from "drizzle-orm";

const punten = await db
  .select()
  .from(acceptatieRegisterTable)
  .orderBy(asc(acceptatieRegisterTable.opdrachtCode), asc(acceptatieRegisterTable.puntNummer));

const perCode = new Map<string, typeof punten>();
for (const p of punten) {
  const l = perCode.get(p.opdrachtCode) ?? [];
  l.push(p);
  perCode.set(p.opdrachtCode, l);
}

const datum = new Date().toISOString().slice(0, 10);
const totalen = { gehaald: 0, niet_gebouwd: 0, onbewezen: 0, wacht_op_rene: 0 } as Record<string, number>;
for (const p of punten) totalen[p.stand] = (totalen[p.stand] ?? 0) + 1;

function oordeel(l: typeof punten): string {
  // Fail-closed: alles wat niet expliciet gehaald of wacht_op_rene is, is open.
  const open = l.filter((p) => p.stand !== "gehaald" && p.stand !== "wacht_op_rene").length;
  const wacht = l.filter((p) => p.stand === "wacht_op_rene").length;
  if (open === 0 && wacht === 0) return "Opgeleverd";
  if (open === 0) return "Opgeleverd — wacht op René";
  if (open === l.length) return "Niet opgeleverd";
  return "Deels opgeleverd";
}

const regels: string[] = [];
regels.push(`# Statusrapport FPS Connect — ${datum}`);
regels.push("");
regels.push("> Gegenereerd uit het acceptatieregister (REGISTER_01) met `scripts/src/genereer-statusrapport.ts`.");
regels.push("> Elke stand is GEMETEN per acceptatiepunt; dit rapport niet handmatig bewerken.");
regels.push("");
regels.push("## Deel 1 — Totaalbeeld");
regels.push("");
regels.push(`| Stand | Aantal |`);
regels.push(`| --- | ---: |`);
regels.push(`| Gehaald | ${totalen.gehaald ?? 0} |`);
regels.push(`| Gebouwd, onbewezen | ${totalen.onbewezen ?? 0} |`);
regels.push(`| Niet gebouwd | ${totalen.niet_gebouwd ?? 0} |`);
regels.push(`| Wacht op René | ${totalen.wacht_op_rene ?? 0} |`);
regels.push(`| **Totaal** | **${punten.length}** |`);
regels.push("");
regels.push("## Deel 2 — Per opdracht");
regels.push("");
regels.push("| Opdracht | Punten | Gehaald | Onbewezen | Niet gebouwd | Wacht op René | Oordeel |");
regels.push("| --- | ---: | ---: | ---: | ---: | ---: | --- |");
for (const [code, l] of [...perCode.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const t = (s: string) => l.filter((p) => p.stand === s).length;
  regels.push(`| ${code} | ${l.length} | ${t("gehaald")} | ${t("onbewezen")} | ${t("niet_gebouwd")} | ${t("wacht_op_rene")} | ${oordeel(l)} |`);
}
regels.push("");
regels.push("## Deel 3 — Openstaande punten (niet gebouwd of onbewezen)");
regels.push("");
for (const [code, l] of [...perCode.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const open = l.filter((p) => p.stand !== "gehaald" && p.stand !== "wacht_op_rene");
  if (open.length === 0) continue;
  regels.push(`### ${code}`);
  for (const p of open) {
    regels.push(`- ${p.puntNummer}. [${p.stand}] ${p.omschrijving}${p.toelichting ? ` — _${p.toelichting}_` : ""}`);
  }
  regels.push("");
}
regels.push("## Deel 4 — Punten die op René wachten");
regels.push("");
for (const [code, l] of [...perCode.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const wacht = l.filter((p) => p.stand === "wacht_op_rene");
  for (const p of wacht) {
    regels.push(`- **${code}** ${p.puntNummer}. ${p.omschrijving}${p.toelichting ? ` — _${p.toelichting}_` : ""}`);
  }
}
regels.push("");

const doel = path.resolve(process.cwd(), "..", "docs", "status", `STATUS_${datum}.md`);
writeFileSync(doel, regels.join("\n"));
console.log(`Geschreven: ${doel} (${punten.length} punten, ${perCode.size} opdrachten)`);
process.exit(0);
