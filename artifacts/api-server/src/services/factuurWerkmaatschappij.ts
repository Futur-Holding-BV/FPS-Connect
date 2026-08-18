// ADMINISTRATIE_01 fase 3 — de werkmaatschappij (BV) van een factuur.
//
// Besluit René (18-08-2026): de BV hangt aan het WERK (offerte/opdracht),
// niet aan het gebouw. Het gebouw levert alleen een standaardwaarde. Voor
// facturen geldt daarom de keten:
//   1. offerte.werkmaatschappij_id   (het werk zelf — bron van waarheid)
//   2. opdracht.werkmaatschappij_id  (idem, voor facturen zonder offerte)
//   3. gebouw.werkgever_id           (legacy-default voor oude facturen)
// Niets gevonden = null: de aanroeper moet daar zichtbaar op blokkeren
// (factuur-print toont een waarschuwing, AccountView-boeking weigert).

import { db, facturenTable, offertesTable, opdrachtenTable, gebouwenTable, werkgeversTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export type FactuurBv = { id: number; naam: string; bron: "offerte" | "opdracht" | "gebouw" } | null;

export async function bepaalFactuurWerkmaatschappij(
  factuur: Pick<typeof facturenTable.$inferSelect, "offerteId" | "opdrachtId" | "gebouwId">,
): Promise<FactuurBv> {
  let wmId: number | null = null;
  let bron: "offerte" | "opdracht" | "gebouw" | null = null;

  if (factuur.offerteId != null) {
    const [o] = await db.select({ wm: offertesTable.werkmaatschappijId }).from(offertesTable).where(eq(offertesTable.id, factuur.offerteId));
    if (o?.wm != null) { wmId = o.wm; bron = "offerte"; }
  }
  if (wmId == null && factuur.opdrachtId != null) {
    const [op] = await db.select({ wm: opdrachtenTable.werkmaatschappijId }).from(opdrachtenTable).where(eq(opdrachtenTable.id, factuur.opdrachtId));
    if (op?.wm != null) { wmId = op.wm; bron = "opdracht"; }
  }
  if (wmId == null && factuur.gebouwId != null) {
    const [g] = await db.select({ wm: gebouwenTable.werkgeverId }).from(gebouwenTable).where(eq(gebouwenTable.id, factuur.gebouwId));
    if (g?.wm != null) { wmId = g.wm; bron = "gebouw"; }
  }
  if (wmId == null || bron == null) return null;

  const [w] = await db.select({ naam: werkgeversTable.naam }).from(werkgeversTable).where(eq(werkgeversTable.id, wmId));
  if (!w) return null;
  return { id: wmId, naam: w.naam, bron };
}

// Harde werkmaatschappij↔administratie-controle (eis 3.6/4.4), fail-closed.
// Retourneert een leesbare foutmelding, of null als boeken is toegestaan.
export async function controleerFactuurAdministratieBv(
  factuur: Pick<typeof facturenTable.$inferSelect, "offerteId" | "opdrachtId" | "gebouwId">,
  instellingWerkgeverId: number | null,
): Promise<string | null> {
  if (instellingWerkgeverId == null) {
    return "AccountView-koppeling heeft geen werkmaatschappij: leg bij Instellingen → AccountView vast voor welke BV deze administratie boekt.";
  }
  const bv = await bepaalFactuurWerkmaatschappij(factuur);
  if (!bv) {
    return "Werkmaatschappij van de factuur is onbekend (geen BV op offerte/opdracht en geen gebouw-default). Stel de BV in op het werk.";
  }
  if (bv.id !== instellingWerkgeverId) {
    return `Deze factuur hoort bij "${bv.naam}", maar de AccountView-koppeling boekt voor een andere werkmaatschappij. Boeken in de verkeerde administratie is geblokkeerd.`;
  }
  return null;
}
