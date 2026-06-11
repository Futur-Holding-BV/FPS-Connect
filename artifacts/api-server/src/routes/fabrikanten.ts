import { Router } from "express";
import { db, fabrikantenTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { herbenoemFabrikantOpToepassingen } from "../lib/classificatie";

const router = Router();

function mapFabrikant(f: typeof fabrikantenTable.$inferSelect) {
  return {
    id: f.id,
    naam: f.naam,
    url: f.url,
    gearchiveerd: f.gearchiveerd,
    aangemaakt_op: f.aangemaaktOp.toISOString(),
    bijgewerkt_op: f.bijgewerktOp.toISOString(),
  };
}

function normaliseerUrl(url: unknown): string | null {
  return url != null && String(url).trim() ? String(url).trim() : null;
}

// GET /fabrikanten
router.get("/fabrikanten", async (req, res) => {
  try {
    const inclusiefGearchiveerd = req.query.inclusief_gearchiveerd === "true";
    let rows = await db
      .select()
      .from(fabrikantenTable)
      .orderBy(asc(fabrikantenTable.naam));
    if (!inclusiefGearchiveerd) rows = rows.filter((f) => !f.gearchiveerd);
    res.json(rows.map(mapFabrikant));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /fabrikanten (beheerder)
router.post("/fabrikanten", requireBevoegdheid("bibliotheek", 3), async (req, res) => {
  try {
    const { naam, url } = req.body;
    if (!naam || !String(naam).trim()) {
      return res.status(400).json({ error: "naam is verplicht" });
    }
    const [f] = await db
      .insert(fabrikantenTable)
      .values({ naam: String(naam).trim(), url: normaliseerUrl(url) })
      .returning();
    return res.status(201).json(mapFabrikant(f));
  } catch (err) {
    if ((err as { code?: string })?.code === "23505") {
      return res.status(409).json({ error: "Er bestaat al een fabrikant met deze naam" });
    }
    req.log.error(err);
    return res.status(500).json({ error: "Interne serverfout" });
  }
});

// PATCH /fabrikanten/:id (beheerder)
router.patch("/fabrikanten/:id", requireBevoegdheid("bibliotheek", 2), async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const { naam, url, gearchiveerd } = req.body;
    const set: Record<string, unknown> = { bijgewerktOp: new Date() };
    if (naam !== undefined) {
      if (!String(naam).trim()) return res.status(400).json({ error: "naam mag niet leeg zijn" });
      set.naam = String(naam).trim();
    }
    if (url !== undefined) set.url = normaliseerUrl(url);
    if (gearchiveerd !== undefined) set.gearchiveerd = gearchiveerd === true;

    const [f] = await db
      .update(fabrikantenTable)
      .set(set)
      .where(eq(fabrikantenTable.id, id))
      .returning();
    if (!f) return res.status(404).json({ error: "Fabrikant niet gevonden" });
    // Hernoemen werkt door naar gekoppelde toepassingen: de gedenormaliseerde
    // fabrikant-naam op de labels wordt bijgewerkt.
    if (set.naam !== undefined) {
      await herbenoemFabrikantOpToepassingen(f.id, f.naam);
    }
    return res.json(mapFabrikant(f));
  } catch (err) {
    if ((err as { code?: string })?.code === "23505") {
      return res.status(409).json({ error: "Er bestaat al een fabrikant met deze naam" });
    }
    req.log.error(err);
    return res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;
