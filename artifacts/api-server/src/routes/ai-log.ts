import { Router } from "express";
import { db } from "@workspace/db";
import { aiAanroepenTable, appInstellingenTable, gebouwenTable, offertesTable } from "@workspace/db";
import { desc, count, eq, and, gte, lte, sql, sum, ilike, getTableColumns } from "drizzle-orm";
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
    const gebouwNaamFilter = typeof req.query.gebouw_naam === "string" && req.query.gebouw_naam.trim() ? req.query.gebouw_naam.trim() : null;
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
    if (gebouwNaamFilter) {
      conditions.push(ilike(gebouwenTable.naam, `%${gebouwNaamFilter}%`));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const offerteReferentieExpr = sql<string | null>`COALESCE(${offertesTable.offertenummer}, ${offertesTable.titel})`;

    const [rows, [{ totaal }], [{ totaleKosten }]] = await Promise.all([
      db
        .select({
          ...getTableColumns(aiAanroepenTable),
          gebouwNaam: gebouwenTable.naam,
          offerteReferentie: offerteReferentieExpr,
        })
        .from(aiAanroepenTable)
        .leftJoin(
          gebouwenTable,
          sql`${gebouwenTable.id} = (${aiAanroepenTable.contextJson}->>'gebouw_id')::int`
        )
        .leftJoin(
          offertesTable,
          sql`${offertesTable.id} = (${aiAanroepenTable.contextJson}->>'offerte_id')::int`
        )
        .where(where)
        .orderBy(desc(aiAanroepenTable.aangemaaktOp))
        .limit(perPagina)
        .offset(offset),
      db
        .select({ totaal: count() })
        .from(aiAanroepenTable)
        .leftJoin(
          gebouwenTable,
          sql`${gebouwenTable.id} = (${aiAanroepenTable.contextJson}->>'gebouw_id')::int`
        )
        .where(where),
      db
        .select({ totaleKosten: sum(aiAanroepenTable.geschatteKostenEur) })
        .from(aiAanroepenTable)
        .leftJoin(
          gebouwenTable,
          sql`${gebouwenTable.id} = (${aiAanroepenTable.contextJson}->>'gebouw_id')::int`
        )
        .where(where),
    ]);

    const ctx = (r: typeof rows[0]) => {
      const c = r.contextJson as Record<string, unknown> | null;
      return {
        gebouw_id: c?.gebouw_id != null ? Number(c.gebouw_id) : null,
        gebouw_naam: r.gebouwNaam ?? null,
        offerte_id: c?.offerte_id != null ? Number(c.offerte_id) : null,
        offerte_referentie: r.offerteReferentie ?? null,
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
  "/api/beheer/ai-aanroepen/export",
  requireRol("hoofdbeheerder"),
  async (req, res) => {
    const moduleFilter = typeof req.query.module === "string" ? req.query.module.trim() : null;
    const statusFilter = typeof req.query.status === "string" ? req.query.status.trim() : null;
    const gebouwIdFilter = req.query.gebouw_id ? parseInt(String(req.query.gebouw_id), 10) : null;
    const offerteIdFilter = req.query.offerte_id ? parseInt(String(req.query.offerte_id), 10) : null;
    const datumVan = typeof req.query.datum_van === "string" ? req.query.datum_van.trim() : null;
    const datumTot = typeof req.query.datum_tot === "string" ? req.query.datum_tot.trim() : null;

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

    const rows = await db
      .select()
      .from(aiAanroepenTable)
      .where(where)
      .orderBy(desc(aiAanroepenTable.aangemaaktOp));

    const escapeCell = (val: string | number | null | undefined): string => {
      if (val == null) return "";
      let s = String(val);
      // Voorkom CSV-formule-injectie: prefix gevaarlijke starters met een apostrof
      if (s.length > 0 && "=+-@\t\r".includes(s[0]!)) {
        s = `'${s}`;
      }
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const header = [
      "datum",
      "module",
      "functie",
      "model",
      "tokens",
      "kosten_eur",
      "duur_ms",
      "status",
      "gebouw_id",
      "offerte_id",
    ].join(",");

    const lines = rows.map((r) => {
      const ctx = r.contextJson as Record<string, unknown> | null;
      const gebouwId = ctx?.gebouw_id != null ? Number(ctx.gebouw_id) : null;
      const offerteId = ctx?.offerte_id != null ? Number(ctx.offerte_id) : null;
      return [
        escapeCell(r.aangemaaktOp.toISOString()),
        escapeCell(r.module),
        escapeCell(r.functie),
        escapeCell(r.modelNaam),
        escapeCell(r.totalTokens),
        escapeCell(r.geschatteKostenEur),
        escapeCell(r.duurMs),
        escapeCell(r.status),
        escapeCell(gebouwId),
        escapeCell(offerteId),
      ].join(",");
    });

    const vanDeel = datumVan ? datumVan : (rows.length > 0 ? rows[rows.length - 1].aangemaaktOp.toISOString().slice(0, 10) : "");
    const totDeel = datumTot ? datumTot : (rows.length > 0 ? rows[0].aangemaaktOp.toISOString().slice(0, 10) : "");
    const bestandsnaam = vanDeel && totDeel
      ? `ai-aanroepen-${vanDeel}-${totDeel}.csv`
      : "ai-aanroepen.csv";

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${bestandsnaam}"`);
    res.send([header, ...lines].join("\r\n"));
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

router.get(
  "/api/beheer/ai-drempel-status",
  requireRol("hoofdbeheerder"),
  async (req, res) => {
    const [instelling] = await db
      .select()
      .from(appInstellingenTable)
      .orderBy(appInstellingenTable.id)
      .limit(1);

    const drempel = instelling?.aiKostendrempelEur != null
      ? parseFloat(instelling.aiKostendrempelEur)
      : null;

    const nu = new Date();
    const maandStart = new Date(nu.getFullYear(), nu.getMonth(), 1);

    const [{ totaalKosten }] = await db
      .select({
        totaalKosten: sql<string>`COALESCE(SUM(${aiAanroepenTable.geschatteKostenEur}), '0')::text`,
      })
      .from(aiAanroepenTable)
      .where(gte(aiAanroepenTable.aangemaaktOp, maandStart));

    const kosten = parseFloat(totaalKosten);

    res.json({
      drempel_eur: drempel,
      huidig_maand_kosten_eur: kosten,
      overschreden: drempel != null && kosten > drempel,
    });
  },
);

export default router;
