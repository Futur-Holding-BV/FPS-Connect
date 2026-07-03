import { Router } from "express";
import { db } from "@workspace/db";
import { aiAanroepenTable } from "@workspace/db";
import { desc, count, eq, and, gte, lte, sql, sum } from "drizzle-orm";
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
    const gebouwIdFilter = req.query.gebouw_id ? parseInt(String(req.query.gebouw_id), 10) : null;
    const offerteIdFilter = req.query.offerte_id ? parseInt(String(req.query.offerte_id), 10) : null;
    const datumVan = typeof req.query.datum_van === "string" ? req.query.datum_van.trim() : null;
    const datumTot = typeof req.query.datum_tot === "string" ? req.query.datum_tot.trim() : null;

    const offset = (pagina - 1) * perPagina;

    const conditions = [];
    if (moduleFilter) conditions.push(eq(aiAanroepenTable.module, moduleFilter));
    if (statusFilter) conditions.push(eq(aiAanroepenTable.status, statusFilter));
    if (datumVan) {
      const van = new Date(datumVan);
      if (!isNaN(van.getTime())) conditions.push(gte(aiAanroepenTable.aangemaaktOp, van));
    }
    if (datumTot) {
      const tot = new Date(datumTot + "T23:59:59.999Z");
      if (!isNaN(tot.getTime())) conditions.push(lte(aiAanroepenTable.aangemaaktOp, tot));
    }
    if (gebouwIdFilter !== null && !isNaN(gebouwIdFilter)) {
      conditions.push(
        sql`(${aiAanroepenTable.contextJson}->>'gebouw_id')::int = ${gebouwIdFilter}`
      );
    }
    if (offerteIdFilter !== null && !isNaN(offerteIdFilter)) {
      conditions.push(
        sql`(${aiAanroepenTable.contextJson}->>'offerte_id')::int = ${offerteIdFilter}`
      );
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

    const ctx = (r: typeof rows[0]) => {
      const c = r.contextJson as Record<string, unknown> | null;
      return {
        gebouw_id: c?.gebouw_id != null ? Number(c.gebouw_id) : null,
        offerte_id: c?.offerte_id != null ? Number(c.offerte_id) : null,
        project_id: c?.project_id != null ? Number(c.project_id) : null,
      };
    };

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
      ...ctx(r),
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

router.get(
  "/api/beheer/ai-aanroepen/aggregaat",
  requireRol("hoofdbeheerder"),
  async (req, res) => {
    const moduleFilter = typeof req.query.module === "string" ? req.query.module.trim() : null;
    const datumVan = typeof req.query.datum_van === "string" ? req.query.datum_van.trim() : null;
    const datumTot = typeof req.query.datum_tot === "string" ? req.query.datum_tot.trim() : null;

    const conditions = [];
    if (moduleFilter) conditions.push(eq(aiAanroepenTable.module, moduleFilter));
    if (datumVan) {
      const van = new Date(datumVan);
      if (!isNaN(van.getTime())) conditions.push(gte(aiAanroepenTable.aangemaaktOp, van));
    }
    if (datumTot) {
      const tot = new Date(datumTot + "T23:59:59.999Z");
      if (!isNaN(tot.getTime())) conditions.push(lte(aiAanroepenTable.aangemaaktOp, tot));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const perModule = await db
      .select({
        module: aiAanroepenTable.module,
        aanroepen: count(),
        kosten_eur: sql<string>`COALESCE(SUM(${aiAanroepenTable.geschatteKostenEur}), 0)::text`,
        tokens: sql<number>`COALESCE(SUM(${aiAanroepenTable.totalTokens}), 0)::int`,
      })
      .from(aiAanroepenTable)
      .where(where)
      .groupBy(aiAanroepenTable.module)
      .orderBy(sql`SUM(${aiAanroepenTable.geschatteKostenEur}) DESC NULLS LAST`);

    const totaalAanroepen = perModule.reduce((s, r) => s + Number(r.aanroepen), 0);
    const totaalKosten = perModule.reduce((s, r) => s + parseFloat(r.kosten_eur || "0"), 0);
    const totaalTokens = perModule.reduce((s, r) => s + Number(r.tokens), 0);

    res.json({
      totaal_aanroepen: totaalAanroepen,
      totaal_kosten_eur: totaalKosten.toFixed(6),
      totaal_tokens: totaalTokens,
      per_module: perModule.map((r) => ({
        module: r.module,
        aanroepen: Number(r.aanroepen),
        kosten_eur: parseFloat(r.kosten_eur || "0").toFixed(6),
        tokens: Number(r.tokens),
      })),
    });
  },
);

export default router;
