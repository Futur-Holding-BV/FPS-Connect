import { Router } from "express";
import { db } from "@workspace/db";
import { aiAanroepenTable } from "@workspace/db";
import { desc, count, eq, and, gte, lte, sum } from "drizzle-orm";
import { requireRol } from "../middlewares/auth";

const router = Router();

router.get(
  "/api/beheer/ai-aanroepen",
  requireRol("hoofdbeheerder"),
  async (req, res) => {
    const pagina = Math.max(1, parseInt(String(req.query.pagina ?? "1"), 10) || 1);
    const perPagina = Math.min(200, Math.max(1, parseInt(String(req.query.per_pagina ?? "50"), 10) || 50));
    const moduleFilter = typeof req.query.module === "string" ? req.query.module.trim() : null;
    const statusFilter = typeof req.query.status === "string" ? req.query.status.trim() : null;
    const vanDatum = typeof req.query.van_datum === "string" ? req.query.van_datum.trim() : null;
    const totDatum = typeof req.query.tot_datum === "string" ? req.query.tot_datum.trim() : null;

    const offset = (pagina - 1) * perPagina;

    const conditions = [];
    if (moduleFilter) conditions.push(eq(aiAanroepenTable.module, moduleFilter));
    if (statusFilter) conditions.push(eq(aiAanroepenTable.status, statusFilter));
    if (vanDatum) {
      const van = new Date(vanDatum);
      if (!isNaN(van.getTime())) conditions.push(gte(aiAanroepenTable.aangemaaktOp, van));
    }
    if (totDatum) {
      const tot = new Date(totDatum + "T23:59:59.999Z");
      if (!isNaN(tot.getTime())) conditions.push(lte(aiAanroepenTable.aangemaaktOp, tot));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, [{ totaal }], [{ totaleKosten }]] = await Promise.all([
      db
        .select()
        .from(aiAanroepenTable)
        .where(where)
        .orderBy(desc(aiAanroepenTable.aangemaaktOp))
        .limit(perPagina)
        .offset(offset),
      db
        .select({ totaal: count() })
        .from(aiAanroepenTable)
        .where(where),
      db
        .select({ totaleKosten: sum(aiAanroepenTable.geschatteKostenEur) })
        .from(aiAanroepenTable)
        .where(where),
    ]);

    const items = rows.map((r) => ({
      id: r.id,
      aangemaakt_op: r.aangemaaktOp,
      module: r.module,
      functie: r.functie ?? null,
      gebruiker_id: r.gebruikerId ?? null,
      entiteitstype: r.entiteitstype ?? null,
      entiteit_id: r.entiteitId ?? null,
      model_slot: r.modelSlot,
      model_naam: r.modelNaam,
      prompt_naam: r.promptNaam ?? null,
      prompt_versie: r.promptVersie ?? null,
      prompt_hash: r.promptHash ?? null,
      prompt_tokens: r.promptTokens ?? null,
      completion_tokens: r.completionTokens ?? null,
      total_tokens: r.totalTokens ?? null,
      geschatte_kosten_eur: r.geschatteKostenEur ?? null,
      duur_ms: r.duurMs ?? null,
      status: r.status,
      foutmelding: r.foutmelding ?? null,
    }));

    res.json({
      items,
      totaal: Number(totaal),
      totale_kosten_eur: totaleKosten ?? null,
      pagina,
      per_pagina: perPagina,
    });
  },
);

export default router;
