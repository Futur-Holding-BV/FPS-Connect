// VORM_01 herbewijs — vult de dev-database met representatieve spots voor het
// e2e-monteursaccount, zodat het bewijsscherm app/mijn-werk.tsx met échte
// rijen, statussen en secties kan worden afgebeeld (eis René 10-08).
//
// Idempotent: spots zijn herkenbaar aan objectnummer-prefix "VORM01-" en
// worden bij elke run eerst opgeruimd. MODUS=weg ruimt alleen op.
//
// Draaien: pnpm --filter @workspace/scripts exec tsx src/vorm01-testdata.ts
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

import { setupE2eAccount } from "./e2e-monteur-testaccount";

const ALLEEN_OPRUIMEN = process.env["MODUS"] === "weg";

async function zorgVoorVerdieping(gebouwId: number, naam: string): Promise<number> {
  const bestaand = (
    await db.execute(sql`SELECT id FROM verdiepingen WHERE gebouw_id = ${gebouwId} AND naam = ${naam} LIMIT 1`)
  ).rows as { id: number }[];
  if (bestaand[0]) return bestaand[0].id;
  const nieuw = (
    await db.execute(sql`INSERT INTO verdiepingen (gebouw_id, naam) VALUES (${gebouwId}, ${naam}) RETURNING id`)
  ).rows as { id: number }[];
  return nieuw[0]!.id;
}

async function main(): Promise<void> {
  await db.execute(sql`DELETE FROM voorzieningen WHERE objectnummer LIKE 'VORM01-%'`);
  if (ALLEEN_OPRUIMEN) {
    console.log("VORM01-testspots opgeruimd.");
    return;
  }

  const monteurId = await setupE2eAccount();

  // Twee gebouwen zodat het scherm meerdere secties toont.
  const colosseum = 13;
  const testgebouw = 14;
  const colosseumBg = await zorgVoorVerdieping(colosseum, "Begane grond");
  const colosseumV1 = await zorgVoorVerdieping(colosseum, "1e verdieping");
  const testgebouwBg = await zorgVoorVerdieping(testgebouw, "Begane grond");

  const spots: Array<{
    nr: string;
    type: string;
    status: string;
    ruimte: string;
    verdieping: number;
    gebouw: number;
  }> = [
    { nr: "VORM01-001", type: "brandklep", status: "geplaatst", ruimte: "Technische ruimte 0.12", verdieping: colosseumBg, gebouw: colosseum },
    { nr: "VORM01-002", type: "doorvoer", status: "afgekeurd", ruimte: "Gang 0.03", verdieping: colosseumBg, gebouw: colosseum },
    { nr: "VORM01-003", type: "brandwerende_deur", status: "ter_inspectie", ruimte: "Trappenhuis A", verdieping: colosseumBg, gebouw: colosseum },
    { nr: "VORM01-004", type: "doorvoer", status: "hersteld", ruimte: "Serverruimte 1.08", verdieping: colosseumV1, gebouw: colosseum },
    { nr: "VORM01-005", type: "brandklep", status: "voorbereid", ruimte: "Luchtbehandelingskast 1.02", verdieping: colosseumV1, gebouw: colosseum },
    { nr: "VORM01-006", type: "doorvoer", status: "vervangen", ruimte: "Meterkast BG", verdieping: testgebouwBg, gebouw: testgebouw },
    { nr: "VORM01-007", type: "brandwerende_coating", status: "geplaatst", ruimte: "Parkeergarage -1", verdieping: testgebouwBg, gebouw: testgebouw },
  ];

  for (const s of spots) {
    await db.execute(sql`
      INSERT INTO voorzieningen (objectnummer, type, status, classificatie, gebouw_id, verdieping_id, ruimte, monteur_id)
      VALUES (${s.nr}, ${s.type}, ${s.status}, '60', ${s.gebouw}, ${s.verdieping}, ${s.ruimte}, ${monteurId})
    `);
  }
  console.log(`Klaar: ${spots.length} VORM01-testspots toegewezen aan e2e-account ${monteurId}.`);
}

main()
  .then(() => process.exit(0))
  .catch((fout) => {
    console.error(fout);
    process.exit(1);
  });
