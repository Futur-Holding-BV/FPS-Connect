/**
 * Back-up & Herstel service
 *
 * Beheert het aanmaken, verifiëren en herstellen van databaseback-ups.
 * Back-ups worden opgeslagen in object storage onder backups/{slug}/db.sql.gz
 * en backups/{slug}/config.json.
 *
 * Schema: backup_records in PostgreSQL
 */
import { spawn, execSync } from "child_process";
import { createHash, randomUUID } from "crypto";
import { gzip as gzipCb, gunzip as gunzipCb } from "zlib";
import { promisify } from "util";
import { db } from "@workspace/db";
import { backupRecordsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ObjectStorageService } from "./objectStorage";
import { logger } from "./logger";

const gzipAsync = promisify(gzipCb);
const gunzipAsync = promisify(gunzipCb);

const storage = new ObjectStorageService();

// ─── Hulpfuncties ─────────────────────────────────────────────────────────────

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function leesGitCommit(): string {
  try {
    return execSync("git rev-parse --short HEAD", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return "onbekend";
  }
}

function leesAppVersie(): string {
  return process.env.npm_package_version ?? "onbekend";
}

/**
 * Voer pg_dump uit en retourneer de ruwe SQL-dump als Buffer.
 * Maakt gebruik van PGPASSWORD (niet zichtbaar in processen).
 */
function voerPgDumpUit(): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      reject(new Error("DATABASE_URL is niet ingesteld"));
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(databaseUrl);
    } catch {
      reject(new Error("DATABASE_URL is geen geldige URL"));
      return;
    }

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PGPASSWORD: parsed.password,
    };

    const args = [
      `--host=${parsed.hostname}`,
      `--port=${parsed.port || "5432"}`,
      `--username=${parsed.username}`,
      "--format=plain",
      "--no-password",
      "--encoding=UTF8",
      "--no-owner",
      "--no-acl",
      parsed.pathname.replace(/^\//, ""),
    ];

    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    const child = spawn("pg_dump", args, { env });

    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => errChunks.push(chunk));
    child.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks));
      } else {
        const errMsg = Buffer.concat(errChunks).toString("utf8").trim();
        reject(new Error(`pg_dump afgebroken (code ${code}): ${errMsg}`));
      }
    });
    child.on("error", (err) => reject(err));
  });
}

/**
 * Herstel een SQL-dump via psql.
 * GEVAARLIJK: overschrijft alle huidige gegevens!
 */
function voerPsqlHerstelUit(sqlBuffer: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      reject(new Error("DATABASE_URL is niet ingesteld"));
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(databaseUrl);
    } catch {
      reject(new Error("DATABASE_URL is geen geldige URL"));
      return;
    }

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PGPASSWORD: parsed.password,
    };

    const args = [
      `--host=${parsed.hostname}`,
      `--port=${parsed.port || "5432"}`,
      `--username=${parsed.username}`,
      "--no-password",
      parsed.pathname.replace(/^\//, ""),
    ];

    const errChunks: Buffer[] = [];
    const child = spawn("psql", args, { env });

    child.stderr.on("data", (chunk: Buffer) => errChunks.push(chunk));
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        const errMsg = Buffer.concat(errChunks).toString("utf8").trim();
        reject(new Error(`psql herstel mislukt (code ${code}): ${errMsg}`));
      }
    });
    child.on("error", (err) => reject(err));

    // Schrijf de SQL naar stdin
    child.stdin.write(sqlBuffer);
    child.stdin.end();
  });
}

// ─── Publieke API ──────────────────────────────────────────────────────────────

export interface BackupConfig {
  timestamp: string;
  omgeving: string;
  gitCommit: string;
  versieApp: string;
  nodeVersie: string;
  databaseHost: string;
  envVariabelen: string[];
}

/**
 * Maak een nieuwe back-up aan.
 * Slaat de record op, voert pg_dump uit, comprimeert, verifiëert en uploadt.
 */
export async function maakBackup(
  soort: "handmatig" | "automatisch" | "pre-deploy",
  gebruikerId: number | null,
): Promise<{ id: number; slug: string }> {
  const slug = randomUUID();
  const omgeving = process.env.NODE_ENV ?? "development";

  // Record aanmaken met status 'bezig'
  const [record] = await db
    .insert(backupRecordsTable)
    .values({
      slug,
      soort,
      omgeving,
      gitCommit: leesGitCommit(),
      versieApp: leesAppVersie(),
      status: "bezig",
      aangemaaktDoorId: gebruikerId,
    })
    .returning({ id: backupRecordsTable.id });

  const id = record.id;

  try {
    // 1. Database dump
    logger.info({ slug, soort }, "Back-up: pg_dump wordt uitgevoerd");
    const sqlRaw = await voerPgDumpUit();
    const sqlCompressed = await gzipAsync(sqlRaw);
    const checksumDb = sha256(sqlCompressed);

    // 2. Config snapshot
    const databaseUrl = process.env.DATABASE_URL ?? "";
    let databaseHost = "";
    try {
      databaseHost = new URL(databaseUrl).hostname;
    } catch { /* laat leeg */ }

    const config: BackupConfig = {
      timestamp: new Date().toISOString(),
      omgeving,
      gitCommit: leesGitCommit(),
      versieApp: leesAppVersie(),
      nodeVersie: process.version,
      databaseHost,
      envVariabelen: Object.keys(process.env).filter(
        (k) =>
          k.startsWith("VITE_") ||
          k === "NODE_ENV" ||
          k === "PORT" ||
          k.startsWith("S3_") ||
          k === "MAIL_FROM" ||
          k === "MAIL_MAILBOX",
      ),
    };
    const configJson = Buffer.from(JSON.stringify(config, null, 2), "utf8");
    const checksumConfig = sha256(configJson);

    // 3. Upload naar object storage
    logger.info({ slug }, "Back-up: uploaden naar object storage");
    await storage.uploadBackupFile(slug, "db.sql.gz", sqlCompressed, "application/gzip");
    await storage.uploadBackupFile(slug, "config.json", configJson, "application/json");

    // 4. Record bijwerken: klaar
    await db
      .update(backupRecordsTable)
      .set({
        status: "klaar",
        voltooidOp: new Date(),
        grootteDatabaseBytes: sqlCompressed.length,
        grootteConfigBytes: configJson.length,
        checksumDatabase: checksumDb,
        checksumConfig,
      })
      .where(eq(backupRecordsTable.id, id));

    logger.info({ slug, grootte: sqlCompressed.length }, "Back-up voltooid");
    return { id, slug };
  } catch (err) {
    const foutTekst = err instanceof Error ? err.message : String(err);
    logger.error({ slug, err }, "Back-up mislukt");
    await db
      .update(backupRecordsTable)
      .set({ status: "fout", voltooidOp: new Date(), foutTekst })
      .where(eq(backupRecordsTable.id, id));
    throw err;
  }
}

