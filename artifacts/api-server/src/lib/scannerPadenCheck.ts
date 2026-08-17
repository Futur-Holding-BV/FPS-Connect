/**
 * Opstartcontrole scanner-/quarantainepaden (HERSTEL_MAIL_01 punt 1).
 *
 * De virusscanner-onderdelen gebruiken paden die per omgeving verschillen
 * (Replit vs. VPS). Alle paden zijn via omgevingsvariabelen instelbaar met
 * het Replit-pad als standaard. Deze controle logt bij het opstarten luid
 * welke paden ontbreken, zodat een virusscanner die "stil niets doet" op
 * een nieuwe server direct zichtbaar is in de logs.
 */
import { access, mkdir } from "fs/promises";
import { logger } from "./logger";

type PadCheck = {
  naam: string;
  envVar: string;
  pad: string;
  soort: "map" | "bestand";
  /** Mag bij ontbreken aangemaakt worden (quarantainemappen wel, definities niet). */
  aanmaken: boolean;
};

export async function controleerScannerPaden(): Promise<void> {
  const checks: PadCheck[] = [
    {
      naam: "ClamAV-virusdefinities",
      envVar: "CLAMAV_DB_DIR",
      pad: process.env["CLAMAV_DB_DIR"] ?? "/home/runner/workspace/data/clamav-db",
      soort: "map",
      aanmaken: false,
    },
    {
      naam: "ClamAV-binary (clamscan)",
      envVar: "CLAMAV_BIN",
      pad: process.env["CLAMAV_BIN"] ?? "/nix/store/j01wsla7rfrgjv3605l561mni4b4ka05-clamav-1.4.3/bin/clamscan",
      soort: "bestand",
      aanmaken: false,
    },
    {
      naam: "YARA-binary",
      envVar: "YARA_BIN",
      pad: process.env["YARA_BIN"] ?? "/nix/store/i7r20q1qdsl75f06d0hfm27sgl5i3006-yara-4.5.2/bin/yara",
      soort: "bestand",
      aanmaken: false,
    },
    {
      naam: "YARA-scanregels",
      envVar: "YARA_RULES_PAD",
      pad: process.env["YARA_RULES_PAD"] ?? "/home/runner/workspace/config/yara/fps-security.yar",
      soort: "bestand",
      aanmaken: false,
    },
    {
      naam: "Quarantaine-opslagmap",
      envVar: "QUARANTAINE_DIR",
      pad: process.env["QUARANTAINE_DIR"] ?? "/home/runner/workspace/data/quarantine",
      soort: "map",
      aanmaken: true,
    },
  ];

  for (const check of checks) {
    try {
      await access(check.pad);
    } catch {
      if (check.aanmaken) {
        try {
          await mkdir(check.pad, { recursive: true, mode: 0o700 });
          logger.info({ pad: check.pad, envVar: check.envVar }, `${check.naam}: map ontbrak en is aangemaakt`);
          continue;
        } catch (err) {
          logger.error({ err, pad: check.pad, envVar: check.envVar }, `${check.naam}: map ontbreekt en kon niet worden aangemaakt`);
          continue;
        }
      }
      logger.error(
        { pad: check.pad, envVar: check.envVar },
        `${check.naam}: pad ontbreekt — de bestandsscanner werkt hierdoor niet (zet ${check.envVar} naar het juiste pad op deze server)`,
      );
    }
  }
}
