import { Router, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { fpsVisualsTable } from "@workspace/db/schema";
import { requireBevoegdheid } from "../middlewares/auth";
import { ObjectStorageService } from "../lib/objectStorage";
import { logger } from "../lib/logger";

const router = Router();
const lezen  = requireBevoegdheid("systeem", 1);
const schrijven = requireBevoegdheid("systeem", 2);
const storage = new ObjectStorageService();

function mapVisual(v: typeof fpsVisualsTable.$inferSelect) {
  return {
    id:                   v.id,
    naam:                 v.naam,
    visual_type:          v.visualType,
    bron_type:            v.bronType,
    bron_referentie:      v.bronReferentie ?? null,
    object_path:          v.objectPath,
    thumbnail_path:       v.thumbnailPath ?? null,
    spot_type:            v.spotType,
    artikel_id:           v.artikelId ?? null,
    bedrijfsstandaard_id: v.bedrijfsstandaardId ?? null,
    taal:                 v.taal,
    actief:               v.actief,
    aangemaakt_op:        v.aangemaaktOp,
    bijgewerkt_op:        v.bijgewerktOp ?? null,
  };
}

// ── GET /beheer/visuals ────────────────────────────────────────────────────────
router.get("/beheer/visuals", lezen, async (_req: Request, res: Response): Promise<void> => {
  const visuals = await db
    .select()
    .from(fpsVisualsTable)
    .orderBy(fpsVisualsTable.aangemaaktOp);
  res.json(visuals.map(mapVisual));
});

// ── POST /beheer/visuals/upload-url ───────────────────────────────────────────
router.post("/beheer/visuals/upload-url", schrijven, async (_req: Request, res: Response): Promise<void> => {
  try {
    const { uploadURL, objectPath } = await storage.getObjectEntityUploadURL(null, "algemeen");
    res.json({ upload_url: uploadURL, object_path: objectPath });
  } catch (err) {
    logger.error({ err }, "visual upload-url fout");
    res.status(500).json({ error: "Kon upload-URL niet genereren" });
  }
});

// ── POST /beheer/visuals ───────────────────────────────────────────────────────
router.post("/beheer/visuals", schrijven, async (req: Request, res: Response): Promise<void> => {
  const {
    naam,
    visual_type,
    bron_type,
    bron_referentie,
    object_path,
    thumbnail_path,
    spot_type,
    artikel_id,
    bedrijfsstandaard_id,
    taal,
  } = req.body as {
    naam: string;
    visual_type: string;
    bron_type: string;
    bron_referentie?: string;
    object_path: string;
    thumbnail_path?: string;
    spot_type?: string[];
    artikel_id?: number;
    bedrijfsstandaard_id?: number;
    taal?: string;
  };

  if (!naam || !visual_type || !bron_type || !object_path) {
    res.status(400).json({ error: "naam, visual_type, bron_type en object_path zijn verplicht" });
    return;
  }

  const [nieuw] = await db
    .insert(fpsVisualsTable)
    .values({
      naam,
      visualType:          visual_type,
      bronType:            bron_type,
      bronReferentie:      bron_referentie ?? null,
      objectPath:          object_path,
      thumbnailPath:       thumbnail_path ?? null,
      spotType:            spot_type ?? [],
      artikelId:           artikel_id ?? null,
      bedrijfsstandaardId: bedrijfsstandaard_id ?? null,
      taal:                taal ?? "nl",
      actief:              false,
    })
    .returning();

  res.status(201).json(mapVisual(nieuw));
});

// ── PATCH /beheer/visuals/:id ─────────────────────────────────────────────────
router.patch("/beheer/visuals/:id", schrijven, async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Ongeldig id" });
    return;
  }

  const {
    naam,
    visual_type,
    bron_type,
    bron_referentie,
    object_path,
    thumbnail_path,
    spot_type,
    artikel_id,
    bedrijfsstandaard_id,
    taal,
    actief,
  } = req.body as {
    naam?: string;
    visual_type?: string;
    bron_type?: string;
    bron_referentie?: string | null;
    object_path?: string;
    thumbnail_path?: string | null;
    spot_type?: string[];
    artikel_id?: number | null;
    bedrijfsstandaard_id?: number | null;
    taal?: string;
    actief?: boolean;
  };

  const update: Partial<typeof fpsVisualsTable.$inferInsert> & { bijgewerktOp: Date } = {
    bijgewerktOp: new Date(),
  };

  if (naam !== undefined)                 update.naam = naam;
  if (visual_type !== undefined)          update.visualType = visual_type;
  if (bron_type !== undefined)            update.bronType = bron_type;
  if (bron_referentie !== undefined)      update.bronReferentie = bron_referentie;
  if (object_path !== undefined)          update.objectPath = object_path;
  if (thumbnail_path !== undefined)       update.thumbnailPath = thumbnail_path;
  if (spot_type !== undefined)            update.spotType = spot_type;
  if (artikel_id !== undefined)           update.artikelId = artikel_id;
  if (bedrijfsstandaard_id !== undefined) update.bedrijfsstandaardId = bedrijfsstandaard_id;
  if (taal !== undefined)                 update.taal = taal;
  if (actief !== undefined)               update.actief = actief;

  const [bijgewerkt] = await db
    .update(fpsVisualsTable)
    .set(update)
    .where(eq(fpsVisualsTable.id, id))
    .returning();

  if (!bijgewerkt) {
    res.status(404).json({ error: "Visual niet gevonden" });
    return;
  }

  res.json(mapVisual(bijgewerkt));
});

// ── DELETE /beheer/visuals/:id ────────────────────────────────────────────────
router.delete("/beheer/visuals/:id", schrijven, async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Ongeldig id" });
    return;
  }

  const [verwijderd] = await db
    .delete(fpsVisualsTable)
    .where(eq(fpsVisualsTable.id, id))
    .returning({ id: fpsVisualsTable.id });

  if (!verwijderd) {
    res.status(404).json({ error: "Visual niet gevonden" });
    return;
  }

  res.status(204).send();
});

export default router;
