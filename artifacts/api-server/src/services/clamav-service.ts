/**
 * ClamAV-service — scant buffers via clamscan subprocess.
 *
 * Gebruikt clamscan (niet de daemon) zodat er geen aparte clamd-process nodig is.
 * Geschreven als Promise-wrapper met AbortSignal-timeout.
 *
 * Vereiste omgevingsvariabelen (optioneel):
 *   CLAMAV_DB_DIR — pad naar de virusdefinities (standaard: /home/runner/workspace/data/clamav-db)
 *   CLAMAV_TIMEOUT_MS — maximale scantijd in ms (standaard: 30000)
 */

import { execFile } from "child_process";
import { writeFile, unlink, access } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomBytes } from "crypto";
import { logger } from "../lib/logger";

export type ClamAvResultaat =
  | { status: "schoon" }
  | { status: "geïnfecteerd"; melding: string }
  | { status: "fout"; reden: string }
  | { status: "niet_beschikbaar" };

const DB_DIR = process.env["CLAMAV_DB_DIR"] ?? "/home/runner/workspace/data/clamav-db";
const TIMEOUT_MS = parseInt(process.env["CLAMAV_TIMEOUT_MS"] ?? "30000", 10);
const CLAMSCAN = "/nix/store/j01wsla7rfrgjv3605l561mni4b4ka05-clamav-1.4.3/bin/clamscan";

let _beschikbaar: boolean | null = null;

async function clamscanBeschikbaar(): Promise<boolean> {
  if (_beschikbaar !== null) return _beschikbaar;
  try {
    await access(CLAMSCAN);
    await access(DB_DIR);
    _beschikbaar = true;
  } catch {
    _beschikbaar = false;
  }
  return _beschikbaar;
}

export async function resetClamAvBeschikbaarheid(): Promise<void> {
  _beschikbaar = null;
}

export async function scanMetClamAv(bytes: Buffer): Promise<ClamAvResultaat> {
  if (!(await clamscanBeschikbaar())) {
    return { status: "niet_beschikbaar" };
  }

  const tmpPad = join(tmpdir(), `fps-scan-${randomBytes(8).toString("hex")}.bin`);
  try {
    await writeFile(tmpPad, bytes, { mode: 0o600 });

    const uitkomst = await new Promise<ClamAvResultaat>((resolve) => {
      const proc = execFile(
        CLAMSCAN,
        [
          `--database=${DB_DIR}`,
          "--no-summary",
          "--stdout",
          tmpPad,
        ],
        { timeout: TIMEOUT_MS },
        (err, stdout, stderr) => {
          if (!err) {
            resolve({ status: "schoon" });
            return;
          }
          if (err.code === 1) {
            const regel = stdout.trim() || stderr.trim();
            const match = regel.match(/FOUND\s*(.*)$/i) ?? regel.match(/:\s*(.+)\s+FOUND/i);
            const melding = match ? match[1].trim() : regel;
            resolve({ status: "geïnfecteerd", melding });
            return;
          }
          if ((err as NodeJS.ErrnoException).code === "ETIMEDOUT") {
            resolve({ status: "fout", reden: "Scantijdlimiet overschreden" });
            return;
          }
          resolve({ status: "fout", reden: String(err.message ?? "onbekende clamscan fout") });
        },
      );
      void proc;
    });

    return uitkomst;
  } catch (err) {
    logger.warn({ err }, "ClamAV scan onverwachte fout");
    return { status: "fout", reden: String(err) };
  } finally {
    await unlink(tmpPad).catch(() => {});
  }
}

export async function geefClamAvStatus(): Promise<{
  beschikbaar: boolean;
  databasePad: string;
  versie?: string;
}> {
  const beschikbaar = await clamscanBeschikbaar();
  if (!beschikbaar) return { beschikbaar: false, databasePad: DB_DIR };

  const versie = await new Promise<string>((resolve) => {
    execFile(CLAMSCAN, ["--version"], { timeout: 5000 }, (_err, stdout) => {
      resolve(stdout.trim().split("\n")[0] ?? "onbekend");
    });
  });

  return { beschikbaar: true, databasePad: DB_DIR, versie };
}
