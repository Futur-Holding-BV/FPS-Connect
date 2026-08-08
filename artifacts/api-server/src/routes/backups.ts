import { veiligeFoutmelding } from "../middlewares/foutafhandelaar";
import { Router } from "express";
import { db } from "@workspace/db";
import { backupRecordsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import {
  maakBackup,
  controleerBackup,
  herstelBackup,
  verwijderBackup,
} from "../lib/backupService";
import { requireBevoegdheid, requireRol } from "../middlewares/auth";
import { ObjectStorageService } from "../lib/objectStorage";
import { logger } from "../lib/logger";

const router = Router();
const storage = new ObjectStorageService();

// ─── Lijst van alle back-ups ──────────────────────────────────────────────────

router.get("/api/backups", requireBevoegdheid("systeem", 1), async (req, res): Promise<void> => {
  try {
    const records = await db
      .select()
      .from(backupRecordsTable)
      .orderBy(desc(backupRecordsTable.aangemaaktOp));
    res.json(records);
  } catch (err) {
    req.log.error({ err }, "Fout bij ophalen back-ups");
    res.status(500).json({ fout: "Kon back-ups niet ophalen" });
  }
});

// ─── Detail van één back-up ───────────────────────────────────────────────────

router.get("/api/backups/:id", requireBevoegdheid("systeem", 1), async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    res.status(400).json({ fout: "Ongeldig ID" });
    return;
  }

  try {
    const [record] = await db
      .select()
      .from(backupRecordsTable)
      .where(eq(backupRecordsTable.id, id));
    if (!record) {
      res.status(404).json({ fout: "Back-up niet gevonden" });
      return;
    }
    res.json(record);
  } catch (err) {
    req.log.error({ err }, "Fout bij ophalen back-up");
    res.status(500).json({ fout: "Kon back-up niet ophalen" });
  }
});

// ─── Nieuwe back-up aanmaken ─────────────────────────────────────────────────

router.post("/api/backups", requireBevoegdheid("systeem", 2), async (req, res): Promise<void> => {
  const soort = (req.body.soort as string) ?? "handmatig";
  if (!["handmatig", "pre-deploy"].includes(soort)) {
    res.status(400).json({ fout: "Ongeldig soort (handmatig of pre-deploy)" });
    return;
  }

  const userId = req.session.userId ?? null;

  try {
    logger.info({ soort, userId }, "Handmatige back-up gestart");
    const { id } = await maakBackup(soort as "handmatig" | "pre-deploy", userId);
    const [record] = await db
      .select()
      .from(backupRecordsTable)
      .where(eq(backupRecordsTable.id, id));
    res.status(201).json(record);
  } catch (err) {
    const foutTekst = veiligeFoutmelding(err);
    req.log.error({ err }, "Back-up aanmaken mislukt");
    res.status(500).json({ fout: `Back-up mislukt: ${foutTekst}` });
  }
});

// ─── Back-upbestand downloaden ───────────────────────────────────────────────

router.get(
  "/api/backups/:id/download",
  requireBevoegdheid("systeem", 2),
  async (req, res): Promise<void> => {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      res.status(400).json({ fout: "Ongeldig ID" });
      return;
    }

    const bestand = (req.query.bestand as string) ?? "db";
    if (!["db", "config"].includes(bestand)) {
      res.status(400).json({ fout: "Ongeldig bestand (db of config)" });
      return;
    }

    try {
      const [record] = await db
        .select()
        .from(backupRecordsTable)
        .where(eq(backupRecordsTable.id, id));
      if (!record) {
        res.status(404).json({ fout: "Back-up niet gevonden" });
        return;
      }

      const filename = bestand === "db" ? "db.sql.gz" : "config.json";
      const downloadNaam =
        bestand === "db"
          ? `fps-backup-${record.slug.slice(0, 8)}-db.sql.gz`
          : `fps-backup-${record.slug.slice(0, 8)}-config.json`;

      const response = await storage.streamBackupFile(record.slug, filename, downloadNaam);
      res.setHeader(
        "Content-Type",
        response.headers.get("Content-Type") ?? "application/octet-stream",
      );
      res.setHeader(
        "Content-Disposition",
        response.headers.get("Content-Disposition") ??
          `attachment; filename="${downloadNaam}"`,
      );
      const cl = response.headers.get("Content-Length");
      if (cl) res.setHeader("Content-Length", cl);

      const reader = response.body?.getReader();
      if (!reader) {
        res.status(500).json({ fout: "Kon bestand niet streamen" });
        return;
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();
    } catch (err) {
      req.log.error({ err }, "Download back-up mislukt");
      if (!res.headersSent) {
        res.status(500).json({ fout: "Kon bestand niet downloaden" });
      }
    }
  },
);

// ─── Integriteitscontrole ─────────────────────────────────────────────────────

