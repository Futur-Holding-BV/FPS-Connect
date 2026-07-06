import { db, securityScanRunsTable, securityTestResultatenTable, securityReleasesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "../../lib/logger";
import type { TestScenario, TestResultaat, RunConfig, ScanSamenvatting, CategoryScore, TestCategorie } from "./types";
import { CATEGORIE_GEWICHTEN, ERNST_SCORE_AFTREK } from "./types";
import { aiAanvalScenarios } from "./test-library/ai-aanvallen";
import { uploadAanvalScenarios } from "./test-library/upload-aanvallen";
import { autorisatieScenarios } from "./test-library/autorisatie";
import { apiBeveiliginScenarios } from "./test-library/api-beveiliging";
import {
  authenticatieScenarios,
  governanceScenarios,
  businessLogicaScenarios,
  malwareScenarios,
  loggingScenarios,
  emailBeveiligingScenarios,
  mobielBeveiligingScenarios,
  infrastructuurScenarios,
  permissieScenarios,
} from "./test-library/overige-categorieen";

export const ALLE_SCENARIOS: TestScenario[] = [
  ...aiAanvalScenarios,
  ...uploadAanvalScenarios,
  ...autorisatieScenarios,
  ...apiBeveiliginScenarios,
  ...authenticatieScenarios,
  ...governanceScenarios,
  ...businessLogicaScenarios,
  ...malwareScenarios,
  ...loggingScenarios,
  ...emailBeveiligingScenarios,
  ...mobielBeveiligingScenarios,
  ...infrastructuurScenarios,
  ...permissieScenarios,
];

export function haalAllScenarios(categorieFilter?: TestCategorie[]): TestScenario[] {
  if (!categorieFilter || categorieFilter.length === 0) return ALLE_SCENARIOS;
  return ALLE_SCENARIOS.filter((s) => categorieFilter.includes(s.categorie));
}

async function voerHttpTestUit(scenario: TestScenario, config: RunConfig): Promise<TestResultaat> {
  if (!scenario.httpConfig) {
    return { uitkomst: "overgeslagen", bericht: "Geen HTTP-configuratie aanwezig" };
  }

  const { methode, pad, body, headers, verificatie } = scenario.httpConfig;
  const url = `${config.baseUrl}/api${pad}`;
  const start = Date.now();

  try {
    const resp = await fetch(url, {
      method: methode,
      headers: {
        "Content-Type": "application/json",
        ...(config.authCookie ? { Cookie: config.authCookie } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(8000),
    });

    const duurMs = Date.now() - start;
    const respText = await resp.text().catch(() => "");

    const statusOk = verificatie.verwachteStatussen.includes(resp.status);

    if (!statusOk) {
      return {
        uitkomst: "mislukt",
        bericht: `HTTP ${resp.status} — verwacht: ${verificatie.verwachteStatussen.join(" of ")}`,
        details: respText.substring(0, 500),
        aanbeveling: `Controleer of ${methode} ${pad} correct beveiligd is`,
        duurMs,
      };
    }

    if (verificatie.bodyBevatNiet) {
      for (const verboden of verificatie.bodyBevatNiet) {
        if (respText.toLowerCase().includes(verboden.toLowerCase())) {
          return {
            uitkomst: "mislukt",
            bericht: `Respons bevat verboden inhoud: "${verboden}"`,
            details: respText.substring(0, 500),
            duurMs,
          };
        }
      }
    }

    if (verificatie.verbodeneBody) {
      for (const verboden of verificatie.verbodeneBody) {
        if (respText.includes(verboden)) {
          return {
            uitkomst: "mislukt",
            bericht: `Verboden body-inhoud gevonden: "${verboden}"`,
            details: respText.substring(0, 500),
            duurMs,
          };
        }
      }
    }

    if (verificatie.vereisteHeaders) {
      for (const header of verificatie.vereisteHeaders) {
        if (!resp.headers.has(header)) {
          return {
            uitkomst: "waarschuwing",
            bericht: `Vereiste header ontbreekt: "${header}"`,
            aanbeveling: `Voeg de header "${header}" toe aan API-responses`,
            duurMs,
          };
        }
      }
    }

    if (verificatie.verbodeneHeaders) {
      for (const header of verificatie.verbodeneHeaders) {
        if (resp.headers.get(header.split(":")[0]?.trim() ?? header)) {
          return {
            uitkomst: "waarschuwing",
            bericht: `Verboden header aanwezig: "${header}"`,
            duurMs,
          };
        }
      }
    }

    return { uitkomst: "geslaagd", bericht: `HTTP ${resp.status} — zoals verwacht`, duurMs };
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "TimeoutError";
    return {
      uitkomst: "waarschuwing",
      bericht: isTimeout ? "Test time-out (>8s)" : `Verbindingsfout: ${String(err)}`,
      duurMs: Date.now() - start,
    };
  }
}

async function voerTestUit(scenario: TestScenario, config: RunConfig): Promise<TestResultaat> {
  if (scenario.uitvoering === "http") {
    return voerHttpTestUit(scenario, config);
  }
  if (scenario.uitvoering === "statisch" && scenario.statischeFunctie) {
    try {
      return scenario.statischeFunctie({ baseUrl: config.baseUrl, authCookie: config.authCookie });
    } catch (err) {
      return { uitkomst: "mislukt", bericht: `Statische test fout: ${String(err)}` };
    }
  }
  return { uitkomst: "overgeslagen", bericht: "Test niet uitvoerbaar in huidige omgeving" };
}

export async function startScanRun(
  config: RunConfig,
  gestarttDoor: number | null,
  gestarttDoorNaam: string | null,
  versieLabel?: string,
): Promise<number> {
  const scenarios = haalAllScenarios(config.categorieFilter);

  const [run] = await db
    .insert(securityScanRunsTable)
    .values({
      gestarttDoor,
      gestarttDoorNaam,
      type: "handmatig",
      status: "lopend",
      versieLabel: versieLabel ?? null,
      baseUrl: config.baseUrl,
      totaalTests: scenarios.length,
    })
    .returning({ id: securityScanRunsTable.id });

  if (!run) throw new Error("Kan scan-run niet aanmaken");
  const runId = run.id;

  voerScanUit(runId, scenarios, config).catch((err) => {
    logger.error({ err, runId }, "Scan-run fout");
  });

  return runId;
}

async function voerScanUit(runId: number, scenarios: TestScenario[], config: RunConfig): Promise<void> {
  const BATCH_GROOTTE = 15;
  const resultaten: Array<{ scenario: TestScenario; resultaat: TestResultaat }> = [];

  for (let i = 0; i < scenarios.length; i += BATCH_GROOTTE) {
    const batch = scenarios.slice(i, i + BATCH_GROOTTE);
    const batchResultaten = await Promise.all(
      batch.map(async (s) => ({ scenario: s, resultaat: await voerTestUit(s, config) })),
    );
    resultaten.push(...batchResultaten);

    if (resultaten.length % 100 === 0) {
      const tellers = berekenTellers(resultaten.map((r) => r.resultaat));
      await db
        .update(securityScanRunsTable)
        .set({ geslaagd: tellers.geslaagd, mislukt: tellers.mislukt, waarschuwingen: tellers.waarschuwingen, overgeslagen: tellers.overgeslagen, kritiekMislukt: tellers.kritiekMislukt, bijgewerktOp: new Date() })
        .where(eq(securityScanRunsTable.id, runId));
    }
  }

  await db.insert(securityTestResultatenTable).values(
    resultaten.map(({ scenario, resultaat }) => ({
      scanRunId: runId,
      testId: scenario.id,
      categorie: scenario.categorie,
      subcategorie: scenario.subcategorie,
      naam: scenario.naam,
      beschrijving: scenario.beschrijving,
      ernst: scenario.ernst,
      uitkomst: resultaat.uitkomst,
      bericht: resultaat.bericht,
      details: resultaat.details ?? null,
      aanbeveling: resultaat.aanbeveling ?? null,
      duurMs: resultaat.duurMs ?? null,
    })),
  );

  const categoryScores = berekenCategoryScores(resultaten.map((r) => ({ scenario: r.scenario, resultaat: r.resultaat })));
  const totaalScore = berekenTotaalScore(categoryScores);
  const tellers = berekenTellers(resultaten.map((r) => r.resultaat));
  const samenvatting = maakSamenvatting(categoryScores, resultaten, totaalScore);

  const scoreVelden: Record<string, number | null> = {};
  for (const cs of categoryScores) {
    const veld = categorieTotaalVeld(cs.categorie);
    if (veld) scoreVelden[veld] = cs.score;
  }

  const geblokkeerd = tellers.kritiekMislukt > 0 || totaalScore < 95;

  await db
    .update(securityScanRunsTable)
    .set({
      status: "voltooid",
      voltooidOp: new Date(),
      bijgewerktOp: new Date(),
      geslaagd: tellers.geslaagd,
      mislukt: tellers.mislukt,
      waarschuwingen: tellers.waarschuwingen,
      overgeslagen: tellers.overgeslagen,
      kritiekMislukt: tellers.kritiekMislukt,
      scoreTotaal: totaalScore,
      scoreInfrastructuur: scoreVelden["scoreInfrastructuur"] ?? null,
      scoreAuthenticatie: scoreVelden["scoreAuthenticatie"] ?? null,
      scoreAutorisatie: scoreVelden["scoreAutorisatie"] ?? null,
      scoreApiBeveiliging: scoreVelden["scoreApiBeveiliging"] ?? null,
      scoreUploadBeveiliging: scoreVelden["scoreUploadBeveiliging"] ?? null,
      scoreMalware: scoreVelden["scoreMalware"] ?? null,
      scoreAiBeveiliging: scoreVelden["scoreAiBeveiliging"] ?? null,
      scoreGovernance: scoreVelden["scoreGovernance"] ?? null,
      scoreBusinessLogica: scoreVelden["scoreBusinessLogica"] ?? null,
      scoreLogging: scoreVelden["scoreLogging"] ?? null,
      scoreEmailBeveiliging: scoreVelden["scoreEmailBeveiliging"] ?? null,
      scoreMobielBeveiliging: scoreVelden["scoreMobielBeveiliging"] ?? null,
      releaseGeblokkeerd: geblokkeerd,
      releaseBlokkedeReden: geblokkeerd
        ? tellers.kritiekMislukt > 0
          ? `${tellers.kritiekMislukt} kritieke bevindingen gevonden`
          : `Totaalscore ${totaalScore.toFixed(1)}% onder minimum van 95%`
        : null,
      samenvatting: samenvatting as unknown as Record<string, unknown>,
    })
    .where(eq(securityScanRunsTable.id, runId));

  await db.insert(securityReleasesTable).values({
    scanRunId: runId,
    versieLabel: (await db.select({ v: securityScanRunsTable.versieLabel }).from(securityScanRunsTable).where(eq(securityScanRunsTable.id, runId)).limit(1))[0]?.v ?? null,
    status: geblokkeerd ? "geblokkeerd" : "wacht",
    scoreTotaal: totaalScore,
    kritiekMislukt: tellers.kritiekMislukt,
    minScore: 95,
    geblokkeerd,
    blokkedeReden: geblokkeerd
      ? tellers.kritiekMislukt > 0
        ? `${tellers.kritiekMislukt} kritieke bevindingen`
        : `Score ${totaalScore.toFixed(1)}% < 95%`
      : null,
  });

  logger.info({ runId, totaalScore, geslaagd: tellers.geslaagd, mislukt: tellers.mislukt }, "Security scan voltooid");
}

function berekenTellers(resultaten: TestResultaat[]) {
  return {
    geslaagd: resultaten.filter((r) => r.uitkomst === "geslaagd").length,
    mislukt: resultaten.filter((r) => r.uitkomst === "mislukt").length,
    waarschuwingen: resultaten.filter((r) => r.uitkomst === "waarschuwing").length,
    overgeslagen: resultaten.filter((r) => r.uitkomst === "overgeslagen").length,
    kritiekMislukt: 0,
  };
}

function berekenCategoryScores(
  resultaten: Array<{ scenario: TestScenario; resultaat: TestResultaat }>,
): CategoryScore[] {
  const perCategorie = new Map<TestCategorie, typeof resultaten>();
  for (const r of resultaten) {
    const lijst = perCategorie.get(r.scenario.categorie) ?? [];
    lijst.push(r);
    perCategorie.set(r.scenario.categorie, lijst);
  }

  const scores: CategoryScore[] = [];
  for (const [categorie, items] of perCategorie.entries()) {
    const geslaagd = items.filter((i) => i.resultaat.uitkomst === "geslaagd").length;
    const mislukt = items.filter((i) => i.resultaat.uitkomst === "mislukt").length;
    const waarschuwingen = items.filter((i) => i.resultaat.uitkomst === "waarschuwing").length;
    const overgeslagen = items.filter((i) => i.resultaat.uitkomst === "overgeslagen").length;

    let aftrek = 0;
    for (const item of items) {
      if (item.resultaat.uitkomst === "mislukt") {
        aftrek += ERNST_SCORE_AFTREK[item.scenario.ernst] ?? 5;
      } else if (item.resultaat.uitkomst === "waarschuwing") {
        aftrek += (ERNST_SCORE_AFTREK[item.scenario.ernst] ?? 5) * 0.3;
      }
    }

    const kritiekMislukt = items.filter(
      (i) => i.resultaat.uitkomst === "mislukt" && i.scenario.ernst === "kritiek",
    ).length;

    const score = Math.max(0, Math.min(100, 100 - aftrek));
    scores.push({ categorie, totaal: items.length, geslaagd, mislukt, waarschuwingen, overgeslagen, kritiekMislukt, score });
  }

  return scores;
}

function berekenTotaalScore(categoryScores: CategoryScore[]): number {
  let gewogenSom = 0;
  let totaalGewicht = 0;
  for (const cs of categoryScores) {
    const gewicht = CATEGORIE_GEWICHTEN[cs.categorie] ?? 5;
    gewogenSom += cs.score * gewicht;
    totaalGewicht += gewicht;
  }
  return totaalGewicht > 0 ? gewogenSom / totaalGewicht : 0;
}

function maakSamenvatting(
  categoryScores: CategoryScore[],
  resultaten: Array<{ scenario: TestScenario; resultaat: TestResultaat }>,
  totaalScore: number,
): ScanSamenvatting {
  const topBevindingen = resultaten
    .filter((r) => r.resultaat.uitkomst === "mislukt" || r.resultaat.uitkomst === "waarschuwing")
    .sort((a, b) => {
      const ernstVolgorde = { kritiek: 0, hoog: 1, middel: 2, laag: 3, info: 4 };
      return (ernstVolgorde[a.scenario.ernst] ?? 4) - (ernstVolgorde[b.scenario.ernst] ?? 4);
    })
    .slice(0, 20)
    .map((r) => ({
      testId: r.scenario.id,
      naam: r.scenario.naam,
      ernst: r.scenario.ernst,
      bericht: r.resultaat.bericht,
      categorie: r.scenario.categorie,
    }));

  const kritiekMislukt = categoryScores.reduce((s, c) => s + c.kritiekMislukt, 0);

  return {
    categoryScores,
    topBevindingen,
    releaseAdvies: kritiekMislukt > 0 ? "afgewezen" : totaalScore < 95 ? "waarschuwing" : "goedgekeurd",
    releaseReden:
      kritiekMislukt > 0
        ? `${kritiekMislukt} kritieke bevindingen — release geblokkeerd`
        : totaalScore < 95
          ? `Totaalscore ${totaalScore.toFixed(1)}% ligt onder minimum van 95%`
          : `Alle checks geslaagd — score ${totaalScore.toFixed(1)}%`,
  };
}

function categorieTotaalVeld(categorie: TestCategorie): string | null {
  const map: Record<TestCategorie, string> = {
    infrastructuur: "scoreInfrastructuur",
    authenticatie: "scoreAuthenticatie",
    autorisatie: "scoreAutorisatie",
    "api-beveiliging": "scoreApiBeveiliging",
    "upload-beveiliging": "scoreUploadBeveiliging",
    malware: "scoreMalware",
    "ai-beveiliging": "scoreAiBeveiliging",
    governance: "scoreGovernance",
    "business-logica": "scoreBusinessLogica",
    logging: "scoreLogging",
    "email-beveiliging": "scoreEmailBeveiliging",
    "mobiel-beveiliging": "scoreMobielBeveiliging",
  };
  return map[categorie] ?? null;
}

export async function haalScanStats() {
  const totaalScenarios = ALLE_SCENARIOS.length;
  const perCategorie = Object.keys(CATEGORIE_GEWICHTEN).map((cat) => ({
    categorie: cat,
    aantal: ALLE_SCENARIOS.filter((s) => s.categorie === cat).length,
  }));

  const [laatste] = await db
    .select()
    .from(securityScanRunsTable)
    .orderBy(sql`${securityScanRunsTable.gestarttOp} DESC`)
    .limit(1);

  return { totaalScenarios, perCategorie, laasteScan: laatste ?? null };
}
