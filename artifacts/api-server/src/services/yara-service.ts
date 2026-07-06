/**
 * YARA-service — scant buffers via de yara-binary met FPS-specifieke regels.
 *
 * Regels staan in /home/runner/workspace/config/yara/fps-security.yar.
 * Elke match wordt teruggegeven als YaraBevinding met naam en ernst.
 */

import { execFile } from "child_process";
import { writeFile, unlink, access } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomBytes } from "crypto";
import { logger } from "../lib/logger";

export interface YaraBevinding {
  regel: string;
  ernst: "midden" | "hoog" | "kritiek";
  beschrijving: string;
}

export type YaraResultaat =
  | { status: "schoon" }
  | { status: "matches"; bevindingen: YaraBevinding[] }
  | { status: "fout"; reden: string }
  | { status: "niet_beschikbaar" };

const YARA_BIN = "/nix/store/i7r20q1qdsl75f06d0hfm27sgl5i3006-yara-4.5.2/bin/yara";
const RULES_PAD = "/home/runner/workspace/config/yara/fps-security.yar";
const TIMEOUT_MS = 15000;

const ERNST_MAP: Record<string, YaraBevinding["ernst"]> = {
  RansomwareNoteKeywords: "kritiek",
  EmbeddedExecutable: "kritiek",
  SuspiciousWebShell: "kritiek",
  SuspiciousPowerShell: "hoog",
  SuspiciousMacroKeywords: "hoog",
  MimeTypeMismatch: "midden",
  PhishingIndicators: "midden",
};

const BESCHRIJVING_MAP: Record<string, string> = {
  RansomwareNoteKeywords: "Ransomware losgeldbrief-patronen gedetecteerd",
  EmbeddedExecutable: "Ingesloten uitvoerbaar bestand gevonden",
  SuspiciousWebShell: "Webshell-patroon gedetecteerd",
  SuspiciousPowerShell: "Verdachte PowerShell-commando's gedetecteerd",
  SuspiciousMacroKeywords: "Verdachte VBA-macro patronen gedetecteerd",
  MimeTypeMismatch: "MIME-type mismatch: JPEG met verdachte inhoud",
  PhishingIndicators: "Phishing-indicatoren in document gedetecteerd",
};

let _beschikbaar: boolean | null = null;

async function yaraBeschikbaar(): Promise<boolean> {
  if (_beschikbaar !== null) return _beschikbaar;
  try {
    await access(YARA_BIN);
    await access(RULES_PAD);
    _beschikbaar = true;
  } catch {
    _beschikbaar = false;
  }
  return _beschikbaar;
}

export async function scanMetYara(bytes: Buffer): Promise<YaraResultaat> {
  if (!(await yaraBeschikbaar())) {
    return { status: "niet_beschikbaar" };
  }

  const tmpPad = join(tmpdir(), `fps-yara-${randomBytes(8).toString("hex")}.bin`);
  try {
    await writeFile(tmpPad, bytes, { mode: 0o600 });

    const uitkomst = await new Promise<YaraResultaat>((resolve) => {
      execFile(
        YARA_BIN,
        [RULES_PAD, tmpPad],
        { timeout: TIMEOUT_MS },
        (err, stdout) => {
          if (err && (err as NodeJS.ErrnoException).code === "ETIMEDOUT") {
            resolve({ status: "fout", reden: "YARA scan time-out" });
            return;
          }

          const regels = stdout.trim().split("\n").filter(Boolean);
          if (regels.length === 0) {
            resolve({ status: "schoon" });
            return;
          }

          const bevindingen: YaraBevinding[] = regels
            .map((r) => r.split(" ")[0])
            .filter(Boolean)
            .map((naam) => ({
              regel: naam,
              ernst: ERNST_MAP[naam] ?? "midden",
              beschrijving: BESCHRIJVING_MAP[naam] ?? `YARA regel geactiveerd: ${naam}`,
            }));

          resolve({ status: "matches", bevindingen });
        },
      );
    });

    return uitkomst;
  } catch (err) {
    logger.warn({ err }, "YARA scan onverwachte fout");
    return { status: "fout", reden: String(err) };
  } finally {
    await unlink(tmpPad).catch(() => {});
  }
}
