// REGISTER_01 zelf ook in het register (opdracht kwam via chat, niet uit een
// attached_assets-bestand — het vulscript kan 'm dus niet vinden).
import { db, acceptatieRegisterTable } from "@workspace/db";
import { sql } from "drizzle-orm";

const punten: { nr: number; oms: string; stand: string; bewijs: string }[] = [
  { nr: 1, oms: "Register bestaat met vier standen (gehaald, niet_gebouwd, onbewezen, wacht_op_rene) en is gevuld uit de Acceptatie-paragrafen van alle opdrachten in attached_assets", stand: "gehaald", bewijs: "migratie 0093 + scripts/src/vul-acceptatieregister.ts (52 opdrachten, 433 punten)" },
  { nr: 2, oms: "Elke stand is beoordeeld: gehaald alleen bij aantoonbaar bewijs, anders onbewezen/niet_gebouwd/wacht_op_rene (fail-closed)", stand: "gehaald", bewijs: "beoordeling via codebase-analyse, toegepast met scripts/src/pas-beoordelingen-toe.ts" },
  { nr: 3, oms: "Register zichtbaar in Connect voor de hoofdbeheerder, gegroepeerd per opdracht met teller niet-gehaald bovenaan en inline stand-bewerking", stand: "gehaald", bewijs: "pagina /beheer/acceptatieregister + GET/PATCH /api/acceptatieregister (hoofdbeheerder)" },
  { nr: 4, oms: "Bouwcontrole faalt bij oplevering zonder bijgewerkte registerregels; opdracht met onbewezen/niet_gebouwd punten is hoogstens deels opgeleverd", stand: "gehaald", bewijs: "scripts/src/oplever-check.ts + registercontrole in kwaliteitscheck.ts" },
  { nr: 5, oms: "Statusrapport docs/status/STATUS_<datum>.md wordt gegenereerd uit het register in plaats van handmatig geschreven", stand: "gehaald", bewijs: "scripts/src/genereer-statusrapport.ts → docs/status/STATUS_2026-08-19.md" },
];

for (const p of punten) {
  await db
    .insert(acceptatieRegisterTable)
    .values({
      opdrachtCode: "REGISTER_01",
      puntNummer: p.nr,
      omschrijving: p.oms,
      stand: p.stand,
      bewijsVindplaats: p.bewijs,
      bronBestand: "chat-opdracht 2026-08-19",
    })
    .onConflictDoUpdate({
      target: [acceptatieRegisterTable.opdrachtCode, acceptatieRegisterTable.puntNummer],
      set: { omschrijving: p.oms, stand: p.stand, bewijsVindplaats: p.bewijs, bijgewerktOp: sql`now()` },
    });
}
console.log(`REGISTER_01: ${punten.length} punten vastgelegd.`);
process.exit(0);
