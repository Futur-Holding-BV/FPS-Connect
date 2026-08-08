// NUMMER_01 — Kenmerkketen volgens de ENK-piramide.
//
// Kernregel (§4.3): het kenmerk wordt BEREKEND uit de verwijzingen op het moment
// van tonen; het wordt nooit als bewerkbaar veld opgeslagen. Alleen bij het
// definitief maken/versturen van een uitgaand document wordt de berekende waarde
// als bevroren momentopname bij dat document weggeschreven.
//
// Vorm: [PREFIX-]G156/C590/O405 — de BV-prefix komt van de werkgever van het
// gebouw (§4.7); tellers zijn één doorlopende reeks over alle BV's.

import { eq } from "drizzle-orm";
import {
  db,
  gebouwenTable,
  werkgeversTable,
  calculatiesTable,
  modCalcHeadersTable,
  offertesTable,
} from "@workspace/db";

/** Toon een volgnummer met minimaal drie posities; groeit mee boven 999 (§4.1). */
export function formatNummer(letter: "G" | "M" | "C" | "O" | "I" | "F", n: number): string {
  return `${letter}${String(n).padStart(3, "0")}`;
}

/** Herzieningsletter voor inkoop (§4.5): 0 = "", 1 = "a", 2 = "b", … 27 = "aa". */
export function herzieningsLetter(herziening: number): string {
  let s = "";
  let n = herziening;
  while (n > 0) {
    n -= 1;
    s = String.fromCharCode(97 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}

/** BV-prefix ("BP-") voor een gebouw, of "" als de werkgever geen prefix heeft. */
export async function prefixVoorGebouw(gebouwId: number | null | undefined): Promise<string> {
  if (!gebouwId) return "";
  const [rij] = await db
    .select({ prefix: werkgeversTable.kenmerkPrefix })
    .from(gebouwenTable)
    .leftJoin(werkgeversTable, eq(gebouwenTable.werkgeverId, werkgeversTable.id))
    .where(eq(gebouwenTable.id, gebouwId));
  const p = rij?.prefix?.trim();
  return p ? `${p}-` : "";
}

/** G-deel van een gebouw: het werknummer (§4.8), bv. "G156". */
export async function gDeel(gebouwId: number | null | undefined): Promise<string | null> {
  if (!gebouwId) return null;
  const [g] = await db
    .select({ werknummer: gebouwenTable.werknummer })
    .from(gebouwenTable)
    .where(eq(gebouwenTable.id, gebouwId));
  return g?.werknummer?.trim() || null;
}

/** Kenmerk van een calculatie: [PFX-]G156/C590 (§ besluit 4). */
export async function kenmerkVoorCalculatie(calculatieId: number): Promise<string | null> {
  const [c] = await db
    .select({ nummer: calculatiesTable.nummer, gebouwId: calculatiesTable.gebouwId })
    .from(calculatiesTable)
    .where(eq(calculatiesTable.id, calculatieId));
  if (!c) return null;
  const g = await gDeel(c.gebouwId);
  const prefix = await prefixVoorGebouw(c.gebouwId);
  const cdeel = formatNummer("C", c.nummer);
  return g ? `${prefix}${g}/${cdeel}` : cdeel;
}

/** Kenmerk van een ENK-calculatie (mod_calc_headers): [PFX-]G156/C590. */
export async function kenmerkVoorModCalc(
  gebouwId: number | null | undefined,
  nummer: number,
): Promise<string> {
  const g = await gDeel(gebouwId);
  const prefix = await prefixVoorGebouw(gebouwId);
  const cdeel = formatNummer("C", nummer);
  return g ? `${prefix}${g}/${cdeel}` : cdeel;
}

/** Kenmerk van een offerte: [PFX-]G156/C590/O405. Zonder calculatie: G156/O405. */
export async function kenmerkVoorOfferte(offerteId: number): Promise<string | null> {
  const [o] = await db
    .select({
      nummer: offertesTable.nummer,
      gebouwId: offertesTable.gebouwId,
      calculatieId: offertesTable.calculatieId,
    })
    .from(offertesTable)
    .where(eq(offertesTable.id, offerteId));
  if (!o) return null;
  const odeel = formatNummer("O", o.nummer);
  let cdeel: string | null = null;
  let gebouwId = o.gebouwId;
  // offertes.calculatie_id verwijst naar mod_calc_headers (de gebruikte calculatiemodule)
  if (o.calculatieId) {
    const [c] = await db
      .select({ nummer: modCalcHeadersTable.nummer, gebouwId: modCalcHeadersTable.gebouwId })
      .from(modCalcHeadersTable)
      .where(eq(modCalcHeadersTable.id, o.calculatieId));
    if (c) {
      cdeel = formatNummer("C", c.nummer);
      gebouwId = c.gebouwId ?? gebouwId;
    }
  }
  const g = await gDeel(gebouwId);
  const prefix = await prefixVoorGebouw(gebouwId);
  return [g ? `${prefix}${g}` : null, cdeel, odeel].filter(Boolean).join("/");
}

/** Kenmerk van een projectinkoop: O405/I088[a] — dichtstbijzijnde ouder (besluit 5). */
export async function kenmerkVoorProjectinkoop(
  offerteId: number | null | undefined,
  inkoopNummer: number,
  herziening = 0,
): Promise<string> {
  const ideel = formatNummer("I", inkoopNummer) + herzieningsLetter(herziening);
  if (!offerteId) return ideel;
  const [o] = await db
    .select({ nummer: offertesTable.nummer })
    .from(offertesTable)
    .where(eq(offertesTable.id, offerteId));
  return o ? `${formatNummer("O", o.nummer)}/${ideel}` : ideel;
}

/** Kenmerk van een voorraadinkoop: G002/I089[a] — het magazijn-gebouw als ouder. */
export async function kenmerkVoorVoorraadinkoop(
  gebouwId: number | null | undefined,
  inkoopNummer: number,
  herziening = 0,
): Promise<string> {
  const ideel = formatNummer("I", inkoopNummer) + herzieningsLetter(herziening);
  const g = await gDeel(gebouwId);
  return g ? `${g}/${ideel}` : ideel;
}

/** Kenmerk van een verkoopfactuur: O405/F002 — nooit los tonen (§4.6). */
export async function kenmerkVoorFactuur(
  offerteId: number | null | undefined,
  fNummer: number | null | undefined,
): Promise<string | null> {
  if (!offerteId || !fNummer) return null;
  const [o] = await db
    .select({ nummer: offertesTable.nummer })
    .from(offertesTable)
    .where(eq(offertesTable.id, offerteId));
  if (!o) return null;
  return `${formatNummer("O", o.nummer)}/${formatNummer("F", fNummer)}`;
}

/** Volgende G-nummer als werknummer-tekst ("G157") uit de sequence — nooit max+1. */
export async function volgendeGWerknummer(): Promise<string> {
  const r = await db.execute(`SELECT nextval('seq_nummer_g') AS n`);
  const rows = (r as unknown as { rows: Array<{ n: string | number }> }).rows ?? (r as unknown as Array<{ n: string | number }>);
  const n = Number(Array.isArray(rows) ? rows[0]?.n : undefined);
  return formatNummer("G", n);
}
