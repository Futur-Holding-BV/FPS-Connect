// ADMINISTRATIE_01 fase 3 — de werkmaatschappij (BV) van een factuur.
//
// Besluit René (18-08-2026): de BV hangt aan het WERK (offerte/opdracht),
// niet aan het gebouw. Het gebouw levert alleen een standaardwaarde. Voor
// facturen geldt daarom de keten:
//   1. factuur.werkgever_id           (fiscale momentopname na definitief)
//   2. offerte.werkmaatschappij_id    (het werk zelf — concept/legacy)
//   3. opdracht.werkmaatschappij_id   (idem, voor facturen zonder offerte)
//   4. gebouw.werkgever_id            (legacy-default voor oude facturen)
// Niets gevonden = null: de aanroeper moet daar zichtbaar op blokkeren
// (factuur-print toont een waarschuwing, AccountView-boeking weigert).

import { db, facturenTable, offertesTable, opdrachtenTable, gebouwenTable, werkgeversTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export type FactuurBv = { id: number; naam: string; bron: "factuur" | "offerte" | "opdracht" | "gebouw" } | null;

type FactuurBvOpties = {
  uitvoerder?: typeof db;
  vergrendelBronnen?: boolean;
};

export async function bepaalFactuurWerkmaatschappij(
  factuur: Pick<typeof facturenTable.$inferSelect, "type" | "factuurnummer" | "werkgeverId" | "werkgeverVastgelegdOp" | "offerteId" | "opdrachtId" | "gebouwId">,
  opties: FactuurBvOpties = {},
): Promise<FactuurBv> {
  const uitvoerder = opties.uitvoerder ?? db;
  const vergrendelBronnen = opties.vergrendelBronnen === true;
  const heeftFiscaleSnapshot = factuur.werkgeverId != null && factuur.werkgeverVastgelegdOp != null;
  let wmId: number | null = heeftFiscaleSnapshot ? factuur.werkgeverId : null;
  let bron: "factuur" | "offerte" | "opdracht" | "gebouw" | null = wmId == null ? null : "factuur";

  // Een al genummerde legacy-factuur zonder expliciete snapshot mag nooit de
  // huidige werk-keten als historische waarheid gebruiken.
  if (wmId == null && factuur.type === "verkoop" && factuur.factuurnummer != null) return null;

  // Bij definitief maken worden álle aanwezige bronrijen in vaste volgorde
  // vergrendeld. Ook een offerte met nog géén BV moet op slot: anders kan die
  // gelijktijdig worden gevuld en de prioriteit offerte → opdracht → gebouw
  // veranderen nadat de fiscale momentopname al is gekozen.
  let offerteWerkgeverId: number | null = null;
  let opdrachtWerkgeverId: number | null = null;
  let gebouwWerkgeverId: number | null = null;

  if (wmId == null && factuur.offerteId != null) {
    const query = uitvoerder
      .select({ wm: offertesTable.werkmaatschappijId })
      .from(offertesTable)
      .where(eq(offertesTable.id, factuur.offerteId));
    const [o] = vergrendelBronnen ? await query.for("update") : await query;
    offerteWerkgeverId = o?.wm ?? null;
  }
  if (wmId == null && factuur.opdrachtId != null) {
    const query = uitvoerder
      .select({ wm: opdrachtenTable.werkmaatschappijId })
      .from(opdrachtenTable)
      .where(eq(opdrachtenTable.id, factuur.opdrachtId));
    const [op] = vergrendelBronnen ? await query.for("update") : await query;
    opdrachtWerkgeverId = op?.wm ?? null;
  }
  if (wmId == null && factuur.gebouwId != null) {
    const query = uitvoerder
      .select({ wm: gebouwenTable.werkgeverId })
      .from(gebouwenTable)
      .where(eq(gebouwenTable.id, factuur.gebouwId));
    const [g] = vergrendelBronnen ? await query.for("update") : await query;
    gebouwWerkgeverId = g?.wm ?? null;
  }

  if (wmId == null && offerteWerkgeverId != null) {
    wmId = offerteWerkgeverId;
    bron = "offerte";
  } else if (wmId == null && opdrachtWerkgeverId != null) {
    wmId = opdrachtWerkgeverId;
    bron = "opdracht";
  } else if (wmId == null && gebouwWerkgeverId != null) {
    wmId = gebouwWerkgeverId;
    bron = "gebouw";
  }
  if (wmId == null || bron == null) return null;

  const werkgeverQuery = uitvoerder
    .select({ naam: werkgeversTable.naam })
    .from(werkgeversTable)
    .where(eq(werkgeversTable.id, wmId));
  const [w] = vergrendelBronnen ? await werkgeverQuery.for("update") : await werkgeverQuery;
  if (!w) return null;
  return { id: wmId, naam: w.naam, bron };
}

// Harde werkmaatschappij↔administratie-controle (eis 3.6/4.4), fail-closed.
// Retourneert een leesbare foutmelding, of null als boeken is toegestaan.
export async function controleerFactuurAdministratieBv(
  factuur: Pick<typeof facturenTable.$inferSelect, "type" | "factuurnummer" | "werkgeverId" | "werkgeverVastgelegdOp" | "offerteId" | "opdrachtId" | "gebouwId">,
  instellingWerkgeverId: number | null,
): Promise<string | null> {
  if (instellingWerkgeverId == null) {
    return "AccountView-koppeling heeft geen werkmaatschappij: leg bij Instellingen → AccountView vast voor welke BV deze administratie boekt.";
  }
  const bv = await bepaalFactuurWerkmaatschappij(factuur);
  if (!bv) {
    return factuur.type === "verkoop" && factuur.factuurnummer
      ? "De fiscale BV van deze bestaande factuur is niet aantoonbaar vastgelegd. Boeken is geblokkeerd totdat een bevoegde herstelactie de uitgevende BV expliciet vastlegt."
      : "Werkmaatschappij van de factuur is onbekend (geen BV op offerte/opdracht en geen gebouw-default). Stel de BV in op het werk.";
  }
  if (bv.id !== instellingWerkgeverId) {
    return `Deze factuur hoort bij "${bv.naam}", maar de AccountView-koppeling boekt voor een andere werkmaatschappij. Boeken in de verkeerde administratie is geblokkeerd.`;
  }
  return null;
}
