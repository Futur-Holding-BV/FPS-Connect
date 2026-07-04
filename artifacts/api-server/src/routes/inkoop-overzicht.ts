import { Router } from "express";
import { db } from "@workspace/db";
import {
  inkoopbonnenTable,
  inkoopbonRegelsTable,
  opdrachtenTable,
} from "@workspace/db";
import { eq, and, gte, lte, ilike, sql, count } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";

const router = Router();
const lezen = requireBevoegdheid("offertes", 1);

// GET /inkoop/overzicht — globaal cross-project inkoopbon overzicht
router.get("/inkoop/overzicht", lezen, async (req, res): Promise<void> => {
  try {
    const {
      status,
      leverancier,
      opdracht_id,
      van,
      tot,
    } = req.query as Record<string, string | undefined>;

    const conds: ReturnType<typeof eq>[] = [];
    if (status) conds.push(eq(inkoopbonnenTable.status, status));
    if (leverancier) conds.push(ilike(inkoopbonnenTable.leverancier, `%${leverancier}%`));
    if (opdracht_id) conds.push(eq(inkoopbonnenTable.opdrachtId, parseInt(opdracht_id)));
    if (van) conds.push(gte(inkoopbonnenTable.aangemaaktOp, new Date(van)));
    if (tot) {
      const totDate = new Date(tot);
      totDate.setHours(23, 59, 59, 999);
      conds.push(lte(inkoopbonnenTable.aangemaaktOp, totDate));
    }

    const rijen = await db
      .select({
        bon: inkoopbonnenTable,
        opdracht_titel: opdrachtenTable.titel,
        opdracht_nummer: opdrachtenTable.werknummer,
        aantal_regels: sql<number>`count(${inkoopbonRegelsTable.id})`,
      })
      .from(inkoopbonnenTable)
      .leftJoin(opdrachtenTable, eq(inkoopbonnenTable.opdrachtId, opdrachtenTable.id))
      .leftJoin(inkoopbonRegelsTable, eq(inkoopbonRegelsTable.inkoopbonId, inkoopbonnenTable.id))
      .where(conds.length > 0 ? and(...(conds as [typeof conds[0], ...typeof conds])) : undefined)
      .groupBy(inkoopbonnenTable.id, opdrachtenTable.titel, opdrachtenTable.werknummer)
      .orderBy(sql`${inkoopbonnenTable.aangemaaktOp} desc`)
      .limit(500);

    res.json(rijen.map((r) => ({
      id: r.bon.id,
      bon_nummer: r.bon.bonNummer,
      opdracht_id: r.bon.opdrachtId,
      opdracht_titel: r.opdracht_titel ?? null,
      opdracht_nummer: r.opdracht_nummer ?? null,
      leverancier: r.bon.leverancier,
      status: r.bon.status,
      totaal_bedrag: r.bon.totaalBedrag ?? null,
      gewenste_leverdatum: r.bon.gewensteLeverdatum ?? null,
      verzonden_op: r.bon.verzondenOp?.toISOString() ?? null,
      aangemaakt_op: r.bon.aangemaaktOp.toISOString(),
      aantal_regels: Number(r.aantal_regels),
    })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;
