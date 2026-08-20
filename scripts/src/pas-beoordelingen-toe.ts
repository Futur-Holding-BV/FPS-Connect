// REGISTER_01: past beoordelingen uit /tmp/beoordelingen.json toe op het register.
// Alleen regels die nog op de default 'onbewezen' zonder bewijs staan worden
// overschreven; handmatig gezette standen blijven staan.
import { readFileSync } from "node:fs";
import {
  ACCEPTATIEREGISTER_HERGRADEER_LOCK,
  acceptatieRegisterTable,
  db,
} from "@workspace/db";
import { and, eq, isNull, sql } from "drizzle-orm";

const items = JSON.parse(readFileSync("/tmp/beoordelingen.json", "utf8")) as
  { code: string; punt: number; stand: string; bewijs: string | null; toelichting: string | null }[];

async function main(): Promise<void> {
  const resultaat = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock_shared(${ACCEPTATIEREGISTER_HERGRADEER_LOCK})`);
    let toegepast = 0;
    for (const it of items) {
      if (!["gehaald", "niet_gebouwd", "onbewezen", "wacht_op_rene"].includes(it.stand)) continue;
      const bewijs = it.bewijs && it.bewijs !== "null" ? it.bewijs.slice(0, 500) : null;
      const r = await tx
        .update(acceptatieRegisterTable)
        .set({ stand: it.stand, bewijsVindplaats: bewijs, toelichting: it.toelichting?.slice(0, 1000) ?? null, bijgewerktOp: new Date() })
        .where(and(
          eq(acceptatieRegisterTable.opdrachtCode, it.code),
          eq(acceptatieRegisterTable.puntNummer, it.punt),
          eq(acceptatieRegisterTable.stand, "onbewezen"),
          isNull(acceptatieRegisterTable.bewijsVindplaats),
        ))
        .returning({ id: acceptatieRegisterTable.id });
      if (r.length) toegepast++;
    }
    const stand = await tx.execute(sql`SELECT stand, count(*)::int n FROM acceptatie_register GROUP BY stand ORDER BY stand`);
    return { toegepast, standen: stand.rows };
  });
  console.log(`Toegepast: ${resultaat.toegepast}/${items.length}. Standen:`, resultaat.standen);
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
