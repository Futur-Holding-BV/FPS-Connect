// Centrale aanmaak van een verlofprofiel voor een medewerker: de pro-rata
// startsaldi (op basis van contracturen t.o.v. de CAO-norm) voor alle relevant
// verlofsoorten. Wordt aangeroepen vanuit de onboarding-flow en kan hergebruikt
// worden bij het los aanmaken van een medewerker. Eén plek, zodat de opbouwlogica
// nooit op twee plekken kan gaan afwijken.
import { db as defaultDb, verlofsoortenTable, verlofSaldiTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

type Db = typeof defaultDb;

export type CaoOptie = {
  naam: string;
  standaard_uren_per_week: number;
  adv_uren_per_week?: number;
};

export type VerlofprofielInput = {
  medewerkerId: number;
  /** CAO-optie van de medewerker; bepaalt de normweek voor de pro-rata factor. */
  caoOptie: CaoOptie;
  /** Contracturen per week van de medewerker. */
  contracturenPerWeek: number;
  /** Verlofsoort-id's waarvoor een startsaldo aangemaakt moet worden. */
  verlofsoortIds: number[];
  /** Kalenderjaar waarvoor het saldo wordt opgebouwd; standaard het huidige jaar. */
  jaar?: number;
};

export type VerlofprofielResultaat = {
  jaar: number;
  factor: number;
  aangemaakt: { verlofsoortId: number; opgebouwdUren: number }[];
};

/**
 * Bouwt het verlofprofiel (startsaldi) van een medewerker op — pro-rata op basis
 * van contracturen t.o.v. de CAO-normweek. Slaat verlofsoorten zonder
 * `opbouwUrenPerJaar` niet over qua saldo-aanmaak (opgebouwd = 0), zodat de
 * medewerker wel een zichtbare saldoregel heeft om later handmatig te corrigeren.
 * Bestaat er al een saldo voor medewerker+verlofsoort+jaar, dan wordt die
 * verlofsoort overgeslagen (geen dubbele/overschreven saldi).
 */
export async function maakVerlofprofielAan(
  input: VerlofprofielInput,
  db: Db = defaultDb,
): Promise<VerlofprofielResultaat> {
  const jaar = input.jaar ?? new Date().getFullYear();
  const standaardUren = input.caoOptie.standaard_uren_per_week || 40;
  const factor = Math.min(input.contracturenPerWeek / standaardUren, 1);

  const idsUniek = Array.from(new Set(input.verlofsoortIds.filter((n) => Number.isFinite(n))));
  if (idsUniek.length === 0) return { jaar, factor, aangemaakt: [] };

  const soorten = await db.select().from(verlofsoortenTable).where(inArray(verlofsoortenTable.id, idsUniek));
  const bestaande = await db
    .select({ verlofsoortId: verlofSaldiTable.verlofsoortId })
    .from(verlofSaldiTable)
    .where(eq(verlofSaldiTable.medewerkerId, input.medewerkerId));
  const bestaandeSet = new Set(bestaande.filter((b) => idsUniek.includes(b.verlofsoortId)).map((b) => b.verlofsoortId));

  const aangemaakt: { verlofsoortId: number; opgebouwdUren: number }[] = [];
  for (const vs of soorten) {
    if (bestaandeSet.has(vs.id)) continue;
    const basis = vs.opbouwUrenPerJaar ?? 0;
    const opgebouwd = Math.round(basis * factor * 10) / 10;
    await db.insert(verlofSaldiTable).values({
      medewerkerId: input.medewerkerId,
      verlofsoortId: vs.id,
      jaar,
      beginsaldoUren: 0,
      opgebouwdUren: opgebouwd,
      opgenomenUren: 0,
      saldoUren: opgebouwd,
    });
    aangemaakt.push({ verlofsoortId: vs.id, opgebouwdUren: opgebouwd });
  }

  return { jaar, factor, aangemaakt };
}
