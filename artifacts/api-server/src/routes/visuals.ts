import { Router } from "express";
import { db } from "@workspace/db";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { fpsVisualsTable } from "@workspace/db/schema";
import { requireBevoegdheid } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

const systeemLezen     = requireBevoegdheid("systeem", 1);
const systeemSchrijven = requireBevoegdheid("systeem", 2);

function mapRij(r: typeof fpsVisualsTable.$inferSelect) {
  return {
    id: r.id,
    naam: r.naam,
    visual_type: r.visualType,
    bron_type: r.bronType,
    bron_referentie: r.bronReferentie ?? null,
    object_path: r.objectPath,
    thumbnail_path: r.thumbnailPath ?? null,
    spot_type: r.spotType,
    artikel_id: r.artikelId ?? null,
    bedrijfsstandaard_id: r.bedrijfsstandaardId ?? null,
    taal: r.taal,
    actief: r.actief,
    aangemaakt_op: r.aangemaaktOp.toISOString(),
    bijgewerkt_op: r.bijgewerktOp?.toISOString() ?? null,
  };
}

/** GET /visuals — lijst van alle visuals (actief-filter optioneel) */
router.get("/visuals", systeemLezen, async (req, res): Promise<void> => {
  try {
    const { actief, spot_type, visual_type } = req.query as Record<string, string | undefined>;

    const filters = [];
    if (actief === "true")  filters.push(eq(fpsVisualsTable.actief, true));
    if (actief === "false") filters.push(eq(fpsVisualsTable.actief, false));
    if (visual_type)        filters.push(eq(fpsVisualsTable.visualType, visual_type));
    if (spot_type) {
      filters.push(sql`${fpsVisualsTable.spotType} && ARRAY[${sql.raw(`'${spot_type.replace(/'/g, "''")}'`)}]::text[]`);
    }

    const rijen = await db
      .select()
      .from(fpsVisualsTable)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .where(filters.length > 0 ? and(...(filters as any[])) : undefined)
      .orderBy(desc(fpsVisualsTable.aangemaaktOp));

    res.json(rijen.map(mapRij));
  } catch (err) {
    logger.error({ err }, "visuals: ophalen mislukt");
    res.status(500).json({ error: "Serverfout" });
  }
});

/** GET /visuals/:id — detail van één visual */
router.get("/visuals/:id", systeemLezen, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }
  try {
    const [rij] = await db.select().from(fpsVisualsTable).where(eq(fpsVisualsTable.id, id));
    if (!rij) { res.status(404).json({ error: "Visual niet gevonden" }); return; }
    res.json(mapRij(rij));
  } catch (err) {
    logger.error({ err }, "visuals: detail ophalen mislukt");
    res.status(500).json({ error: "Serverfout" });
  }
});

/** POST /visuals — nieuwe visual aanmaken (actief=false by default) */
router.post("/visuals", systeemSchrijven, async (req, res): Promise<void> => {
  try {
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
    } = req.body as Record<string, unknown>;

    if (!naam || typeof naam !== "string" || !naam.trim()) {
      res.status(400).json({ error: "naam is verplicht" });
      return;
    }
    if (!visual_type || typeof visual_type !== "string") {
      res.status(400).json({ error: "visual_type is verplicht" });
      return;
    }
    if (!bron_type || typeof bron_type !== "string") {
      res.status(400).json({ error: "bron_type is verplicht" });
      return;
    }
    if (!object_path || typeof object_path !== "string" || !object_path.trim()) {
      res.status(400).json({ error: "object_path is verplicht" });
      return;
    }

    const geldigeBronTypes = ["projecttekening", "ETA", "DoP", "montagevoorschrift", "fps_standaard", "praktijkfoto", "productblad"];
    if (!geldigeBronTypes.includes(bron_type)) {
      res.status(400).json({ error: `bron_type moet een van de geldige waarden zijn: ${geldigeBronTypes.join(", ")}` });
      return;
    }

    const spotTypeArr = Array.isArray(spot_type)
      ? (spot_type as unknown[]).filter((s): s is string => typeof s === "string")
      : typeof spot_type === "string" && spot_type.trim()
        ? [spot_type]
        : [];

    const nu = new Date();
    const [nieuw] = await db
      .insert(fpsVisualsTable)
      .values({
        naam: naam.trim(),
        visualType: visual_type,
        bronType: bron_type,
        bronReferentie: typeof bron_referentie === "string" && bron_referentie.trim() ? bron_referentie.trim() : null,
        objectPath: object_path.trim(),
        thumbnailPath: typeof thumbnail_path === "string" && thumbnail_path.trim() ? thumbnail_path.trim() : null,
        spotType: spotTypeArr,
        artikelId: typeof artikel_id === "number" ? artikel_id : null,
        bedrijfsstandaardId: typeof bedrijfsstandaard_id === "number" ? bedrijfsstandaard_id : null,
        taal: typeof taal === "string" && taal.trim() ? taal.trim() : "nl",
        actief: false,
        bijgewerktOp: nu,
      })
      .returning();

    res.status(201).json(mapRij(nieuw));
  } catch (err) {
    logger.error({ err }, "visuals: aanmaken mislukt");
    res.status(500).json({ error: "Serverfout" });
  }
});

