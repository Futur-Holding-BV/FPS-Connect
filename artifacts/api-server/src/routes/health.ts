import { execSync } from "node:child_process";
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

// Versie-informatie wordt bij de productie-build in het image gebakken via de
// omgevingsvariabelen GIT_COMMIT en BUILD_TIJD (zie deploy/Dockerfile.api en
// scripts/deploy-production.sh). In dev vallen we terug op de lokale git.
function bepaalCommit(): string {
  if (process.env.GIT_COMMIT && process.env.GIT_COMMIT !== "onbekend") {
    return process.env.GIT_COMMIT;
  }
  try {
    return execSync("git rev-parse --short HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return "onbekend";
  }
}

const COMMIT = bepaalCommit();
const GEBOUWD_OP = process.env.BUILD_TIJD ?? "";
const DEPLOY_NUMMER = process.env.DEPLOY_NUMMER ?? "";
const VERSIE = `${
  GEBOUWD_OP ? GEBOUWD_OP.slice(0, 10).replaceAll("-", ".") : "dev"
}-${COMMIT}`;

router.get("/", (_req, res) => {
  res.json({ status: "ok" });
});

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/versie", (_req, res) => {
  res.json({ versie: VERSIE, commit: COMMIT, gebouwd_op: GEBOUWD_OP });
});

// GET /api/status — productie-statusoverzicht (FASE 4)
// Toont actieve commit, build-tijdstip, deploy-nummer, DB-verbinding en API-status.
// Geen secrets of gevoelige infrastructuurinformatie; veilig publiek bereikbaar.
router.get("/status", async (_req, res): Promise<void> => {
  let dbStatus: "ok" | "fout" = "fout";
  let dbLatencyMs: number | null = null;
  try {
    const start = Date.now();
    await db.execute(sql`SELECT 1`);
    dbLatencyMs = Date.now() - start;
    dbStatus = "ok";
  } catch {
    dbStatus = "fout";
  }

  res.json({
    api_status: "ok",
    commit: COMMIT,
    versie: VERSIE,
    gebouwd_op: GEBOUWD_OP || null,
    deploy_nummer: DEPLOY_NUMMER || null,
    db_verbinding: dbStatus,
    db_latency_ms: dbLatencyMs,
    timestamp: new Date().toISOString(),
    omgeving: process.env.NODE_ENV ?? "development",
  });
});

export default router;
