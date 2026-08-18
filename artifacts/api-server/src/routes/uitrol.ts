import { timingSafeEqual } from "node:crypto";
import { Router, type IRouter } from "express";
import { db, uitrolRapportenTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { voedUitrolAchterloop } from "../lib/bewakingsloop";

// UITROL_BEWAKING_01 — terugmelding van de deploy-workflow (GitHub Actions).
// Publiek bereikbaar (de runner heeft geen sessie) maar beveiligd met een
// gedeelde sleutel: UITROL_RAPPORT_SLEUTEL staat als GitHub Actions secret op
// de workflow én wordt via het deployscript in de api-container gezet.
// Fail-closed: zonder geconfigureerde sleutel accepteert dit endpoint niets.
const router: IRouter = Router();

function sleutelGeldig(opgegeven: unknown): boolean {
  const verwacht = process.env.UITROL_RAPPORT_SLEUTEL ?? "";
  if (!verwacht || typeof opgegeven !== "string" || opgegeven.length === 0) return false;
  const a = Buffer.from(opgegeven);
  const b = Buffer.from(verwacht);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

router.post("/uitrol/rapport", async (req, res): Promise<void> => {
  if (!process.env.UITROL_RAPPORT_SLEUTEL) {
    res.status(503).json({ fout: "Uitrol-terugmelding is niet geconfigureerd op deze server" });
    return;
  }
  if (!sleutelGeldig(req.header("x-uitrol-sleutel"))) {
    res.status(401).json({ fout: "Ongeldige of ontbrekende uitrol-sleutel" });
    return;
  }

  const { commit, conclusie, falende_stap, run_url } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof commit !== "string" || !/^[0-9a-f]{40}$/.test(commit)) {
    res.status(400).json({ fout: "commit moet een volledige 40-teken hex-SHA zijn" });
    return;
  }
  if (conclusie !== "success" && conclusie !== "failure" && conclusie !== "cancelled") {
    res.status(400).json({ fout: "conclusie moet success, failure of cancelled zijn" });
    return;
  }
  // Geannuleerde runs (ingehaald door een nieuwere push) zeggen niets over de
  // stand van productie: de nieuwere run meldt zich zelf. Niet opslaan.
  if (conclusie === "cancelled") {
    res.status(200).json({ genegeerd: true });
    return;
  }
  const stap = typeof falende_stap === "string" && falende_stap.trim() !== ""
    ? falende_stap.slice(0, 300)
    : null;
  const url = typeof run_url === "string" && run_url.startsWith("https://github.com/")
    ? run_url.slice(0, 500)
    : null;
  const runId = typeof req.body?.run_id === "number" && Number.isFinite(req.body.run_id) && req.body.run_id > 0
    ? Math.floor(req.body.run_id)
    : null;

  const [rij] = await db
    .insert(uitrolRapportenTable)
    .values({ commitSha: commit, conclusie, falendeStap: stap, runUrl: url, runId })
    .returning({ id: uitrolRapportenTable.id });

  // Direct de werkbak bijwerken (openen bij achterloop, sluiten bij herstel);
  // de periodieke bewakingsloop is het vangnet als dit hier misgaat.
  let werkbak: { nieuw: number; afgehandeld: number } | null = null;
  try {
    werkbak = await voedUitrolAchterloop();
  } catch (err) {
    logger.error({ err }, "uitrol-rapport: werkbak bijwerken mislukt (bewakingsloop haalt dit in)");
  }
  logger.info({ rapportId: rij.id, commit: commit.slice(0, 8), conclusie, stap }, "uitrol-rapport ontvangen");
  res.status(201).json({ id: rij.id, werkbak });
});

export default router;
