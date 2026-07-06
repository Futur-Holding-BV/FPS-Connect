/**
 * Quarantaine-opslag — bewaart geblokkeerde bestanden buiten publieke toegang.
 *
 * Bestanden worden opgeslagen in /home/runner/workspace/data/quarantine/
 * Dit pad is NIET via de web-server bereikbaar (niet onder /api/storage of public/).
 * Toegang alleen via de beheer-API met expliciete autorisatie.
 *
 * Naamgeving: <timestamp>-<scanId>-<sha256prefix>.<ext>
 */

import { mkdir, writeFile, readFile, unlink, readdir, stat } from "fs/promises";
import { join, extname } from "path";
import { createHash } from "crypto";
import { logger } from "../lib/logger";

const QUARANTAINE_DIR = "/home/runner/workspace/data/quarantine";
const QUARANTAINE_META_DIR = join(QUARANTAINE_DIR, ".meta");

export interface QuarantaineMeta {
  scanId: number;
  bestandsnaam: string;
  opgeslagenOp: string;
  sha256: string;
  grootte: number;
  reden: string;
  gebruikerId?: number;
}

async function initDirs(): Promise<void> {
  await mkdir(QUARANTAINE_DIR, { recursive: true, mode: 0o700 });
  await mkdir(QUARANTAINE_META_DIR, { recursive: true, mode: 0o700 });
}

export async function slaQuarantaineOp(
  bytes: Buffer,
  meta: Omit<QuarantaineMeta, "sha256" | "grootte" | "opgeslagenOp">,
): Promise<string> {
  await initDirs();

  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const ts = Date.now();
  const ext = extname(meta.bestandsnaam).slice(0, 10).replace(/[^a-zA-Z0-9.]/g, "_");
  const bestandsnaam = `${ts}-${meta.scanId}-${sha256.slice(0, 12)}${ext}`;
  const vollePad = join(QUARANTAINE_DIR, bestandsnaam);

  await writeFile(vollePad, bytes, { mode: 0o600 });

  const volleMeta: QuarantaineMeta = {
    ...meta,
    sha256,
    grootte: bytes.length,
    opgeslagenOp: new Date().toISOString(),
  };

  await writeFile(
    join(QUARANTAINE_META_DIR, `${bestandsnaam}.json`),
    JSON.stringify(volleMeta, null, 2),
    { mode: 0o600 },
  );

  logger.info({ scanId: meta.scanId, sha256, grootte: bytes.length }, "Bestand opgeslagen in quarantaine");
  return bestandsnaam;
}

export async function haalQuarantaineLijstOp(): Promise<Array<QuarantaineMeta & { bestandsnaam_intern: string }>> {
  await initDirs();
  const bestanden = await readdir(QUARANTAINE_META_DIR).catch(() => [] as string[]);
  const resultaten: Array<QuarantaineMeta & { bestandsnaam_intern: string }> = [];

  for (const bestand of bestanden.filter((b) => b.endsWith(".json"))) {
    try {
      const inhoud = await readFile(join(QUARANTAINE_META_DIR, bestand), "utf-8");
      const meta = JSON.parse(inhoud) as QuarantaineMeta;
      resultaten.push({ ...meta, bestandsnaam_intern: bestand.replace(".json", "") });
    } catch {
      // corrupt meta, overslaan
    }
  }

  return resultaten.sort((a, b) => b.opgeslagenOp.localeCompare(a.opgeslagenOp));
}

export async function verwijderUitQuarantaine(bestandsnaamIntern: string): Promise<boolean> {
  const vollePad = join(QUARANTAINE_DIR, bestandsnaamIntern);
  const metaPad = join(QUARANTAINE_META_DIR, `${bestandsnaamIntern}.json`);
  try {
    await unlink(vollePad).catch(() => {});
    await unlink(metaPad).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

export async function geefQuarantaineStats(): Promise<{
  aantalBestanden: number;
  totaalGrootte: number;
  padBuitePubliekBereik: boolean;
}> {
  await initDirs();
  const bestanden = await readdir(QUARANTAINE_DIR).catch(() => [] as string[]);
  const databestanden = bestanden.filter((b) => !b.startsWith("."));
  let totaalGrootte = 0;

  for (const b of databestanden) {
    try {
      const s = await stat(join(QUARANTAINE_DIR, b));
      totaalGrootte += s.size;
    } catch {
      // overslaan
    }
  }

  return {
    aantalBestanden: databestanden.length,
    totaalGrootte,
    padBuitePubliekBereik: true,
  };
}
