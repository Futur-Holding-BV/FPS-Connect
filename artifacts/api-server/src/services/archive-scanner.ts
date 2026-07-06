/**
 * Archive Scanner — controleert ZIP-, 7z- en RAR-archieven op:
 *  - Wachtwoordbeveiliging (geblokkeerd, inhoud niet uitpakbaar)
 *  - Verdachte bestandsnamen in het archief
 *  - Recursieve diepte (bom-detectie)
 *  - Totale uitpakgrootte (zip-bomb-detectie)
 *
 * ZIP: yauzl (native Node.js, geen subprocess)
 * 7z/RAR: 7z-binary als fallback
 */

import { execFile } from "child_process";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomBytes } from "crypto";
import path from "path";
import { logger } from "../lib/logger";

export interface ArchiefBevinding {
  beschrijving: string;
  ernst: "laag" | "midden" | "hoog" | "kritiek";
  geblokkeerd: boolean;
}

export interface ArchiefScanResultaat {
  isArchief: boolean;
  archiefType?: string;
  wachtwoordBeveiligd?: boolean;
  bevindingen: ArchiefBevinding[];
  bestandsNamenInArchief?: string[];
}

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
const ZIP_EMPTY = [0x50, 0x4b, 0x05, 0x06];
const RAR4_MAGIC = [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00];
const RAR5_MAGIC = [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00];
const SEVENZ_MAGIC = [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c];

const GEBLOKKEERDE_EXT = new Set([
  ".exe", ".bat", ".cmd", ".com", ".scr", ".ps1", ".psc1",
  ".vbs", ".vbe", ".js", ".jse", ".wsf", ".wsh", ".jar",
  ".msi", ".dll", ".sys", ".drv", ".sh", ".elf", ".dmg",
]);

const MAX_UITPAK_GROOTTE = 500 * 1024 * 1024; // 500 MB
const MAX_BESTANDEN = 1000;
const MAX_DIEPTE = 5;

function heeftMagic(bytes: Buffer, magic: number[]): boolean {
  if (bytes.length < magic.length) return false;
  return magic.every((b, i) => bytes[i] === b);
}

function detecteerArchiefType(bytes: Buffer): string | null {
  if (heeftMagic(bytes, ZIP_MAGIC) || heeftMagic(bytes, ZIP_EMPTY)) return "zip";
  if (heeftMagic(bytes, RAR5_MAGIC) || heeftMagic(bytes, RAR4_MAGIC)) return "rar";
  if (heeftMagic(bytes, SEVENZ_MAGIC)) return "7z";
  return null;
}

async function scanZip(bytes: Buffer): Promise<ArchiefScanResultaat> {
  const bevindingen: ArchiefBevinding[] = [];
  const namen: string[] = [];
  let totaalGrootte = 0;
  let wachtwoordBeveiligd = false;

  try {
    const yauzl = await import("yauzl");
    await new Promise<void>((resolve, reject) => {
      yauzl.fromBuffer(bytes, { lazyEntries: true }, (err, zipFile) => {
        if (err) { reject(err); return; }
        if (!zipFile) { reject(new Error("Geen zip")); return; }

        zipFile.readEntry();
        zipFile.on("entry", (entry) => {
          const naam = entry.fileName;
          namen.push(naam);

          const bits = entry.generalPurposeBitFlag;
          if (bits & 0x1) {
            wachtwoordBeveiligd = true;
          }

          totaalGrootte += entry.uncompressedSize;
          const ext = path.extname(naam).toLowerCase();

          if (GEBLOKKEERDE_EXT.has(ext)) {
            bevindingen.push({
              beschrijving: `Geblokkeerde extensie in archief: "${naam}"`,
              ernst: "kritiek",
              geblokkeerd: true,
            });
          }

          if (naam.includes("../") || naam.includes("..\\")) {
            bevindingen.push({
              beschrijving: `Path-traversal in archiefnaam: "${naam}"`,
              ernst: "kritiek",
              geblokkeerd: true,
            });
          }

          if (namen.length > MAX_BESTANDEN) {
            bevindingen.push({
              beschrijving: `Archief bevat meer dan ${MAX_BESTANDEN} bestanden (zip-bom indicatie)`,
              ernst: "hoog",
              geblokkeerd: true,
            });
            zipFile.close();
            resolve();
            return;
          }

          if (totaalGrootte > MAX_UITPAK_GROOTTE) {
            bevindingen.push({
              beschrijving: `Uitpakgrootte overschrijdt ${MAX_UITPAK_GROOTTE / 1024 / 1024} MB (zip-bom indicatie)`,
              ernst: "kritiek",
              geblokkeerd: true,
            });
            zipFile.close();
            resolve();
            return;
          }

          zipFile.readEntry();
        });

        zipFile.on("end", resolve);
        zipFile.on("error", reject);
      });
    });
  } catch (err) {
    if (String(err).includes("Invalid password") || String(err).includes("encrypted")) {
      wachtwoordBeveiligd = true;
    } else {
      logger.warn({ err }, "ZIP scan fout");
    }
  }

  if (wachtwoordBeveiligd) {
    bevindingen.push({
      beschrijving: "Wachtwoordbeveiligd archief — inhoud niet controleerbaar; geblokkeerd",
      ernst: "kritiek",
      geblokkeerd: true,
    });
  }

  return {
    isArchief: true,
    archiefType: "zip",
    wachtwoordBeveiligd,
    bevindingen,
    bestandsNamenInArchief: namen.slice(0, 100),
  };
}

