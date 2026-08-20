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

const datum = new Date().toISOString().slice(0, 10);
const totalen = { gehaald: 0, niet_gebouwd: 0, onbewezen: 0, wacht_op_rene: 0 } as Record<string, number>;
for (const p of punten) totalen[p.stand] = (totalen[p.stand] ?? 0) + 1;
const ochtend = { gehaald: 209, niet_gebouwd: 23, onbewezen: 190, wacht_op_rene: 16 } as const;
const delta = (stand: keyof typeof ochtend) => {
  const verschil = (totalen[stand] ?? 0) - ochtend[stand];
  return `${verschil >= 0 ? "+" : ""}${verschil}`;
};

const regels: string[] = [];
regels.push(`# Statusrapport FPS Connect — ${datum}`);
regels.push("");
regels.push("> Gegenereerd uit het acceptatieregister (REGISTER_01) met `scripts/src/genereer-statusrapport.ts`.");
regels.push("> GEMETEN na de volledige herbeoordeling; verschil ten opzichte van de ochtendmeting 209/23/190/16.");
regels.push("");
regels.push("| Stand | Nieuwe verdeling | Verschil sinds ochtendmeting |");
regels.push("| --- | ---: | ---: |");
regels.push(`| Gehaald | ${totalen.gehaald ?? 0} | ${delta("gehaald")} |`);
regels.push(`| Niet gebouwd | ${totalen.niet_gebouwd ?? 0} | ${delta("niet_gebouwd")} |`);
regels.push(`| Onbewezen | ${totalen.onbewezen ?? 0} | ${delta("onbewezen")} |`);
regels.push(`| Wacht op René | ${totalen.wacht_op_rene ?? 0} | ${delta("wacht_op_rene")} |`);
regels.push("");

const doel = path.resolve(process.cwd(), "..", "docs", "status", `STATUS_${datum}.md`);
writeFileSync(doel, regels.join("\n"));
console.log(`Geschreven: ${doel} (${punten.length} punten)`);
process.exit(0);
