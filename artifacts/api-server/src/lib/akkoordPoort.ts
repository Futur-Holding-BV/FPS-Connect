// AKKOORD_01 §3 — De akkoordpoort: één functie die bepaalt of een opdracht
// "werkbaar" is. Alles wat geld kost — uren en inkoop — toetst hierop.
// Een tweede eigen controle ergens anders is een afwijzingsgrond (opdrachttekst).
import { db, opdrachtenTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// Zelfde uitvoerder-vorm als inkoopbonService: db of transactie.
type Uitvoerder = Pick<typeof db, "select">;

export type AkkoordToets =
  | { akkoord: true; grond: string }
  | { akkoord: false; melding: string };

export const AKKOORD_GRONDEN = ["ondertekening", "opdrachtbevestiging", "vrijgave_pl"] as const;
export type AkkoordGrond = (typeof AKKOORD_GRONDEN)[number];

export const GROND_LABELS: Record<AkkoordGrond, string> = {
  ondertekening: "ondertekende offerte",
  opdrachtbevestiging: "opdrachtbevestiging van de opdrachtgever",
  vrijgave_pl: "akkoord vastgelegd door de projectleider",
};

// Weigeringstekst noemt wát ontbreekt en waar het vast te leggen is —
// nooit een kaal "geen toegang" (AKKOORD_01 §3.1).
export const GEEN_AKKOORD_MELDING =
  "Deze opdracht heeft nog geen vastgelegd akkoord. Leg eerst het akkoord vast op de opdracht " +
  "(ondertekende offerte, opdrachtbevestiging van de opdrachtgever, of vrijgave door de projectleider) " +
  "voordat er uren geschreven of bestellingen gedaan kunnen worden.";

/**
 * Toets of een opdracht een vastgelegd akkoord heeft.
 * `tx` optioneel: binnen een transactie toetst hij op de transactie-snapshot.
 */
export async function heeftAkkoord(opdrachtId: number, tx?: Uitvoerder): Promise<AkkoordToets> {
  const uitvoerder = tx ?? db;
  const [o] = await uitvoerder
    .select({
      akkoordGrond: opdrachtenTable.akkoordGrond,
      akkoordOp: opdrachtenTable.akkoordOp,
      akkoordDocumentId: opdrachtenTable.akkoordDocumentId,
      akkoordHerkomst: opdrachtenTable.akkoordHerkomst,
    })
    .from(opdrachtenTable)
    .where(eq(opdrachtenTable.id, opdrachtId))
    .limit(1);
  if (!o) {
    return { akkoord: false, melding: `Opdracht #${opdrachtId} bestaat niet.` };
  }
  if (!o.akkoordGrond || !o.akkoordOp) {
    return { akkoord: false, melding: GEEN_AKKOORD_MELDING };
  }
  // Fail-closed op de opslaggrens (reviewpunt): een onbekende grond of een
  // grond zonder het bijbehorende bewijs (B→document, C→herkomst) telt NIET
  // als akkoord — ook niet als zo'n rij via legacy/handmatige weg in de DB
  // terechtkwam. De DB-CHECK (migratie 0047) dwingt dit ook af; deze toets
  // blijft als tweede slot.
  const grond = o.akkoordGrond as AkkoordGrond;
  const geldig =
    AKKOORD_GRONDEN.includes(grond) &&
    (grond !== "opdrachtbevestiging" || o.akkoordDocumentId != null) &&
    (grond !== "vrijgave_pl" || (o.akkoordHerkomst ?? "").trim().length > 0);
  if (!geldig) {
    return { akkoord: false, melding: GEEN_AKKOORD_MELDING };
  }
  return { akkoord: true, grond };
}

/** Fouttype waarmee dieperliggende paden (inkoopbonService) de poort melden. */
export class GeenAkkoordFout extends Error {
  constructor(melding: string = GEEN_AKKOORD_MELDING) {
    super(melding);
    this.name = "GeenAkkoordFout";
  }
}