/**
 * Controleer de integriteit van een bestaande back-up.
 * Download het dump-bestand en verifieert de checksum en de gzip-inhoud.
 */
export async function controleerBackup(id: number): Promise<void> {
  const [record] = await db
    .select()
    .from(backupRecordsTable)
    .where(eq(backupRecordsTable.id, id));

  if (!record) throw new Error("Back-up niet gevonden");
  if (record.status === "bezig") throw new Error("Back-up is nog bezig");

  try {
    // Download het gecomprimeerde dump-bestand
    const compressed = await storage.downloadBackupFile(record.slug, "db.sql.gz");

    // Controleer checksum
    const checksum = sha256(compressed);
    if (record.checksumDatabase && checksum !== record.checksumDatabase) {
      throw new Error(
        `Checksum komt niet overeen. Verwacht: ${record.checksumDatabase}, gevonden: ${checksum}`,
      );
    }

    // Decomprimeer en controleer SQL-header
    const decompressed = await gunzipAsync(compressed);
    const header = decompressed.slice(0, 200).toString("utf8");
    if (!header.includes("PostgreSQL") && !header.includes("pg_dump")) {
      throw new Error("Bestand is geen geldige PostgreSQL-dump (header niet herkend)");
    }

    // Markeer als geverifieerd
    await db
      .update(backupRecordsTable)
      .set({ status: "geverifieerd", checksumDatabase: checksum })
      .where(eq(backupRecordsTable.id, id));

    logger.info({ slug: record.slug }, "Back-up geverifieerd");
  } catch (err) {
    const foutTekst = err instanceof Error ? err.message : String(err);
    await db
      .update(backupRecordsTable)
      .set({ status: "fout", foutTekst })
      .where(eq(backupRecordsTable.id, id));
    throw err;
  }
}

/**
 * Herstel de database vanuit een back-up.
 * GEVAARLIJK: overschrijft alle huidige gegevens. Alleen voor hoofdbeheerders.
 * Vereist expliciete bevestiging via de aanroepende route.
 */
export async function herstelBackup(id: number): Promise<void> {
  const [record] = await db
    .select()
    .from(backupRecordsTable)
    .where(eq(backupRecordsTable.id, id));

  if (!record) throw new Error("Back-up niet gevonden");
  if (record.status === "bezig") throw new Error("Back-up is nog bezig");
  if (record.status === "fout") {
    throw new Error("Herstel vanuit een mislukte back-up is niet toegestaan");
  }

  logger.warn({ slug: record.slug }, "DATABASE HERSTEL GESTART — alle huidige gegevens worden overschreven");

  const compressed = await storage.downloadBackupFile(record.slug, "db.sql.gz");
  const sql = await gunzipAsync(compressed);

  await voerPsqlHerstelUit(sql);

  logger.warn({ slug: record.slug }, "DATABASE HERSTEL VOLTOOID");
}

/**
 * Verwijder een back-up (record + bestanden in object storage).
 */
export async function verwijderBackup(id: number): Promise<void> {
  const [record] = await db
    .select({ slug: backupRecordsTable.slug })
    .from(backupRecordsTable)
    .where(eq(backupRecordsTable.id, id));

  if (!record) throw new Error("Back-up niet gevonden");

  await storage.deleteBackupFiles(record.slug);
  await db.delete(backupRecordsTable).where(eq(backupRecordsTable.id, id));
}

// ─── Dagelijkse automatische back-up ─────────────────────────────────────────

let _dagelijksGepland = false;

/**
 * Plan een dagelijkse automatische back-up om 03:00.
 * Veilig om meerdere keren aan te roepen — plant slechts één timer.
 */
export function planDagelijksBackup(): void {
  if (_dagelijksGepland) return;
  _dagelijksGepland = true;

  function scheduleNext() {
    const now = new Date();
    const volgende = new Date(now);
    volgende.setHours(3, 0, 0, 0);
    if (volgende <= now) volgende.setDate(volgende.getDate() + 1);
    const vertragingMs = volgende.getTime() - now.getTime();
    const uren = Math.floor(vertragingMs / 3_600_000);
    const minuten = Math.floor((vertragingMs % 3_600_000) / 60_000);
    logger.info({ uren, minuten }, "Volgende automatische back-up gepland");

    setTimeout(async () => {
      try {
        logger.info("Automatische dagelijkse back-up starten");
        await maakBackup("automatisch", null);
      } catch (err) {
        logger.error({ err }, "Automatische dagelijkse back-up mislukt");
      }
      scheduleNext();
    }, vertragingMs).unref(); // .unref() zodat de timer het proces niet open houdt
  }

  scheduleNext();
}
