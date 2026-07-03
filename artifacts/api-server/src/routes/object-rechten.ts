import { Router } from "express";
import { db, objectRechtenTable, gebruikersTable, gebouwenTable } from "@workspace/db";
import { eq, and, gt, isNull, or } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";

function parseId(str: string | string[] | undefined): number | null {
  const s = Array.isArray(str) ? str[0] : str;
  const n = parseInt(s ?? "", 10);
  return isNaN(n) || n <= 0 ? null : n;
}

const router = Router();
const alleenBeheerder = requireBevoegdheid("gebruikers", 4);

// ── Helpers ─────────────────────────────────────────────────────────────────

function niveauLabel(niveau: number): string {
  const labels: Record<number, string> = {
    0: "Geen toegang", 1: "Lezen", 2: "Bewerken", 3: "Volledig", 4: "Beheren",
  };
  return labels[niveau] ?? String(niveau);
}

async function verrijkRecht(r: typeof objectRechtenTable.$inferSelect) {
  let objectNaam: string | null = null;
  if (r.objectType === "gebouw") {
    const [g] = await db
      .select({ naam: gebouwenTable.naam })
      .from(gebouwenTable)
      .where(eq(gebouwenTable.id, r.objectId));
    objectNaam = g?.naam ?? null;
  }
  const [verleendDoorGebruiker] = r.verleendDoor
    ? await db
        .select({ naam: gebruikersTable.naam })
        .from(gebruikersTable)
        .where(eq(gebruikersTable.id, r.verleendDoor))
    : [null];

  const nu = new Date();
  const verlopen =
    r.geldigTot !== null && r.geldigTot <= nu;

  return {
    id: r.id,
    objectType: r.objectType,
    objectId: r.objectId,
    objectNaam,
    moduleId: r.moduleId,
    niveau: r.niveau,
    niveauLabel: niveauLabel(r.niveau),
    geldigVan: r.geldigVan,
    geldigTot: r.geldigTot,
    tijdelijk: r.geldigTot !== null,
    verlopen,
    werkmaatschappijId: r.werkmaatschappijId,
    reden: r.reden,
    verleendDoorNaam: verleendDoorGebruiker?.naam ?? null,
    aangemaaktOp: r.aangemaaktOp,
  };
}

// ── Routes ───────────────────────────────────────────────────────────────────

// GET /object-rechten — alle actieve rechten (alleen beheerder)
router.get("/object-rechten", alleenBeheerder, async (req, res) => {
  try {
    const nu = new Date();
    const rijen = await db
      .select()
      .from(objectRechtenTable)
      .where(or(isNull(objectRechtenTable.geldigTot), gt(objectRechtenTable.geldigTot, nu)));

    const data = await Promise.all(rijen.map(verrijkRecht));
    res.json(data);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// GET /gebruikers/:id/object-rechten — rechten van één gebruiker
router.get("/gebruikers/:id/object-rechten", alleenBeheerder, async (req, res) => {
  const gebruikerId = parseId(req.params.id);
  if (!gebruikerId) { res.status(400).json({ error: "Ongeldig id" }); return; }

  try {
    const rijen = await db
      .select()
      .from(objectRechtenTable)
      .where(eq(objectRechtenTable.gebruikerId, gebruikerId));

    const data = await Promise.all(rijen.map(verrijkRecht));
    res.json(data);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /gebruikers/:id/object-rechten — verleen een recht
router.post("/gebruikers/:id/object-rechten", alleenBeheerder, async (req, res) => {
  const gebruikerId = parseId(req.params.id);
  if (!gebruikerId) { res.status(400).json({ error: "Ongeldig id" }); return; }

  const {
    objectType, objectId, moduleId = null, niveau = 1,
    geldigVan = null, geldigTot = null, reden = null,
    werkmaatschappijId = null,
  } = req.body as {
    objectType?: string;
    objectId?: number;
    moduleId?: string | null;
    niveau?: number;
    geldigVan?: string | null;
    geldigTot?: string | null;
    reden?: string | null;
    werkmaatschappijId?: number | null;
  };

  if (!objectType || !objectId) {
    res.status(400).json({ error: "objectType en objectId zijn verplicht" });
    return;
  }
  if (niveau < 0 || niveau > 4) {
    res.status(400).json({ error: "niveau moet tussen 0 en 4 liggen" });
    return;
  }

  try {
    const [rij] = await db
      .insert(objectRechtenTable)
      .values({
        gebruikerId,
        objectType,
        objectId,
        moduleId,
        niveau,
        geldigVan: geldigVan ? new Date(geldigVan) : null,
        geldigTot: geldigTot ? new Date(geldigTot) : null,
        verleendDoor: req.session.userId!,
        werkmaatschappijId,
        reden,
      })
      .returning();

    res.status(201).json(await verrijkRecht(rij));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// PATCH /object-rechten/:id — pas niveau of looptijd aan
router.patch("/object-rechten/:id", alleenBeheerder, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Ongeldig id" }); return; }

  const { niveau, geldigVan, geldigTot, reden } = req.body as {
    niveau?: number;
    geldigVan?: string | null;
    geldigTot?: string | null;
    reden?: string | null;
  };

  try {
    const updates: Partial<typeof objectRechtenTable.$inferInsert> = {};
    if (niveau !== undefined) {
      if (niveau < 0 || niveau > 4) {
        res.status(400).json({ error: "niveau moet tussen 0 en 4 liggen" });
        return;
      }
      updates.niveau = niveau;
    }
    if (geldigVan !== undefined) updates.geldigVan = geldigVan ? new Date(geldigVan) : null;
    if (geldigTot !== undefined) updates.geldigTot = geldigTot ? new Date(geldigTot) : null;
    if (reden !== undefined) updates.reden = reden;

    const [rij] = await db
      .update(objectRechtenTable)
      .set(updates)
      .where(eq(objectRechtenTable.id, id))
      .returning();

    if (!rij) { res.status(404).json({ error: "Recht niet gevonden" }); return; }
    res.json(await verrijkRecht(rij));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// DELETE /object-rechten/:id — trek recht in
router.delete("/object-rechten/:id", alleenBeheerder, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Ongeldig id" }); return; }

  try {
    const [verwijderd] = await db
      .delete(objectRechtenTable)
      .where(eq(objectRechtenTable.id, id))
      .returning({ id: objectRechtenTable.id });

    if (!verwijderd) { res.status(404).json({ error: "Recht niet gevonden" }); return; }
    res.json({ verwijderd: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;