async function scan7z(bytes: Buffer, type: "7z" | "rar"): Promise<ArchiefScanResultaat> {
  const bevindingen: ArchiefBevinding[] = [];
  const namen: string[] = [];
  let wachtwoordBeveiligd = false;

  const SEVENZ = "/nix/store/7ygwq9dks5kmdjkia8zh71fs1mfkzf0j-p7zip-17.06/bin/7z";
  const tmpPad = join(tmpdir(), `fps-arch-${randomBytes(8).toString("hex")}.${type}`);

  try {
    await writeFile(tmpPad, bytes, { mode: 0o600 });

    const uitvoer = await new Promise<string>((resolve) => {
      execFile(
        SEVENZ,
        ["l", "-slt", tmpPad],
        { timeout: 15000 },
        (_err, stdout, stderr) => {
          resolve(stdout + "\n" + stderr);
        },
      );
    });

    if (uitvoer.includes("Wrong password") || uitvoer.includes("Encrypted = +")) {
      wachtwoordBeveiligd = true;
      bevindingen.push({
        beschrijving: "Wachtwoordbeveiligd archief — inhoud niet controleerbaar; geblokkeerd",
        ernst: "kritiek",
        geblokkeerd: true,
      });
    }

    const pathMatches = uitvoer.matchAll(/^Path = (.+)$/gm);
    for (const m of pathMatches) {
      const naam = m[1].trim();
      namen.push(naam);
      const ext = path.extname(naam).toLowerCase();
      if (GEBLOKKEERDE_EXT.has(ext)) {
        bevindingen.push({
          beschrijving: `Geblokkeerde extensie in archief: "${naam}"`,
          ernst: "kritiek",
          geblokkeerd: true,
        });
      }
      if (naam.includes("../") || naam.includes("..\\")) {
        bevindingen.push({
          beschrijving: `Path-traversal in archiefnaam: "${naam}"`,
          ernst: "kritiek",
          geblokkeerd: true,
        });
      }
      if (namen.length > MAX_BESTANDEN) {
        bevindingen.push({
          beschrijving: `Archief bevat meer dan ${MAX_BESTANDEN} bestanden`,
          ernst: "hoog",
          geblokkeerd: true,
        });
        break;
      }
    }
  } catch (err) {
    logger.warn({ err }, "7z/RAR scan fout");
  } finally {
    await unlink(tmpPad).catch(() => {});
  }

  return {
    isArchief: true,
    archiefType: type,
    wachtwoordBeveiligd,
    bevindingen,
    bestandsNamenInArchief: namen.slice(0, 100),
  };
}

export async function scanArchief(bytes: Buffer): Promise<ArchiefScanResultaat> {
  const type = detecteerArchiefType(bytes);
  if (!type) return { isArchief: false, bevindingen: [] };

  if (type === "zip") return scanZip(bytes);
  if (type === "7z" || type === "rar") return scan7z(bytes, type);

  return { isArchief: true, archiefType: type, bevindingen: [] };
}

export function isArchiefExtensie(ext: string): boolean {
  return [".zip", ".rar", ".7z", ".tar", ".gz", ".bz2", ".xz", ".tgz", ".cab"].includes(ext.toLowerCase());
}

export { MAX_DIEPTE };
