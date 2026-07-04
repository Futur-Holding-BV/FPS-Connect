import { Router } from "express";
import { db } from "@workspace/db";
import { constructieTemplatesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";

const router = Router();
const lezen = requireBevoegdheid("bibliotheek", 1);
const schrijven = requireBevoegdheid("bibliotheek", 2);

function mapTemplate(t: typeof constructieTemplatesTable.$inferSelect) {
  return {
    id: t.id,
    naam: t.naam,
    omschrijving: t.omschrijving ?? null,
    onderdelen: (t.onderdelen as { type: string; label: string; omschrijving?: string | null }[]) ?? [],
    aangemaakt_door_id: t.aangemaaktDoorId ?? null,
    aangemaakt_op: t.aangemaaktOp.toISOString(),
    bijgewerkt_op: t.bijgewerktOp.toISOString(),
  };
}

// GET /constructie-templates
router.get("/constructie-templates", lezen, async (req, res): Promise<void> => {
  try {
    const rows = await db
      .select()
      .from(constructieTemplatesTable)
      .orderBy(constructieTemplatesTable.naam);
    return void res.json(rows.map(mapTemplate));
  } catch (err) {
    req.log.error(err);
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /constructie-templates
router.post("/constructie-templates", schrijven, async (req, res): Promise<void> => {
  try {
    const { naam, omschrijving, onderdelen } = req.body;
    if (!naam) return void res.status(400).json({ error: "naam is verplicht" });
    const [rij] = await db
      .insert(constructieTemplatesTable)
      .values({
        naam,
        omschrijving: omschrijving ?? null,
        onderdelen: onderdelen ?? [],
        aangemaaktDoorId: req.session.userId,
      })
      .returning();
    return void res.status(201).json(mapTemplate(rij));
  } catch (err) {
    req.log.error(err);
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

// GET /constructie-templates/:id
router.get("/constructie-templates/:id", lezen, async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id));
    const [rij] = await db
      .select()
      .from(constructieTemplatesTable)
      .where(eq(constructieTemplatesTable.id, id));
    if (!rij) return void res.status(404).json({ error: "Niet gevonden" });
    return void res.json(mapTemplate(rij));
  } catch (err) {
    req.log.error(err);
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

// PATCH /constructie-templates/:id
router.patch("/constructie-templates/:id", schrijven, async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id));
    const { naam, omschrijving, onderdelen } = req.body;
    const patch: Partial<typeof constructieTemplatesTable.$inferInsert> & { bijgewerktOp: Date } = {
      bijgewerktOp: new Date(),
    };
    if (naam !== undefined) patch.naam = naam;
    if (omschrijving !== undefined) patch.omschrijving = omschrijving;
    if (onderdelen !== undefined) patch.onderdelen = onderdelen;
    const [rij] = await db
      .update(constructieTemplatesTable)
      .set(patch)
      .where(eq(constructieTemplatesTable.id, id))
      .returning();
    if (!rij) return void res.status(404).json({ error: "Niet gevonden" });
    return void res.json(mapTemplate(rij));
  } catch (err) {
    req.log.error(err);
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

// DELETE /constructie-templates/:id
router.delete("/constructie-templates/:id", schrijven, async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id));
    const [rij] = await db
      .delete(constructieTemplatesTable)
      .where(eq(constructieTemplatesTable.id, id))
      .returning();
    if (!rij) return void res.status(404).json({ error: "Niet gevonden" });
    return void res.status(204).send();
  } catch (err) {
    req.log.error(err);
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;
