import { execSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { Router, type IRouter } from "express";
import {
  backupRecordsTable,
  db,
  mailLogboekTable,
} from "@workspace/db";
import { desc, eq, inArray, sql } from "drizzle-orm";
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
      // CI_SIGNAAL_01: de nieuwste gemelde main-commit komt uit uitrol- ÉN
      // ci-rapporten (CI meldt élke main-push, ook als de deploy vroeg strandt).
      // GitHub run-id's zijn per repository monotoon over workflows heen, dus
      // over beide tabellen samen ordenen op run_id is deterministisch.
      const rijen = await db.execute(
        sql`SELECT commit_sha FROM (
              SELECT commit_sha, run_id, id, 1 AS b FROM uitrol_rapporten
              UNION ALL
              SELECT commit_sha, run_id, id, 2 AS b FROM ci_rapporten
            ) m ORDER BY run_id DESC NULLS LAST, b, id DESC LIMIT 1`,
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

// SENTRY_AAN_01: publieke monitoring-config voor browser en mobiele app.
// Client-DSN's zijn per definitie publiek (ze staan normaal in de bundle);
// server-DSN en auth-token worden hier nadrukkelijk nooit teruggegeven.
router.get("/monitoring-config", (_req, res): void => {
  res.json({
    sentry_dsn_web: process.env["SENTRY_DSN_WEB"]?.trim() || null,
    sentry_dsn_mobile: process.env["SENTRY_DSN_MOBILE"]?.trim() || null,
    omgeving: process.env["SENTRY_ENVIRONMENT"]?.trim() || process.env["NODE_ENV"] || null,
    commit: COMMIT,
    versie: VERSIE,
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

type Meetstatus = "ok" | "unknown" | "error";

interface VeiligeTijdmeting {
  status: Meetstatus;
  last_success_at: string | null;
}

function veiligeIso(waarde: Date | string | null | undefined): string | null {
  if (!waarde) return null;
  const datum = waarde instanceof Date ? waarde : new Date(waarde);
  return Number.isNaN(datum.getTime()) ? null : datum.toISOString();
}

async function laatsteGeslaagdeDatabaseBackup(): Promise<VeiligeTijdmeting> {
  try {
    const rijen = await db
      .select({ lastSuccessAt: backupRecordsTable.voltooidOp })
      .from(backupRecordsTable)
      .where(inArray(backupRecordsTable.status, ["klaar", "geverifieerd"]))
      .orderBy(desc(backupRecordsTable.voltooidOp))
      .limit(1);
    const lastSuccessAt = veiligeIso(rijen[0]?.lastSuccessAt);
    return {
      status: lastSuccessAt ? "ok" : "unknown",
      last_success_at: lastSuccessAt,
    };
  } catch {
    return { status: "error", last_success_at: null };
  }
}

async function laatsteGeslaagdeNasPull(): Promise<VeiligeTijdmeting> {
  const nasDir = process.env["OFFSITE_NAS_DIR"];
  if (!nasDir) return { status: "unknown", last_success_at: null };
  try {
    const lastSuccessAt = veiligeIso(
      (await readFile(`${nasDir}/laatste-verbinding`, "utf8")).trim(),
    );
    return {
      status: lastSuccessAt ? "ok" : "unknown",
      last_success_at: lastSuccessAt,
    };
  } catch {
    return { status: "error", last_success_at: null };
  }
}

async function laatsteGeslaagdeUitgaandeMail(): Promise<VeiligeTijdmeting> {
  try {
    const rijen = await db
      .select({ lastSuccessAt: mailLogboekTable.aangemaaktOp })
      .from(mailLogboekTable)
      .where(eq(mailLogboekTable.status, "verzonden"))
      .orderBy(desc(mailLogboekTable.aangemaaktOp))
      .limit(1);
    const lastSuccessAt = veiligeIso(rijen[0]?.lastSuccessAt);
    return {
      status: lastSuccessAt ? "ok" : "unknown",
      last_success_at: lastSuccessAt,
    };
  } catch {
    return { status: "error", last_success_at: null };
  }
}

/**
 * BEWAKING_01: minimaal machineleesbaar productieadres voor futur-control.
 * De response is een vaste allowlist: geen ontvangers, onderwerpen, inhoud,
 * bestandspaden, configuratie, sleutels of onderliggende foutmeldingen.
 */
router.get("/beheerstatus", async (_req, res): Promise<void> => {
  const [database_backup, nas_pull, outgoing_mail] = await Promise.all([
    laatsteGeslaagdeDatabaseBackup(),
    laatsteGeslaagdeNasPull(),
    laatsteGeslaagdeUitgaandeMail(),
  ]);
  res.json({
    version: VERSIE,
    commit: COMMIT === "onbekend" ? null : COMMIT,
    database_backup,
    nas_pull,
    outgoing_mail,
    measured_at: new Date().toISOString(),
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
