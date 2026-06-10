import { Router } from "express";
import { db, profielenTable } from "@workspace/db";
import { asc } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";

const router = Router();

router.get("/profielen", requireBevoegdheid("gebruikers", 1), async (req, res) => {
  try {
    const profielen = await db
      .select()
      .from(profielenTable)
      .orderBy(asc(profielenTable.id));
    res.json(
      profielen.map((p) => ({
        id: p.id,
        naam: p.naam,
        bevoegdheden: (p.bevoegdheden as Record<string, number>) ?? {},
        systeem: p.systeem,
        aangemaakt_op: p.aangemaaktOp.toISOString(),
      })),
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;
