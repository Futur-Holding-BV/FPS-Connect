/**
 * Magazijn → AccountView export-service
 *
 * Zet een voorraadmutatie om in een AccountView journaalpost.
 * Fail-closed: gooit een fout als de inkoopprijs ontbreekt of AccountView niet bereikbaar is.
 */

import {
  db,
  accountviewInstellingenTable,
  artikelenTable,
  gebouwenTable,
  magazijnInkoopordersTable,
  magazijnInstellingenTable,
  magazijnPicklijstenTable,
  opdrachtenTable,
  reserveringenTable,
  voorraadMutatiesTable,
  werkgeversTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
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

type MagazijnBvBron =
  | "magazijn"
  | "opdracht"
  | "inkooporder"
  | "picklijst"
  | "reservering";

type MagazijnBv = {
  id: number;
  naam: string;
  bron: MagazijnBvBron;
};

type MagazijnBvBronnen = {
  kandidaten: MagazijnBv[];
  onbekend: string[];
};

type BvQueryExecutor = Pick<typeof db, "select">;

async function voegBvBronToe(
  executor: BvQueryExecutor,
  bronnen: MagazijnBvBronnen,
  werkgeverId: number | null | undefined,
  bron: MagazijnBvBron,
  omschrijving: string,
): Promise<void> {
  if (werkgeverId == null) {
    bronnen.onbekend.push(`${omschrijving} heeft geen werkmaatschappij`);
    return;
  }

  const [werkgever] = await executor
    .select({ naam: werkgeversTable.naam })
    .from(werkgeversTable)
    .where(eq(werkgeversTable.id, werkgeverId))
    .limit(1);
  if (!werkgever) {
    bronnen.onbekend.push(`${omschrijving} verwijst naar een onbekende werkmaatschappij`);
    return;
  }

  bronnen.kandidaten.push({ id: werkgeverId, naam: werkgever.naam, bron });
}

async function voegGebouwBvToe(
  executor: BvQueryExecutor,
  bronnen: MagazijnBvBronnen,
  gebouwId: number | null | undefined,
  bron: MagazijnBvBron,
  omschrijving: string,
): Promise<void> {
  if (gebouwId == null) {
    bronnen.onbekend.push(`${omschrijving} heeft geen gebouw`);
    return;
  }

  const [gebouw] = await executor
    .select({ werkgeverId: gebouwenTable.werkgeverId })
    .from(gebouwenTable)
    .where(eq(gebouwenTable.id, gebouwId))
    .limit(1);
  if (!gebouw) {
    bronnen.onbekend.push(`${omschrijving} verwijst naar een onbekend gebouw`);
    return;
  }
  await voegBvBronToe(executor, bronnen, gebouw.werkgeverId, bron, omschrijving);
}

async function voegOpdrachtBvToe(
  executor: BvQueryExecutor,
  bronnen: MagazijnBvBronnen,
  opdrachtId: number | null | undefined,
  bron: MagazijnBvBron,
  omschrijving: string,
): Promise<void> {
  if (opdrachtId == null) {
    bronnen.onbekend.push(`${omschrijving} heeft geen opdracht`);
    return;
  }

  const [opdracht] = await executor
    .select({
      werkmaatschappijId: opdrachtenTable.werkmaatschappijId,
      gebouwId: opdrachtenTable.gebouwId,
    })
    .from(opdrachtenTable)
    .where(eq(opdrachtenTable.id, opdrachtId))
    .limit(1);
  if (!opdracht) {
    bronnen.onbekend.push(`${omschrijving} verwijst naar een onbekende opdracht`);
    return;
  }

  // Voor oude opdrachten zonder expliciete BV blijft de gebouw-default de
  // enige herleidbare bron. Een ontbrekende default blijft fail-closed.
  if (opdracht.werkmaatschappijId != null) {
    await voegBvBronToe(executor, bronnen, opdracht.werkmaatschappijId, bron, omschrijving);
  } else {
    await voegGebouwBvToe(executor, bronnen, opdracht.gebouwId, bron, omschrijving);
  }
}

/**
 * ADMINISTRATIE_01 fase 3 — harde werkmaatschappij↔administratie-controle voor
 * magazijnboekingen.
 *
 * Magazijnvoorraad heeft geen eigen BV-kolom. Daarom verzamelen we alle
 * beschikbare, levende bronnen: het ingestelde magazijngebouw en de relatie
 * van de mutatie (opdracht, inkooporder, picklijst of reservering). Ontbrekende
 * herleiding en tegenstrijdige bronnen worden bewust niet stil genegeerd.
 */
export async function controleerMagazijnAdministratieBv(
  mutatie: Pick<typeof voorraadMutatiesTable.$inferSelect, "opdrachtId" | "referentieType" | "referentieId">,
  instellingWerkgeverId: number | null,
  executor: BvQueryExecutor = db,
): Promise<string | null> {
  if (instellingWerkgeverId == null) {
    return "AccountView-koppeling heeft geen werkmaatschappij: leg bij Instellingen → AccountView vast voor welke BV deze administratie boekt.";
  }

  const bronnen: MagazijnBvBronnen = { kandidaten: [], onbekend: [] };
  const [magazijnInstellingen] = await executor
    .select({ magazijnGebouwId: magazijnInstellingenTable.magazijnGebouwId })
    .from(magazijnInstellingenTable)
    .where(eq(magazijnInstellingenTable.id, 1))
    .limit(1);

  if (magazijnInstellingen?.magazijnGebouwId != null) {
    await voegGebouwBvToe(
      executor,
      bronnen,
      magazijnInstellingen.magazijnGebouwId,
      "magazijn",
      "Het ingestelde magazijn",
    );
  }

  const verwerkteOpdrachten = new Set<number>();
  const voegOpdrachtEenmaligToe = async (
    opdrachtId: number | null | undefined,
    bron: MagazijnBvBron,
    omschrijving: string,
  ): Promise<void> => {
    if (opdrachtId == null || verwerkteOpdrachten.has(opdrachtId)) return;
    verwerkteOpdrachten.add(opdrachtId);
    await voegOpdrachtBvToe(executor, bronnen, opdrachtId, bron, omschrijving);
  };

  await voegOpdrachtEenmaligToe(
    mutatie.opdrachtId,
    "opdracht",
    "De magazijnmutatie",
  );

  if (mutatie.referentieType != null && mutatie.referentieId == null) {
    bronnen.onbekend.push(`De magazijnmutatie heeft een onvolledige ${mutatie.referentieType}-referentie`);
  } else if (mutatie.referentieType === "opdracht") {
    await voegOpdrachtEenmaligToe(
      mutatie.referentieId,
      "opdracht",
      "De referentie van de magazijnmutatie",
    );
  } else if (mutatie.referentieType === "inkooporder") {
    const [inkooporder] = await executor
      .select({ gebouwId: magazijnInkoopordersTable.gebouwId })
      .from(magazijnInkoopordersTable)
      .where(eq(magazijnInkoopordersTable.id, mutatie.referentieId ?? -1))
      .limit(1);
    if (!inkooporder) {
      bronnen.onbekend.push("De magazijnmutatie verwijst naar een onbekende inkooporder");
    } else {
      await voegGebouwBvToe(
        executor,
        bronnen,
        inkooporder.gebouwId,
        "inkooporder",
        "De inkooporder van de magazijnmutatie",
      );
    }
  } else if (mutatie.referentieType === "picklijst") {
    const [picklijst] = await executor
      .select({ opdrachtId: magazijnPicklijstenTable.opdrachtId })
      .from(magazijnPicklijstenTable)
      .where(eq(magazijnPicklijstenTable.id, mutatie.referentieId ?? -1))
      .limit(1);
    if (!picklijst) {
      bronnen.onbekend.push("De magazijnmutatie verwijst naar een onbekende picklijst");
    } else {
      await voegOpdrachtEenmaligToe(
        picklijst.opdrachtId,
        "picklijst",
        "De picklijst van de magazijnmutatie",
      );
    }
  } else if (mutatie.referentieType === "reservering") {
    const [reservering] = await executor
      .select({ opdrachtId: reserveringenTable.opdrachtId })
      .from(reserveringenTable)
      .where(eq(reserveringenTable.id, mutatie.referentieId ?? -1))
      .limit(1);
    if (!reservering) {
      bronnen.onbekend.push("De magazijnmutatie verwijst naar een onbekende reservering");
    } else {
      await voegOpdrachtEenmaligToe(
        reservering.opdrachtId,
        "reservering",
        "De reservering van de magazijnmutatie",
      );
    }
  } else if (mutatie.referentieType != null) {
    bronnen.onbekend.push(`De magazijnmutatie heeft een onbekend referentietype "${mutatie.referentieType}"`);
  }

  if (bronnen.onbekend.length > 0) {
    return `Werkmaatschappij van de magazijnboeking is niet betrouwbaar herleidbaar: ${bronnen.onbekend.join("; ")}. Boeken is geblokkeerd.`;
  }
  if (bronnen.kandidaten.length === 0) {
    return "Werkmaatschappij van de magazijnboeking is onbekend: er is geen BV op het magazijn of de mutatierelatie. Boeken is geblokkeerd.";
  }

  const eerste = bronnen.kandidaten[0]!;
  const tegenstrijdig = bronnen.kandidaten.find((bron) => bron.id !== eerste.id);
  if (tegenstrijdig) {
    return `Magazijnboeking heeft tegenstrijdige werkmaatschappijen ("${eerste.naam}" via ${eerste.bron} en "${tegenstrijdig.naam}" via ${tegenstrijdig.bron}). Boeken is geblokkeerd.`;
  }
  if (eerste.id !== instellingWerkgeverId) {
    return `Deze magazijnboeking hoort bij "${eerste.naam}", maar de AccountView-koppeling boekt voor een andere werkmaatschappij. Boeken in de verkeerde administratie is geblokkeerd.`;
  }
  return null;
}

/**
 * Exporteer één voorraadmutatie naar AccountView.
 * Retourneert het resultaat; werpt een Error bij configuratiefouten.
 */
export async function exporteerMutatie(mutatieId: number): Promise<MagazijnExportResultaat> {
  const inst = await haalInstellingen();
  if (!inst) throw new Error("AccountView-instellingen ontbreken — sla ze eerst op in Instellingen → AccountView.");
  if (inst.werkgeverId == null) {
    throw Object.assign(
      new Error("AccountView-koppeling heeft geen werkmaatschappij: leg bij Instellingen → AccountView vast voor welke BV deze administratie boekt."),
      { code: "BV_CONTROLE_GEWEIGERD" },
    );
  }
  if (!inst.magazijnExportActief && !inst.testmodus) {
    throw new Error("Magazijn-export is uitgeschakeld. Schakel 'Magazijnmutaties automatisch exporteren' in via Instellingen → AccountView.");
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
      referentieType: voorraadMutatiesTable.referentieType,
      referentieId: voorraadMutatiesTable.referentieId,
      opdrachtId: voorraadMutatiesTable.opdrachtId,
      accountviewExportOp: voorraadMutatiesTable.accountviewExportOp,
    })
    .from(voorraadMutatiesTable)
    .where(eq(voorraadMutatiesTable.id, mutatieId))
    .limit(1);

  if (!mutatie) throw new Error(`Mutatie #${mutatieId} niet gevonden.`);

  const bvFout = await controleerMagazijnAdministratieBv(mutatie, inst.werkgeverId);
  if (bvFout) {
    throw Object.assign(new Error(bvFout), { code: "BV_CONTROLE_GEWEIGERD" });
  }

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

  // ATOMAIRE verzendpoort: vergrendel de instellingen, mutatie én iedere
  // mogelijke BV-bron. Daarna herlezen en toetsen we binnen dezelfde transactie
  // en houden de locks vast tot de externe call plus exportmarkering klaar is.
  // Een wijziging kan dus niet tussen de BV-check en verzenden doorschuiven.
  const resultaat = await db.transaction(async (tx) => {
    const [versInst] = await tx
      .select()
      .from(accountviewInstellingenTable)
      .where(eq(accountviewInstellingenTable.id, 1))
      .for("update")
      .limit(1);
    if (!versInst) {
      throw Object.assign(
        new Error("AccountView is niet (meer) geconfigureerd; de magazijnboeking is afgebroken."),
        { code: "BV_CONTROLE_GEWEIGERD" },
      );
    }

    const [verseMutatie] = await tx
      .select({
        id: voorraadMutatiesTable.id,
        opdrachtId: voorraadMutatiesTable.opdrachtId,
        referentieType: voorraadMutatiesTable.referentieType,
        referentieId: voorraadMutatiesTable.referentieId,
        accountviewExportOp: voorraadMutatiesTable.accountviewExportOp,
      })
      .from(voorraadMutatiesTable)
      .where(eq(voorraadMutatiesTable.id, mutatieId))
      .for("update")
      .limit(1);
    if (!verseMutatie) {
      throw Object.assign(
        new Error(`Mutatie #${mutatieId} bestaat niet (meer); de magazijnboeking is afgebroken.`),
        { code: "BV_CONTROLE_GEWEIGERD" },
      );
    }
    if (verseMutatie.accountviewExportOp != null) {
      throw Object.assign(
        new Error(`AL_GEEXPORTEERD: Mutatie #${mutatieId} is al geëxporteerd op ${verseMutatie.accountviewExportOp.toISOString()}. Dubbele boeking voorkomen.`),
        { code: "AL_GEEXPORTEERD" },
      );
    }

    const vergrendeldeGebouwen = new Set<number>();
    const vergrendelGebouw = async (gebouwId: number | null | undefined): Promise<void> => {
      if (gebouwId == null || vergrendeldeGebouwen.has(gebouwId)) return;
      vergrendeldeGebouwen.add(gebouwId);
      await tx.select({ id: gebouwenTable.id })
        .from(gebouwenTable)
        .where(eq(gebouwenTable.id, gebouwId))
        .for("update")
        .limit(1);
    };
    const vergrendeldeOpdrachten = new Set<number>();
    const vergrendelOpdracht = async (opdrachtId: number | null | undefined): Promise<void> => {
      if (opdrachtId == null || vergrendeldeOpdrachten.has(opdrachtId)) return;
      vergrendeldeOpdrachten.add(opdrachtId);
      const [opdracht] = await tx
        .select({ gebouwId: opdrachtenTable.gebouwId })
        .from(opdrachtenTable)
        .where(eq(opdrachtenTable.id, opdrachtId))
        .for("update")
        .limit(1);
      await vergrendelGebouw(opdracht?.gebouwId);
    };

    // Ook zonder bestaande instellingenrij moet een gelijktijdige eerste
    // inrichting wachten tot deze verzendpoort klaar is.
    await tx.execute(sql`LOCK TABLE magazijn_instellingen IN SHARE ROW EXCLUSIVE MODE`);
    const [magazijnInstellingen] = await tx
      .select({ magazijnGebouwId: magazijnInstellingenTable.magazijnGebouwId })
      .from(magazijnInstellingenTable)
      .where(eq(magazijnInstellingenTable.id, 1))
      .for("update")
      .limit(1);
    await vergrendelGebouw(magazijnInstellingen?.magazijnGebouwId);
    await vergrendelOpdracht(verseMutatie.opdrachtId);

    if (verseMutatie.referentieType === "opdracht") {
      await vergrendelOpdracht(verseMutatie.referentieId);
    } else if (verseMutatie.referentieType === "inkooporder" && verseMutatie.referentieId != null) {
      const [inkooporder] = await tx
        .select({ gebouwId: magazijnInkoopordersTable.gebouwId })
        .from(magazijnInkoopordersTable)
        .where(eq(magazijnInkoopordersTable.id, verseMutatie.referentieId))
        .for("update")
        .limit(1);
      await vergrendelGebouw(inkooporder?.gebouwId);
    } else if (verseMutatie.referentieType === "picklijst" && verseMutatie.referentieId != null) {
      const [picklijst] = await tx
        .select({ opdrachtId: magazijnPicklijstenTable.opdrachtId })
        .from(magazijnPicklijstenTable)
        .where(eq(magazijnPicklijstenTable.id, verseMutatie.referentieId))
        .for("update")
        .limit(1);
      await vergrendelOpdracht(picklijst?.opdrachtId);
    } else if (verseMutatie.referentieType === "reservering" && verseMutatie.referentieId != null) {
      const [reservering] = await tx
        .select({ opdrachtId: reserveringenTable.opdrachtId })
        .from(reserveringenTable)
        .where(eq(reserveringenTable.id, verseMutatie.referentieId))
        .for("update")
        .limit(1);
      await vergrendelOpdracht(reservering?.opdrachtId);
    }

    const verseBvFout = await controleerMagazijnAdministratieBv(verseMutatie, versInst.werkgeverId ?? null, tx);
    if (verseBvFout) {
      throw Object.assign(new Error(verseBvFout), { code: "BV_CONTROLE_GEWEIGERD" });
    }
    if (!versInst.magazijnExportActief && !versInst.testmodus) {
      throw new Error("Magazijn-export is uitgeschakeld. Schakel 'Magazijnmutaties automatisch exporteren' in via Instellingen → AccountView.");
    }
    const grootboekVoorraad = versInst.grootboekVoorraad ?? versInst.grootboekStandaard ?? "";
    const grootboekInkoop = versInst.grootboekInkoopKosten ?? versInst.grootboekStandaard ?? "";
    if (!grootboekVoorraad || !grootboekInkoop) {
      throw new Error("Grootboekrekeningen voor magazijn zijn niet ingesteld. Vul 'Grootboek voorraad' en 'Grootboek inkoopkosten' in via Instellingen → AccountView.");
    }

    const client = maakAccountViewClient(versInst);
    let accountviewResultaat: AccountviewBoekingResultaat;
    try {
      accountviewResultaat = await client.verzendBoeking({
        dagboek: versInst.dagboekInkoop ?? "INK",
        administratiecode: versInst.administratiecode ?? "",
        factuurnummer: `MAG-${mutatieId}`,
        factuurdatum: datum,
        relatienaam: "Magazijn",
        omschrijving,
        bedragExclBtw: bedrag,
        btwBedrag: 0,
        bedragInclBtw: bedrag,
        grootboekrekening: isToename ? grootboekVoorraad : grootboekInkoop,
        creditRekening: isToename ? grootboekInkoop : grootboekVoorraad,
        type: "inkoop",
      });
    } catch (err) {
      throw new Error(`AccountView-verbindingsfout: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!accountviewResultaat.geslaagd) {
      const avFout = accountviewResultaat.foutmelding ?? `HTTP ${accountviewResultaat.httpStatus ?? "onbekend"}`;
      throw Object.assign(
        new Error(`AccountView weigerde de boeking: ${avFout}`),
        { code: "AV_GEWEIGERD", accountviewFout: avFout, httpStatus: accountviewResultaat.httpStatus },
      );
    }
    await tx.update(voorraadMutatiesTable)
      .set({ accountviewExportOp: new Date() })
      .where(eq(voorraadMutatiesTable.id, mutatieId));
    return accountviewResultaat;
  });

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
