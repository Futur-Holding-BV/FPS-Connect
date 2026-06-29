import { Router } from "express";
import { db, workflowDefinitiesTable, backupRecordsTable } from "@workspace/db";
import { sql, desc, count } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

// ─── Types ────────────────────────────────────────────────────────────────────

interface ServiceStatus {
  naam: string;
  status: "ok" | "waarschuwing" | "fout" | "onbekend";
  detail?: string | null;
  nagekeken_op: string;
}

interface ReadinessControle {
  naam: string;
  ok: boolean;
  detail?: string | null;
}

interface SysteemStatus {
  services: ServiceStatus[];
  score: number;
  controlepunten: ReadinessControle[];
  waarschuwingen: string[];
  gegenereerd_op: string;
}

// ─── Statuscontrole ────────────────────────────────────────────────────────────

async function voerStatusCheckUit(): Promise<SysteemStatus> {
  const nu = new Date();
  const nuIso = nu.toISOString();
  const msPerUur = 1000 * 60 * 60;
  const msPerDag = msPerUur * 24;

  const services: ServiceStatus[] = [];
  const controlepunten: ReadinessControle[] = [];
  const waarschuwingen: string[] = [];

  // 1. PostgreSQL
  let dbOk = false;
  try {
    await db.execute(sql`SELECT 1`);
    dbOk = true;
    services.push({ naam: "PostgreSQL", status: "ok", detail: "Verbinding actief", nagekeken_op: nuIso });
  } catch {
    services.push({ naam: "PostgreSQL", status: "fout", detail: "Kan database niet bereiken", nagekeken_op: nuIso });
    waarschuwingen.push("PostgreSQL niet bereikbaar — alle dataroutes werken niet");
  }

  // 2. API
  services.push({ naam: "API", status: "ok", detail: "Endpoint reageert", nagekeken_op: nuIso });

  // 3. Object storage
  const heeftS3 = !!(process.env.S3_BUCKET);
  const heeftGcs = !!(process.env.GCS_BUCKET);
  const opslagOk = heeftS3 || heeftGcs;
  if (opslagOk) {
    services.push({
      naam: "Objectopslag",
      status: "ok",
      detail: heeftS3 ? `S3: ${process.env.S3_BUCKET}` : "GCS geconfigureerd",
      nagekeken_op: nuIso,
    });
  } else {
    services.push({ naam: "Objectopslag", status: "waarschuwing", detail: "Geen S3_BUCKET of GCS_BUCKET ingesteld", nagekeken_op: nuIso });
    waarschuwingen.push("Objectopslag niet geconfigureerd — back-ups kunnen niet worden opgeslagen");
  }

  // 4. AI Gateway
  const heeftAi = !!(process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || process.env.OPENAI_API_KEY);
  services.push({
    naam: "AI Gateway",
    status: heeftAi ? "ok" : "waarschuwing",
    detail: heeftAi ? "OpenAI-koppeling geconfigureerd" : "AI_INTEGRATIONS_OPENAI_BASE_URL of OPENAI_API_KEY ontbreekt",
    nagekeken_op: nuIso,
  });
  if (!heeftAi) waarschuwingen.push("AI Gateway niet geconfigureerd — AI-functies werken niet");

  // 5. Azure Graph
  const heeftAzure = !!(process.env.MAIL_TENANT_ID && process.env.MAIL_CLIENT_ID);
  services.push({
    naam: "Azure Graph",
    status: heeftAzure ? "ok" : "waarschuwing",
    detail: heeftAzure ? "Tenant en client-ID aanwezig" : "MAIL_TENANT_ID of MAIL_CLIENT_ID ontbreekt",
    nagekeken_op: nuIso,
  });
  if (!heeftAzure) waarschuwingen.push("Azure Graph niet geconfigureerd — e-mailverzending via Microsoft werkt niet");

  // 6. E-mail
  const heeftMail = !!(process.env.MAIL_FROM && process.env.MAIL_MAILBOX);
  services.push({
    naam: "E-mail",
    status: heeftMail ? "ok" : "waarschuwing",
    detail: heeftMail ? `Afzender: ${process.env.MAIL_FROM}` : "MAIL_FROM of MAIL_MAILBOX ontbreekt",
    nagekeken_op: nuIso,
  });

  // 7. Back-ups
  let backupOudheid: number | null = null;
  let backupSucces = false;
  if (dbOk) {
    try {
      const [laatste] = await db
        .select()
        .from(backupRecordsTable)
        .orderBy(desc(backupRecordsTable.aangemaaktOp))
        .limit(1);

      if (laatste) {
        const leeftijdMs = nu.getTime() - new Date(laatste.aangemaaktOp).getTime();
        backupOudheid = Math.floor(leeftijdMs / msPerUur);
        backupSucces = laatste.status === "klaar" || laatste.status === "geverifieerd";
        const dagOud = Math.floor(leeftijdMs / msPerDag);

        if (dagOud <= 1 && backupSucces) {
          services.push({ naam: "Back-ups", status: "ok", detail: `Laatste: ${dagOud === 0 ? "vandaag" : "gisteren"}, status: ${laatste.status}`, nagekeken_op: nuIso });
        } else if (dagOud <= 7) {
          services.push({ naam: "Back-ups", status: "waarschuwing", detail: `Laatste back-up ${dagOud} dag(en) geleden`, nagekeken_op: nuIso });
          waarschuwingen.push(`Laatste back-up is ${dagOud} dag(en) geleden — overweeg een handmatige back-up`);
        } else {
          services.push({ naam: "Back-ups", status: "fout", detail: `Geen recente back-up (${dagOud} dagen geleden)`, nagekeken_op: nuIso });
          waarschuwingen.push(`Geen back-up in de afgelopen ${dagOud} dagen — directe actie vereist`);
        }
      } else {
        services.push({ naam: "Back-ups", status: "waarschuwing", detail: "Nog geen back-up aangemaakt", nagekeken_op: nuIso });
        waarschuwingen.push("Nog geen back-up aangemaakt — maak direct een back-up aan via Beheer → Back-up & Herstel");
      }
    } catch {
      services.push({ naam: "Back-ups", status: "onbekend", detail: "Back-uphistorie niet opvraagbaar", nagekeken_op: nuIso });
    }
  } else {
    services.push({ naam: "Back-ups", status: "onbekend", detail: "Database niet bereikbaar", nagekeken_op: nuIso });
  }

  // 8. HTTPS
  const heeftHttps = !!(process.env.REPLIT_DOMAINS);
  services.push({
    naam: "HTTPS",
    status: heeftHttps ? "ok" : "waarschuwing",
    detail: heeftHttps ? process.env.REPLIT_DOMAINS?.split(",")[0] : "REPLIT_DOMAINS niet ingesteld",
    nagekeken_op: nuIso,
  });

  // 9. Workflows
  let aantalWorkflows = 0;
  if (dbOk) {
    try {
      const [result] = await db.select({ n: count() }).from(workflowDefinitiesTable);
      aantalWorkflows = result?.n ?? 0;
      services.push({
        naam: "Workflows",
        status: aantalWorkflows > 0 ? "ok" : "waarschuwing",
        detail: `${aantalWorkflows} workflow${aantalWorkflows !== 1 ? "s" : ""} geconfigureerd`,
        nagekeken_op: nuIso,
      });
      if (aantalWorkflows === 0) waarschuwingen.push("Geen workflows geconfigureerd — ga naar Workflow Designer");
    } catch {
      services.push({ naam: "Workflows", status: "onbekend", nagekeken_op: nuIso });
    }
  } else {
    services.push({ naam: "Workflows", status: "onbekend", nagekeken_op: nuIso });
  }

  // 10. DATABASE_URL
  const heeftDbUrl = !!(process.env.DATABASE_URL);
  services.push({
    naam: "DATABASE_URL",
    status: heeftDbUrl ? "ok" : "fout",
    detail: heeftDbUrl ? "Geconfigureerd" : "DATABASE_URL ontbreekt — database niet bereikbaar",
    nagekeken_op: nuIso,
  });
  if (!heeftDbUrl) waarschuwingen.push("DATABASE_URL ontbreekt — platform werkt niet");

  // ─── Controlepunten readiness score ─────────────────────────────────────────

  controlepunten.push({ naam: "PostgreSQL bereikbaar", ok: dbOk, detail: dbOk ? null : "Database niet bereikbaar" });
  controlepunten.push({ naam: "DATABASE_URL geconfigureerd", ok: heeftDbUrl });
  controlepunten.push({ naam: "Objectopslag geconfigureerd", ok: opslagOk, detail: opslagOk ? null : "S3_BUCKET of GCS_BUCKET ontbreekt" });

  const backupRecentOk = backupOudheid !== null && backupOudheid <= 48 && backupSucces;
  controlepunten.push({
    naam: "Laatste back-up succesvol (< 48 uur)",
    ok: backupRecentOk,
    detail: backupOudheid !== null ? `${backupOudheid} uur geleden` : "Geen back-up gevonden",
  });

  controlepunten.push({ naam: "AI-koppeling geconfigureerd", ok: heeftAi, detail: heeftAi ? null : "AI_INTEGRATIONS_OPENAI_BASE_URL of OPENAI_API_KEY ontbreekt" });
  controlepunten.push({ naam: "E-mail geconfigureerd", ok: heeftMail, detail: heeftMail ? null : "MAIL_FROM of MAIL_MAILBOX ontbreekt" });
  controlepunten.push({ naam: "Azure Graph geconfigureerd", ok: heeftAzure, detail: heeftAzure ? null : "MAIL_TENANT_ID of MAIL_CLIENT_ID ontbreekt" });
  controlepunten.push({ naam: "HTTPS geconfigureerd", ok: heeftHttps, detail: heeftHttps ? null : "REPLIT_DOMAINS niet ingesteld" });
  controlepunten.push({ naam: "Workflows aanwezig", ok: aantalWorkflows > 0, detail: `${aantalWorkflows} workflows` });

  const okCount = controlepunten.filter((c) => c.ok).length;
  const score = Math.round((okCount / controlepunten.length) * 100);

  return { services, score, controlepunten, waarschuwingen, gegenereerd_op: nuIso };
}

// ─── Routes ────────────────────────────────────────────────────────────────────

router.get(
  "/beheer/systeem-status",
  requireBevoegdheid("systeem", 1),
  async (_req, res) => {
    try {
      const status = await voerStatusCheckUit();
      return res.json(status);
    } catch (err) {
      logger.error({ err }, "Systeemstatus ophalen mislukt");
      return res.status(500).json({ error: "Interne serverfout" });
    }
  },
);

export default router;
