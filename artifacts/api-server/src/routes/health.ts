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

// UITROL_BEWAKING_01: naast de eigen versie melden we of productie achterloopt
// op de laatst gemelde uitrol (tabel uitrol_rapporten, gevuld door de
// deploy-workflow). Kort gecachet zodat de badge-polling de DB niet belast.
let achterloopCache: { tot: number; achterloop: boolean; verwacht: string } | null = null;
async function bepaalAchterloop(): Promise<{ achterloop: boolean; verwacht: string }> {
  if (achterloopCache && Date.now() < achterloopCache.tot) return achterloopCache;
  let achterloop = false;
  let verwacht = "";
  try {
    if (COMMIT !== "onbekend") {
      const rijen = await db.execute(
        sql`SELECT commit_sha FROM uitrol_rapporten ORDER BY run_id DESC NULLS LAST, id DESC LIMIT 1`,
      );
      const sha = (rijen.rows?.[0] as { commit_sha?: string } | undefined)?.commit_sha ?? "";
      if (sha) {
        verwacht = sha.slice(0, 8);
        achterloop = !sha.startsWith(COMMIT);
      }
    }
  } catch {
    // Geen rapporten of DB-hapering: nooit de versie-informatie blokkeren.
    achterloop = false;
  }
  achterloopCache = { tot: Date.now() + 30_000, achterloop, verwacht };
  return achterloopCache;
}

router.get("/versie", async (_req, res): Promise<void> => {
  const { achterloop, verwacht } = await bepaalAchterloop();
  res.json({
    versie: VERSIE,
    commit: COMMIT,
    gebouwd_op: GEBOUWD_OP,
    achterloop,
    verwacht_commit: verwacht,
  });
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

// ── Systeemstatus: verbindingen pingen ────────────────────────────────────────
// Pings de vier kritieke subsystemen en retourneert "ok" / "fout" /
// "niet_geconfigureerd" per component. Publiek endpoint (geen auth vereist)
// zodat de GitHub Actions smoketest het ook zonder sessie kan bevragen.
type StatusWaarde = "ok" | "fout" | "niet_geconfigureerd";

async function pingDb(): Promise<StatusWaarde> {
  try {
    await db.execute(sql`SELECT 1`);
    return "ok";
  } catch {
    return "fout";
  }
}

function checkOpslag(): StatusWaarde {
  const bucket = process.env.S3_BUCKET ?? "";
  const gcsBucket = process.env.GCS_BUCKET ?? process.env.GOOGLE_CLOUD_BUCKET ?? "";
  if (!bucket && !gcsBucket) return "niet_geconfigureerd";
  return "ok";
}

function checkMail(): StatusWaarde {
  const clientId = process.env.AZURE_CLIENT_ID ?? "";
  const mailbox = process.env.MAIL_MAILBOX ?? "";
  if (!clientId || !mailbox) return "niet_geconfigureerd";
  return "ok";
}

function checkAi(): StatusWaarde {
  const openaiKey = process.env.OPENAI_API_KEY ?? "";
  const integrationsKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? "";
  if (!openaiKey && !integrationsKey) return "niet_geconfigureerd";
  return "ok";
}

router.get("/versie/status", async (_req, res) => {
  const [db_status, opslag, mail, ai] = await Promise.all([
    pingDb(),
    Promise.resolve(checkOpslag()),
    Promise.resolve(checkMail()),
    Promise.resolve(checkAi()),
  ]);

  res.json({
    db: db_status,
    opslag,
    mail,
    ai,
    aangemaakt_op: new Date().toISOString(),
  });
});

export default router;