/** PATCH /visuals/:id — visual bijwerken (naam, actief toggle, spot_type, etc.) */
router.patch("/visuals/:id", systeemSchrijven, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }
  try {
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
    } = req.body as Record<string, unknown>;

    const nu = new Date();
    const delta: Partial<typeof fpsVisualsTable.$inferInsert> = { bijgewerktOp: nu };

    if (typeof naam === "string" && naam.trim())           delta.naam = naam.trim();
    if (typeof visual_type === "string")                   delta.visualType = visual_type;
    if (typeof object_path === "string" && object_path.trim()) delta.objectPath = object_path.trim();
    if (typeof taal === "string" && taal.trim())           delta.taal = taal.trim();
    if (typeof actief === "boolean")                       delta.actief = actief;
    if (typeof thumbnail_path === "string")                delta.thumbnailPath = thumbnail_path.trim() || null;
    if (typeof bron_referentie === "string")               delta.bronReferentie = bron_referentie.trim() || null;
    if (artikel_id === null || typeof artikel_id === "number") delta.artikelId = artikel_id as number | null;
    if (bedrijfsstandaard_id === null || typeof bedrijfsstandaard_id === "number") delta.bedrijfsstandaardId = bedrijfsstandaard_id as number | null;

    if (typeof bron_type === "string") {
      const geldigeBronTypes = ["projecttekening", "ETA", "DoP", "montagevoorschrift", "fps_standaard", "praktijkfoto", "productblad"];
      if (!geldigeBronTypes.includes(bron_type)) {
        res.status(400).json({ error: "Ongeldig bron_type" });
        return;
      }
      delta.bronType = bron_type;
    }

    if (Array.isArray(spot_type)) {
      delta.spotType = (spot_type as unknown[]).filter((s): s is string => typeof s === "string");
    }

    const [bijgewerkt] = await db
      .update(fpsVisualsTable)
      .set(delta)
      .where(eq(fpsVisualsTable.id, id))
      .returning();

    if (!bijgewerkt) { res.status(404).json({ error: "Visual niet gevonden" }); return; }
    res.json(mapRij(bijgewerkt));
  } catch (err) {
    logger.error({ err }, "visuals: bijwerken mislukt");
    res.status(500).json({ error: "Serverfout" });
  }
});

/** DELETE /visuals/:id — visual verwijderen (alleen beheerder) */
router.delete("/visuals/:id", systeemSchrijven, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }
  try {
    const [verwijderd] = await db
      .delete(fpsVisualsTable)
      .where(eq(fpsVisualsTable.id, id))
      .returning({ id: fpsVisualsTable.id });

    if (!verwijderd) { res.status(404).json({ error: "Visual niet gevonden" }); return; }
    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "visuals: verwijderen mislukt");
    res.status(500).json({ error: "Serverfout" });
  }
});

export default router;
