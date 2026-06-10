import { Router } from "express";
import { db, profielenTable } from "@workspace/db";
import { asc, eq } from "drizzle-orm";
import { requireBevoegdheid, requireRol } from "../middlewares/auth";

const router = Router();

function serialiseer(p: typeof profielenTable.$inferSelect) {
  return {
    id: p.id,
    naam: p.naam,
    bevoegdheden: (p.bevoegdheden as Record<string, number>) ?? {},
    systeem: p.systeem,
    aangemaakt_op: p.aangemaaktOp.toISOString(),
  };
}

router.get("/profielen", requireBevoegdheid("gebruikers", 1), async (req, res) => {
  try {
    const profielen = await db
      .select()
      .from(profielenTable)
      .orderBy(asc(profielenTable.id));
    res.json(profielen.map(serialiseer));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post("/profielen", requireRol("hoofdbeheerder"), async (req, res) => {
  try {
    const naam = String(req.body?.naam ?? "").trim();
    if (!naam) {
      res.status(400).json({ error: "Naam is verplicht" });
      return;
    }
    const bevoegdheden = (req.body?.bevoegdheden ?? {}) as Record<string, number>;
    const [bestaand] = await db
      .select({ id: profielenTable.id })
      .from(profielenTable)
      .where(eq(profielenTable.naam, naam));
    if (bestaand) {
      res.status(409).json({ error: "Er bestaat al een profiel met deze naam" });
      return;
    }
    const [nieuw] = await db
      .insert(profielenTable)
      .values({ naam, bevoegdheden, systeem: false })
      .returning();
    res.status(201).json(serialiseer(nieuw));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.patch("/profielen/:id", requireRol("hoofdbeheerder"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Ongeldig id" });
      return;
    }
    const [profiel] = await db
      .select()
      .from(profielenTable)
      .where(eq(profielenTable.id, id));
    if (!profiel) {
      res.status(404).json({ error: "Profiel niet gevonden" });
      return;
    }
    const naam = String(req.body?.naam ?? "").trim();
    if (!naam) {
      res.status(400).json({ error: "Naam is verplicht" });
      return;
    }
    const bevoegdheden = (req.body?.bevoegdheden ?? {}) as Record<string, number>;
    const [naamConflict] = await db
      .select({ id: profielenTable.id })
      .from(profielenTable)
      .where(eq(profielenTable.naam, naam));
    if (naamConflict && naamConflict.id !== id) {
      res.status(409).json({ error: "Er bestaat al een profiel met deze naam" });
      return;
    }
    const [bijgewerkt] = await db
      .update(profielenTable)
      .set({ naam, bevoegdheden })
      .where(eq(profielenTable.id, id))
      .returning();
    res.json(serialiseer(bijgewerkt));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.delete("/profielen/:id", requireRol("hoofdbeheerder"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Ongeldig id" });
      return;
    }
    const [profiel] = await db
      .select()
      .from(profielenTable)
      .where(eq(profielenTable.id, id));
    if (!profiel) {
      res.status(404).json({ error: "Profiel niet gevonden" });
      return;
    }
    if (profiel.systeem) {
      res.status(403).json({ error: "Systeemprofielen kunnen niet worden verwijderd" });
      return;
    }
    await db.delete(profielenTable).where(eq(profielenTable.id, id));
    res.status(204).end();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;
