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

export default router;