router.post(
  "/api/backups/:id/controleer",
  requireBevoegdheid("systeem", 2),
  async (req, res): Promise<void> => {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      res.status(400).json({ fout: "Ongeldig ID" });
      return;
    }

    try {
      await controleerBackup(id);
      const [record] = await db
        .select()
        .from(backupRecordsTable)
        .where(eq(backupRecordsTable.id, id));
      res.json(record);
    } catch (err) {
      const foutTekst = veiligeFoutmelding(err);
      req.log.error({ err }, "Integriteitscontrole mislukt");
      res.status(422).json({ fout: foutTekst });
    }
  },
);

// ─── Volledig herstel (hoofdbeheerder only + dubbele bevestiging) ─────────────

router.post(
  "/api/backups/:id/herstel",
  requireRol("hoofdbeheerder"),
  async (req, res): Promise<void> => {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      res.status(400).json({ fout: "Ongeldig ID" });
      return;
    }

    const bevestiging = req.body.bevestiging as string;
    if (bevestiging !== "HERSTEL BEVESTIGEN") {
      res.status(400).json({
        fout: 'Typ exacte tekst "HERSTEL BEVESTIGEN" om door te gaan',
      });
      return;
    }

    try {
      logger.warn(
        { id, userId: req.session.userId },
        "Database herstel geautoriseerd door hoofdbeheerder",
      );
      await herstelBackup(id);
      res.json({ bericht: "Database succesvol hersteld vanuit back-up" });
    } catch (err) {
      const foutTekst = veiligeFoutmelding(err);
      req.log.error({ err }, "Herstel mislukt");
      res.status(500).json({ fout: `Herstel mislukt: ${foutTekst}` });
    }
  },
);

// ─── Back-up verwijderen ─────────────────────────────────────────────────────

router.delete(
  "/api/backups/:id",
  requireRol("hoofdbeheerder"),
  async (req, res): Promise<void> => {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      res.status(400).json({ fout: "Ongeldig ID" });
      return;
    }

    try {
      await verwijderBackup(id);
      res.status(204).send();
    } catch (err) {
      const foutTekst = veiligeFoutmelding(err);
      req.log.error({ err }, "Verwijderen back-up mislukt");
      res.status(500).json({ fout: foutTekst });
    }
  },
);

// ─── Externe kopie (BACKUP_01): status van de staffel + NAS-ophaling ─────────
//
// De VPS bouwt dagelijks een staffel-set onder /srv/fps-backup (script
// backup-staffel.sh) en de NAS haalt die op via het read-only account
// fps-nas. Beide sporen laten een statusbestand achter op de host; de
// compose-configuratie mount ze read-only in deze container:
//   /srv/fps-backup   → OFFSITE_BACKUP_DIR (status.json + sets)
//   /var/lib/fps-nas  → OFFSITE_NAS_DIR    (laatste-verbinding-marker)
// Buiten productie ontbreken die mounts en melden we "niet geconfigureerd".

const OFFSITE_MAX_UUR = 36;

router.get(
  "/api/backups/offsite/status",
  requireBevoegdheid("systeem", 1),
  async (req, res): Promise<void> => {
    const backupDir = process.env["OFFSITE_BACKUP_DIR"];
    const nasDir = process.env["OFFSITE_NAS_DIR"];
    if (!backupDir) {
      res.json({ geconfigureerd: false });
      return;
    }
    try {
      const fs = await import("node:fs/promises");
      let staffel: Record<string, unknown> | null = null;
      try {
        staffel = JSON.parse(await fs.readFile(`${backupDir}/status.json`, "utf8"));
      } catch {
        staffel = null;
      }
      let nasLaatstePull: string | null = null;
      if (nasDir) {
        try {
          nasLaatstePull = (await fs.readFile(`${nasDir}/laatste-verbinding`, "utf8")).trim();
        } catch {
          nasLaatstePull = null;
        }
      }
      const uurOud = (iso: string | null | undefined): number | null => {
        if (!iso) return null;
        const t = Date.parse(iso);
        return Number.isNaN(t) ? null : Math.floor((Date.now() - t) / 3_600_000);
      };
      const staffelUur = uurOud(staffel?.["laatste_run"] as string | undefined);
      const pullUur = uurOud(nasLaatstePull);
      res.json({
        geconfigureerd: true,
        staffel,
        staffel_uur_geleden: staffelUur,
        staffel_te_oud: staffelUur === null || staffelUur > OFFSITE_MAX_UUR,
        nas_laatste_pull: nasLaatstePull,
        nas_pull_uur_geleden: pullUur,
        nas_pull_te_oud: pullUur === null || pullUur > OFFSITE_MAX_UUR,
        max_uur: OFFSITE_MAX_UUR,
      });
    } catch (err) {
      req.log.error({ err }, "Fout bij lezen offsite-backupstatus");
      res.status(500).json({ fout: "Kon status van de externe kopie niet lezen" });
    }
  },
);

export default router;
