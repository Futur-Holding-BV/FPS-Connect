// ADMINISTRATIE_01: het IBAN van een werkmaatschappij is een AFGELEID gegeven
// — de rekening met doel "ontvangst" van diezelfde BV. De losse kolom
// werkgevers.iban is legacy en mag niet meer rechtstreeks gelezen worden,
// anders toont een document een verouderd of verkeerd nummer.
import { sql, eq, and } from "drizzle-orm";
import { db, werkgeverBankrekeningenTable } from "@workspace/db";

export async function haalOntvangstIban(werkgeverId: number): Promise<string | null> {
  const [rij] = await db
    .select({ iban: werkgeverBankrekeningenTable.iban })
    .from(werkgeverBankrekeningenTable)
    .where(and(
      eq(werkgeverBankrekeningenTable.werkgeverId, werkgeverId),
      sql`'ontvangst' = ANY(${werkgeverBankrekeningenTable.doelen})`,
    ))
    .limit(1);
  return rij?.iban ?? null;
}
