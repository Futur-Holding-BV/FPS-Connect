import { db, cqoRunsTable, cqoBevindingTable, cqoVerbeterpuntTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../../lib/logger";
import { aiGateway, heeftGateway } from "../../lib/aiGateway";
import { FPS_PLATFORM_CONTEXT } from "./fps-context";
import { SPECIALISTEN } from "./specialisten";
import {
  CATEGORIE_GEWICHTEN,
  bepaalReleaseStatus,
  type CqoCategorieScores,
  type SpecialistBevinding,
  type SpecialistVerbeterpunt,
  type SpecialistResultaat,
} from "./types";

// ── AI-aanroep per specialist ────────────────────────────────────────────────

async function beoordeelSpecialist(
  specialist: (typeof SPECIALISTEN)[number],
  runId: number,
  gebruikerId: number
): Promise<SpecialistResultaat> {
  if (!heeftGateway()) {
    return maakFallbackResultaat(specialist, "AI-gateway niet beschikbaar");
  }

  const userContent = `${FPS_PLATFORM_CONTEXT}\n\n---\n\nBeoordeel het FPS Connect platform uitsluitend vanuit jouw perspectief als ${specialist.naam}. Categorie die jij beoordeelt: **${specialist.categorie}**. Score 0-100 voor deze categorie.`;

  try {
    const resultaat = await aiGateway.chat(
      "default",
      {
        messages: [
          { role: "system", content: specialist.systemPrompt },
          { role: "user", content: userContent },
        ],
        response_format: { type: "json_object" },
        max_tokens: 1800,
      },
      90000,
      {
        module: "cqo",
        functie: `beoordeel-${specialist.id}`,
        gebruikerId,
        entiteitId: runId,
        entiteitstype: "cqo_run",
      }
    );

    const content = resultaat.ok ? resultaat.inhoud : "{}";
    const parsed = JSON.parse(content) as {
      score?: unknown;
      samenvatting?: unknown;
      bevindingen?: unknown[];
      verbeterpunten?: unknown[];
    };

    const score = typeof parsed.score === "number"
      ? Math.max(0, Math.min(100, parsed.score))
      : 50;

    const samenvatting =
      typeof parsed.samenvatting === "string" ? parsed.samenvatting : "Geen samenvatting beschikbaar.";

    const bevindingen = (Array.isArray(parsed.bevindingen) ? parsed.bevindingen : [])
      .slice(0, 10)
      .map((b): SpecialistBevinding => {
        const bv = b as Record<string, unknown>;
        return {
          ernst: isErnst(bv["ernst"]) ? bv["ernst"] : "gemiddeld",
          titel: String(bv["titel"] ?? "Bevinding"),
          bevinding: String(bv["bevinding"] ?? ""),
          impact: bv["impact"] ? String(bv["impact"]) : undefined,
          oplossing: bv["oplossing"] ? String(bv["oplossing"]) : undefined,
          positief: bv["positief"] === true,
        };
      });

    const verbeterpunten = (Array.isArray(parsed.verbeterpunten) ? parsed.verbeterpunten : [])
      .slice(0, 6)
      .map((v): SpecialistVerbeterpunt => {
        const vp = v as Record<string, unknown>;
        return {
          urgentie: isUrgentie(vp["urgentie"]) ? vp["urgentie"] : "gemiddeld",
          titel: String(vp["titel"] ?? "Verbeterpunt"),
          probleem: String(vp["probleem"] ?? ""),
          oplossing: String(vp["oplossing"] ?? ""),
          verwachteVerbetering: vp["verwachteVerbetering"]
            ? String(vp["verwachteVerbetering"])
            : undefined,
        };
      });

    return {
      specialistId: specialist.id,
      specialistNaam: specialist.naam,
      categorie: specialist.categorie,
      score,
      samenvatting,
      bevindingen,
      verbeterpunten,
    };
  } catch (err) {
    logger.warn({ err, specialistId: specialist.id }, "CQO: specialist-beoordeling mislukt");
    return maakFallbackResultaat(
      specialist,
      err instanceof Error ? err.message : "Onbekende fout"
    );
  }
}

function maakFallbackResultaat(
  specialist: (typeof SPECIALISTEN)[number],
  reden: string
): SpecialistResultaat {
  return {
    specialistId: specialist.id,
    specialistNaam: specialist.naam,
    categorie: specialist.categorie,
    score: 50,
    samenvatting: `Automatische beoordeling niet beschikbaar (${reden}). Score van 50 is een neutrale standaardwaarde.`,
    bevindingen: [
      {
        ernst: "info",
        titel: "Beoordeling niet beschikbaar",
        bevinding: `De AI-beoordeling door ${specialist.naam} kon niet worden voltooid: ${reden}`,
        positief: false,
      },
    ],
    verbeterpunten: [],
  };
}

// ── Hulpfuncties ─────────────────────────────────────────────────────────────

const ERNST_VALUES = ["info", "laag", "gemiddeld", "hoog", "kritiek"] as const;
const URGENTIE_VALUES = ["laag", "gemiddeld", "hoog", "kritiek"] as const;

function isErnst(v: unknown): v is (typeof ERNST_VALUES)[number] {
  return typeof v === "string" && (ERNST_VALUES as readonly string[]).includes(v);
}
function isUrgentie(v: unknown): v is (typeof URGENTIE_VALUES)[number] {
  return typeof v === "string" && (URGENTIE_VALUES as readonly string[]).includes(v);
}

// ── Scoring & aggregatie ─────────────────────────────────────────────────────

function berekenTotaalScore(categorieScores: CqoCategorieScores): number {
  let gewogenSom = 0;
  let totaalGewicht = 0;
  for (const [cat, gewicht] of Object.entries(CATEGORIE_GEWICHTEN)) {
    const score = categorieScores[cat as keyof CqoCategorieScores];
    if (score !== undefined) {
      gewogenSom += score * gewicht;
      totaalGewicht += gewicht;
    }
  }
  if (totaalGewicht === 0) return 0;
  return Math.round((gewogenSom / totaalGewicht) * 10) / 10;
}

// ── Hoofd-engine ─────────────────────────────────────────────────────────────

export async function voerCqoBeoordelingUit(
  runId: number,
  gebruikerId: number
): Promise<void> {
  logger.info({ runId }, "CQO: beoordeling gestart");

  try {
    // Alle 15 specialisten parallel uitvoeren (max 3 gelijktijdig om AI-quota te sparen)
    const resultaten: SpecialistResultaat[] = [];
    const BATCH_SIZE = 3;

    for (let i = 0; i < SPECIALISTEN.length; i += BATCH_SIZE) {
      const batch = SPECIALISTEN.slice(i, i + BATCH_SIZE);
      const batchResultaten = await Promise.all(
        batch.map((s) => beoordeelSpecialist(s, runId, gebruikerId))
      );
      resultaten.push(...batchResultaten);
    }

    // Categorie-scores verzamelen
    const categorieScores: CqoCategorieScores = {};
    for (const resultaat of resultaten) {
      categorieScores[resultaat.categorie] = resultaat.score;
    }

    // Bevindingen en verbeterpunten in DB opslaan
    const alleBevindingen = resultaten.flatMap((r) =>
      r.bevindingen.map((b) => ({
        runId,
        specialist: r.specialistId,
        categorie: r.categorie,
        ernst: b.ernst,
        titel: b.titel.slice(0, 200),
        bevinding: b.bevinding,
        impact: b.impact ?? null,
        urgentie: b.urgentie ?? null,
        betrokkenModules: b.betrokkenModules ?? null,
        risico: b.risico ?? null,
        oplossing: b.oplossing ?? null,
        verwachteVerbetering: b.verwachteVerbetering ?? null,
        positief: b.positief ?? false,
      }))
    );

    const alleVerbeterpunten = resultaten.flatMap((r) =>
      r.verbeterpunten.map((v) => ({
        runId,
        specialist: r.specialistId,
        categorie: r.categorie,
        urgentie: v.urgentie,
        titel: v.titel.slice(0, 200),
        probleem: v.probleem,
        impact: v.impact ?? null,
        betrokkenModules: v.betrokkenModules ?? null,
        risico: v.risico ?? null,
        oplossing: v.oplossing,
        verwachteVerbetering: v.verwachteVerbetering ?? null,
      }))
    );

    if (alleBevindingen.length > 0) {
      await db.insert(cqoBevindingTable).values(alleBevindingen);
    }
    if (alleVerbeterpunten.length > 0) {
      await db.insert(cqoVerbeterpuntTable).values(alleVerbeterpunten);
    }

    // Totaalscore berekenen
    const totaalScore = berekenTotaalScore(categorieScores);

    const aantalKritiek = alleBevindingen.filter((b) => b.ernst === "kritiek" && !b.positief).length;
    const aantalHoog = alleBevindingen.filter((b) => b.ernst === "hoog" && !b.positief).length;

    const { status, geblokkeerd, reden } = bepaalReleaseStatus(
      totaalScore,
      aantalKritiek,
      aantalHoog,
      categorieScores
    );

    // Run-record bijwerken met eindresultaten
    await db
      .update(cqoRunsTable)
      .set({
        status: "voltooid",
        voltooidOp: new Date(),
        totaalScore: String(totaalScore),
        releaseStatus: status,
        releaseGeblokkeerd: geblokkeerd,
        blokkeringReden: reden,
        categorieScores,
        aantalBevindingen: alleBevindingen.length,
        aantalKritiek,
        aantalHoog,
        aantalVerbeterpunten: alleVerbeterpunten.length,
        bijgewerktOp: new Date(),
      })
      .where(eq(cqoRunsTable.id, runId));

    logger.info(
      { runId, totaalScore, status, aantalKritiek, aantalHoog },
      "CQO: beoordeling voltooid"
    );
  } catch (err) {
    logger.error({ err, runId }, "CQO: beoordeling mislukt");
    await db
      .update(cqoRunsTable)
      .set({ status: "mislukt", voltooidOp: new Date(), bijgewerktOp: new Date() })
      .where(eq(cqoRunsTable.id, runId));
  }
}
