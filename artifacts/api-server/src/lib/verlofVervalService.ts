/**
 * Verlof-verval service
 *
 * Twee verantwoordelijkheden:
 * 1. Dagelijkse achtergrondtaak die verlofSaldi afboekt zodra vervaltOp <= vandaag
 * 2. Signalering-query voor de frontend (GET /verlof/vervalsignalen)
 *
 * Patroon: recursieve setTimeout — zelfde als backupService.
 */
import { db } from "@workspace/db";
import {
  verlofSaldiTable,
  verlofsoortenTable,
  medewerkersTable,
} from "@workspace/db";
import { and, gt, gte, isNotNull, lte, eq } from "drizzle-orm";
import { logger } from "./logger";

const MS_PER_DAG = 24 * 60 * 60 * 1000;

function vandaagIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function msTotVolgendeMiddernacht(): number {
  const nu = new Date();
  const morgen = new Date(nu);
  morgen.setDate(morgen.getDate() + 1);
  morgen.setHours(0, 2, 0, 0); // 00:02 — kleine marge na middernacht
  return Math.max(morgen.getTime() - nu.getTime(), 60_000);
}

// ── Verval-afboeking ──────────────────────────────────────────────────────────

export async function voerVerlofVervalUit(): Promise<{
  verwerkt: number;
  totaalUrenAfgeboekt: number;
}> {
  const vandaag = vandaagIso();

  const verlopenSaldi = await db
    .select({ s: verlofSaldiTable })
    .from(verlofSaldiTable)
    .where(
      and(
        isNotNull(verlofSaldiTable.vervaltOp),
        lte(verlofSaldiTable.vervaltOp, vandaag),
        gt(verlofSaldiTable.saldoUren, 0),
      ),
    );

  if (verlopenSaldi.length === 0) return { verwerkt: 0, totaalUrenAfgeboekt: 0 };

  const nu = new Date();
  let totaalUren = 0;

  for (const { s } of verlopenSaldi) {
    const urensAfgeboekt = s.saldoUren;
    const nieuweOpgenomen = Math.round((s.opgenomenUren + urensAfgeboekt) * 10) / 10;

    await db
      .update(verlofSaldiTable)
      .set({
        opgenomenUren: nieuweOpgenomen,
        saldoUren: 0,
        bijgewerktOp: nu,
      })
      .where(eq(verlofSaldiTable.id, s.id));

    totaalUren += urensAfgeboekt;
    logger.info(
      {
        saldo_id: s.id,
        medewerker_id: s.medewerkerId,
        verlofsoort_id: s.verlofsoortId,
        jaar: s.jaar,
        vervalt_op: s.vervaltOp,
        afgeboekt_uren: urensAfgeboekt,
        actie: "verlof_verval_afboeking",
      },
      "verlof-verval: saldo afgeboekt",
    );
  }

  return {
    verwerkt: verlopenSaldi.length,
    totaalUrenAfgeboekt: Math.round(totaalUren * 10) / 10,
  };
}

// ── Signalering ───────────────────────────────────────────────────────────────

export type Vervalsignaal = {
  saldo_id: number;
  medewerker_id: number;
  medewerker_naam: string | null;
  verlofsoort_id: number;
  verlofsoort_naam: string | null;
  verlofsoort_categorie: string | null;
  jaar: number;
  saldo_uren: number;
  vervalt_op: string;
  dagen_tot_verval: number;
  urgentie: "kritiek" | "waarschuwing" | "info";
};

export async function haalVervalsignalen(dagvenster: number = 90): Promise<Vervalsignaal[]> {
  const vandaag = vandaagIso();
  const grens = new Date();
  grens.setDate(grens.getDate() + dagvenster);
  const grensDatum = grens.toISOString().slice(0, 10);

  const rijen = await db
    .select({
      s: verlofSaldiTable,
      verlofsoortNaam: verlofsoortenTable.naam,
      verlofsoortCategorie: verlofsoortenTable.categorie,
      medewerkerNaam: medewerkersTable.naam,
    })
    .from(verlofSaldiTable)
    .leftJoin(verlofsoortenTable, eq(verlofSaldiTable.verlofsoortId, verlofsoortenTable.id))
    .leftJoin(medewerkersTable, eq(verlofSaldiTable.medewerkerId, medewerkersTable.id))
    .where(
      and(
        isNotNull(verlofSaldiTable.vervaltOp),
        gte(verlofSaldiTable.vervaltOp, vandaag),
        lte(verlofSaldiTable.vervaltOp, grensDatum),
        gt(verlofSaldiTable.saldoUren, 0),
      ),
    );

  return rijen.map(({ s, verlofsoortNaam, verlofsoortCategorie, medewerkerNaam }) => {
    const msVerval = new Date(s.vervaltOp!).getTime();
    const msVandaag = new Date(vandaag).getTime();
    const dagenTotVerval = Math.ceil((msVerval - msVandaag) / MS_PER_DAG);
    const urgentie: Vervalsignaal["urgentie"] =
      dagenTotVerval <= 14 ? "kritiek" : dagenTotVerval <= 30 ? "waarschuwing" : "info";

    return {
      saldo_id: s.id,
      medewerker_id: s.medewerkerId,
      medewerker_naam: medewerkerNaam ?? null,
      verlofsoort_id: s.verlofsoortId,
      verlofsoort_naam: verlofsoortNaam ?? null,
      verlofsoort_categorie: verlofsoortCategorie ?? null,
      jaar: s.jaar,
      saldo_uren: s.saldoUren,
      vervalt_op: s.vervaltOp!,
      dagen_tot_verval: dagenTotVerval,
      urgentie,
    };
  });
}

// ── Dagelijkse scheduler ──────────────────────────────────────────────────────

function planVolgendeRun(): void {
  const wachtMs = msTotVolgendeMiddernacht();
  setTimeout(async () => {
    try {
      const resultaat = await voerVerlofVervalUit();
      if (resultaat.verwerkt > 0) {
        logger.info(resultaat, "verlof-verval: dagelijkse run voltooid");
      }
    } catch (err) {
      logger.error({ err }, "verlof-verval: dagelijkse run mislukt");
    }
    planVolgendeRun();
  }, wachtMs).unref();
}

export function startVerlofVervalService(): void {
  // Direct bij start uitvoeren (vangt gemiste vervaldatums op bij herstart)
  voerVerlofVervalUit()
    .then((r) => {
      if (r.verwerkt > 0) logger.info(r, "verlof-verval: startup-run voltooid");
    })
    .catch((err) => logger.error({ err }, "verlof-verval: startup-run mislukt"));

  planVolgendeRun();
  logger.info("verlof-verval: dagelijkse scheduler gestart");
}
