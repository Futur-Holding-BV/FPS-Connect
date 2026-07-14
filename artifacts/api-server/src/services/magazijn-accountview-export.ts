/**
 * Magazijn → AccountView export-service
 *
 * Zet een voorraadmutatie om in een AccountView journaalpost.
 * Fail-closed: gooit een fout als de inkoopprijs ontbreekt of AccountView niet bereikbaar is.
 */

import { db, voorraadMutatiesTable, artikelenTable, accountviewInstellingenTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { maakAccountViewClient } from "./accountview-client";
import type { AccountviewBoekingResultaat } from "./accountview-client";
import { logger } from "../lib/logger";

export interface MagazijnExportResultaat {
  geslaagd: boolean;
  mutatie_id: number;
  boeking_id?: string;
  foutmelding?: string;
  testmodus: boolean;
}

export interface MagazijnBatchExportResultaat {
  totaal: number;
  geslaagd: number;
  mislukt: number;
  overgeslagen: number;
  regels: MagazijnExportResultaat[];
}

async function haalInstellingen() {
  const [inst] = await db.select().from(accountviewInstellingenTable).where(eq(accountviewInstellingenTable.id, 1)).limit(1);
  return inst ?? null;
}

/**
 * Exporteer één voorraadmutatie naar AccountView.
 * Retourneert het resultaat; werpt een Error bij configuratiefouten.
 */
export async function exporteerMutatie(mutatieId: number): Promise<MagazijnExportResultaat> {
  const inst = await haalInstellingen();
  if (!inst) throw new Error("AccountView-instellingen ontbreken — sla ze eerst op in Instellingen → AccountView.");
  if (!inst.magazijnExportActief && !inst.testmodus) {
    throw new Error("Magazijn-export is uitgeschakeld. Schakel 'Magazijnmutaties automatisch exporteren' in via Instellingen → AccountView.");
  }

  const grootboekVoorraad = inst.grootboekVoorraad ?? inst.grootboekStandaard ?? "";
  const grootboekInkoop   = inst.grootboekInkoopKosten ?? inst.grootboekStandaard ?? "";

  if (!grootboekVoorraad || !grootboekInkoop) {
    throw new Error("Grootboekrekeningen voor magazijn zijn niet ingesteld. Vul 'Grootboek voorraad' en 'Grootboek inkoopkosten' in via Instellingen → AccountView.");
  }

  const [mutatie] = await db
    .select({
      id:          voorraadMutatiesTable.id,
      type:        voorraadMutatiesTable.type,
      hoeveelheid: voorraadMutatiesTable.hoeveelheid,
      delta:       voorraadMutatiesTable.delta,
      omschrijving: voorraadMutatiesTable.omschrijving,
      aangemaaktOp: voorraadMutatiesTable.aangemaaktOp,
      artikelId:   voorraadMutatiesTable.artikelId,
      accountviewExportOp: voorraadMutatiesTable.accountviewExportOp,
    })
    .from(voorraadMutatiesTable)
    .where(eq(voorraadMutatiesTable.id, mutatieId))
    .limit(1);

  if (!mutatie) throw new Error(`Mutatie #${mutatieId} niet gevonden.`);

  // Scope-bewaking: alleen financieel relevante voorraadmutaties mogen worden geboekt
  const EXPORTEERBAAR: ReadonlySet<string> = new Set(["inkoop", "uitgifte", "correctie", "retour"]);
  if (!EXPORTEERBAAR.has(mutatie.type)) {
    throw new Error(`Mutatietype '${mutatie.type}' wordt niet geëxporteerd naar AccountView (alleen inkoop, uitgifte, correctie en retour).`);
  }

  // Idempotentie: weiger her-export van al geboekte mutaties
  if (mutatie.accountviewExportOp != null) {
    const reeds = mutatie.accountviewExportOp.toISOString();
    throw Object.assign(
      new Error(`AL_GEEXPORTEERD: Mutatie #${mutatieId} is al geëxporteerd op ${reeds}. Dubbele boeking voorkomen.`),
      { code: "AL_GEEXPORTEERD" },
    );
  }

  const [artikel] = await db
    .select({ naam: artikelenTable.naam, inkoopprijs: artikelenTable.inkoopprijs })
    .from(artikelenTable)
    .where(eq(artikelenTable.id, mutatie.artikelId))
    .limit(1);

  if (!artikel) throw new Error(`Artikel voor mutatie #${mutatieId} niet gevonden.`);

  const inkoopprijs = artikel.inkoopprijs;
  if (inkoopprijs == null || inkoopprijs <= 0) {
    throw new Error(`Artikel '${artikel.naam}' heeft geen (geldige) inkoopprijs — export niet mogelijk.`);
  }

  const bedrag = Math.round(mutatie.hoeveelheid * inkoopprijs * 100) / 100;
  const datum  = mutatie.aangemaaktOp.toISOString().slice(0, 10);
  const typeLabel: Record<string, string> = {
    inkoop: "Inkoop",
    uitgifte: "Uitgifte",
    retour: "Retour",
    correctie: "Correctie",
    reservering: "Reservering",
    vrijgave: "Vrijgave",
  };

  const omschrijving = `${typeLabel[mutatie.type] ?? mutatie.type} ${artikel.naam}${mutatie.omschrijving ? ` — ${mutatie.omschrijving}` : ""}`;

  // Debet/credit logica:
  // inkoop/retour: voorraad stijgt → debet Voorraad, credit Inkoopkosten
  // uitgifte/correctie (negatief): voorraad daalt → debet Inkoopkosten, credit Voorraad
  const isToename = mutatie.delta >= 0;
  const debetRek   = isToename ? grootboekVoorraad : grootboekInkoop;
  const creditRek  = isToename ? grootboekInkoop   : grootboekVoorraad;

  const client = maakAccountViewClient(inst);
  let resultaat: AccountviewBoekingResultaat;

  try {
    resultaat = await client.verzendBoeking({
      dagboek: inst.dagboekInkoop ?? "INK",
      administratiecode: inst.administratiecode ?? "",
      factuurnummer: `MAG-${mutatieId}`,
      factuurdatum: datum,
      relatienaam: "Magazijn",
      omschrijving,
      bedragExclBtw: bedrag,
      btwBedrag: 0,
      bedragInclBtw: bedrag,
      grootboekrekening: debetRek,
      creditRekening: creditRek,
      type: "inkoop",
    });
  } catch (err) {
    throw new Error(`AccountView-verbindingsfout: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Fail-closed: gooi een fout als AccountView de boeking weigert of onbereikbaar is
  if (!resultaat.geslaagd) {
    const avFout = resultaat.foutmelding ?? `HTTP ${resultaat.httpStatus ?? "onbekend"}`;
    throw Object.assign(
      new Error(`AccountView weigerde de boeking: ${avFout}`),
      { code: "AV_GEWEIGERD", accountviewFout: avFout, httpStatus: resultaat.httpStatus },
    );
  }

  await db
    .update(voorraadMutatiesTable)
    .set({ accountviewExportOp: new Date() })
    .where(eq(voorraadMutatiesTable.id, mutatieId));

  logger.info({ mutatieId, boekingId: resultaat.boekingId }, "Magazijnmutatie geëxporteerd naar AccountView");

  return {
    geslaagd: true,
    mutatie_id: mutatieId,
    boeking_id: resultaat.boekingId,
    foutmelding: undefined,
    testmodus: resultaat.testmodus,
  };
}

/**
 * Batch-export: exporteer alle niet-geëxporteerde mutaties binnen een datumbereik.
 * Al-geëxporteerde mutaties worden overgeslagen.
 */
export async function batchExportMutaties(
  vanDatum: Date,
  totDatum: Date,
): Promise<MagazijnBatchExportResultaat> {
  const { and, gte, lte, isNull, inArray } = await import("drizzle-orm");

  // Alleen financieel relevante types; reservering/vrijgave worden niet geboekt
  const EXPORTEERBAAR_TYPES = ["inkoop", "uitgifte", "correctie", "retour"] as const;

  const mutaties = await db
    .select({ id: voorraadMutatiesTable.id })
    .from(voorraadMutatiesTable)
    .where(
      and(
        gte(voorraadMutatiesTable.aangemaaktOp, vanDatum),
        lte(voorraadMutatiesTable.aangemaaktOp, totDatum),
        isNull(voorraadMutatiesTable.accountviewExportOp),
        inArray(voorraadMutatiesTable.type, EXPORTEERBAAR_TYPES as unknown as string[]),
      ),
    )
    .orderBy(voorraadMutatiesTable.aangemaaktOp);

  const regels: MagazijnExportResultaat[] = [];
  let geslaagd = 0;
  let mislukt = 0;

  for (const m of mutaties) {
    try {
      const r = await exporteerMutatie(m.id);
      regels.push(r);
      if (r.geslaagd) geslaagd++;
      else mislukt++;
    } catch (err) {
      mislukt++;
      regels.push({
        geslaagd: false,
        mutatie_id: m.id,
        foutmelding: err instanceof Error ? err.message : String(err),
        testmodus: false,
      });
    }
  }

  return {
    totaal: mutaties.length,
    geslaagd,
    mislukt,
    overgeslagen: 0,
    regels,
  };
}
