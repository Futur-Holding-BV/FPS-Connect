import { Router } from "express";
import { db } from "@workspace/db";
import { spotStatusConfiguratieTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";

const router = Router();

// GET /spot-status-configuratie
router.get("/spot-status-configuratie", requireBevoegdheid("voorzieningen", 1), async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(spotStatusConfiguratieTable)
      .orderBy(spotStatusConfiguratieTable.volgorde);
    return res.json(
      rows.map((r) => ({
        status_code: r.statusCode,
        weergave_naam: r.weergaveNaam,
        volgorde: r.volgorde,
        actief: r.actief,
        fase_groep: r.faseGroep,
        bijgewerkt_op: r.bijgewerktOp?.toISOString(),
      }))
    );
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Interne serverfout" });
  }
});

// PATCH /spot-status-configuratie/:statusCode
router.patch(
  "/spot-status-configuratie/:statusCode",
  requireBevoegdheid("systeem", 2),
  async (req, res) => {
    try {
      const statusCode = String(req.params["statusCode"] ?? "");
      const { weergave_naam, actief, volgorde } = req.body as {
        weergave_naam?: string;
        actief?: boolean;
        volgorde?: number;
      };

      type UpdateSet = {
        bijgewerktOp: Date;
        weergaveNaam?: string;
        actief?: boolean;
        volgorde?: number;
      };
      const updateSet: UpdateSet = { bijgewerktOp: new Date() };
      if (weergave_naam !== undefined) updateSet.weergaveNaam = weergave_naam;
      if (actief !== undefined) updateSet.actief = actief;
      if (volgorde !== undefined) updateSet.volgorde = volgorde;

      const [row] = await db
        .update(spotStatusConfiguratieTable)
        .set(updateSet)
        .where(eq(spotStatusConfiguratieTable.statusCode, statusCode))
        .returning();

      if (!row) return res.status(404).json({ error: "Status niet gevonden" });

      return res.json({
        status_code: row.statusCode,
        weergave_naam: row.weergaveNaam,
        volgorde: row.volgorde,
        actief: row.actief,
        fase_groep: row.faseGroep,
        bijgewerkt_op: row.bijgewerktOp?.toISOString(),
      });
    } catch (err) {
      req.log.error(err);
      return res.status(500).json({ error: "Interne serverfout" });
    }
  }
);

export default router;
