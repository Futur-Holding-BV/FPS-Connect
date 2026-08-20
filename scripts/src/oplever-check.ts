/**
 * REGISTER_01 Fase 2 — bouwcontrole bij oplevering van een opdracht.
 *
 * Gebruik: tsx src/oplever-check.ts <OPDRACHTCODE> [...meer codes]
 *
 * Faalt (exit 1) wanneer:
 * - de opdracht geen regels in het acceptatieregister heeft;
 * - er punten zijn die niet "gehaald" of "wacht_op_rene" zijn (fail-closed:
 *   ook onbekende standen tellen als open; opdracht is dan hoogstens
 *   "deels opgeleverd" — de openstaande punten worden getoond);
 * - ook maar één registerregel vandaag niet is bijgewerkt (oplevering
 *   vereist dat élk punt vandaag herbeoordeeld is).
 * "wacht_op_rene" blokkeert niet, maar wordt wel gemeld.
 */
import { db, acceptatieRegisterTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const codes = process.argv.slice(2).filter((a) => !a.startsWith("-"));
if (codes.length === 0) {
  console.error("Gebruik: tsx src/oplever-check.ts <OPDRACHTCODE> [...meer]");
  process.exit(1);
}

let fout = false;
const vandaag = new Date().toISOString().slice(0, 10);

for (const code of codes) {
  const punten = await db
    .select()
    .from(acceptatieRegisterTable)
    .where(eq(acceptatieRegisterTable.opdrachtCode, code));
  console.log(`\n== ${code} (${punten.length} punten) ==`);
  if (punten.length === 0) {
    console.error(`FOUT: geen acceptatiepunten in het register voor ${code} — eerst vullen (vul-acceptatieregister.ts of handmatig).`);
    fout = true;
    continue;
  }
  // Fail-closed: alles wat niet expliciet gehaald of wacht_op_rene is, telt als open.
  const open = punten.filter((p) => p.stand !== "gehaald" && p.stand !== "wacht_op_rene");
  const wacht = punten.filter((p) => p.stand === "wacht_op_rene");
  const nietBijgewerkt = punten.filter((p) => p.beoordeeldOp.toISOString().slice(0, 10) !== vandaag);
  const verouderdBewijs = punten.filter(
    (p) => p.stand === "gehaald" && p.bronDatum.getTime() < p.laatsteCodeWijzigingOp.getTime(),
  );
  let codeFout = false;
  for (const p of open) {
    console.error(`  OPEN  ${p.puntNummer}. [${p.stand}] ${p.omschrijving.slice(0, 100)}`);
  }
  for (const p of wacht) {
    console.log(`  WACHT ${p.puntNummer}. [wacht_op_rene] ${p.omschrijving.slice(0, 100)}`);
  }
  if (open.length > 0) {
    console.error(`FOUT: ${code} is hoogstens DEELS opgeleverd — ${open.length} punt(en) niet gehaald.`);
    codeFout = true;
  }
  if (nietBijgewerkt.length > 0) {
    console.error(`FOUT: ${nietBijgewerkt.length} registerregel(s) van ${code} zijn vandaag niet beoordeeld (punt ${nietBijgewerkt.map((p) => p.puntNummer).join(", ")}) — herbeoordeel élk punt bij oplevering.`);
    codeFout = true;
  }
  if (verouderdBewijs.length > 0) {
    console.error(`FOUT: ${verouderdBewijs.length} gehaald punt(en) hebben bewijs van vóór de laatste relevante codewijziging (punt ${verouderdBewijs.map((p) => p.puntNummer).join(", ")}) — voer een nieuwe meting uit.`);
    codeFout = true;
  }
  if (codeFout) {
    fout = true;
  } else {
    console.log(`OK: alle bouwbare punten van ${code} zijn gehaald met actueel bewijs en vandaag herbeoordeeld${wacht.length ? ` (${wacht.length} wachten op René)` : ""}.`);
  }
}

process.exit(fout ? 1 : 0);
