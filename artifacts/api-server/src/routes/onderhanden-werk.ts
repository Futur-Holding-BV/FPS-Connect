import { Router, Request, Response } from "express";
import { eq, inArray, and, lte, notInArray, sql } from "drizzle-orm";
import {
  db,
  opdrachtenTable,
  offertesTable,
  gebouwenTable,
  urenRegistratiesTable,
  facturenTable,
  modCalcRegelsTable,
  onderhandenWerkOverridesTable,
} from "@workspace/db";
import { requireBevoegdheid } from "../middlewares/auth";

const router = Router();

function paramInt(val: unknown): number {
  const n = parseInt(String(val), 10);
  if (isNaN(n)) throw new Error(`Ongeldig getal: ${val}`);
  return n;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hulpfuncties
// ─────────────────────────────────────────────────────────────────────────────

function berekenWaardeOhw(opts: {
  methode: string;
  opdrachtsom: number | null;
  percentageGereed: number | null;
  geboekteKosten: number;
  gefactureerd: number;
  handmatigBedrag: number | null;
  budgetUren: number | null;
  geboekteUren: number;
}): number {
  const {
    methode, opdrachtsom, percentageGereed, geboekteKosten,
    gefactureerd, handmatigBedrag, budgetUren, geboekteUren,
  } = opts;

  let waardePrestatie = 0;

  if (methode === "handmatig" && handmatigBedrag != null) {
    waardePrestatie = handmatigBedrag;
  } else if (methode === "werkelijke_kosten") {
    waardePrestatie = geboekteKosten * 1.2;
  } else if (methode === "ai_voorstel" && budgetUren && budgetUren > 0) {
    const pct = Math.min(100, (geboekteUren / budgetUren) * 100);
    waardePrestatie = ((opdrachtsom ?? 0) * pct) / 100;
  } else {
    const pct = percentageGereed ?? 0;
    waardePrestatie = ((opdrachtsom ?? 0) * pct) / 100;
  }

  return Math.max(0, waardePrestatie - gefactureerd);
}

function berekenSignaleringen(opts: {
  methode: string;
  percentageGereed: number | null;
  geboekteKosten: number;
  geboekteUren: number;
  gefactureerd: number;
  opdrachtsom: number | null;
  begroteKosten: number | null;
  status: string;
  waardeOhw: number;
}): string[] {
  const {
    methode, percentageGereed, geboekteKosten, geboekteUren,
    gefactureerd, opdrachtsom, begroteKosten, status, waardeOhw,
  } = opts;

  const s: string[] = [];

  if (geboekteKosten > 0 && geboekteUren === 0) s.push("Uren ontbreken");
  if (methode === "percentage_gereed" && percentageGereed == null) s.push("Geen voortgang opgegeven");
  if (begroteKosten && begroteKosten > 0 && geboekteKosten > begroteKosten * 1.1) s.push("Begroting overschreden");
  if (geboekteKosten > 5000 && gefactureerd === 0) s.push("Hoge kosten, nog niets gefactureerd");
  if ((status === "afgerond" || status === "geannuleerd") && waardeOhw > 500) s.push("Project afgesloten maar OHW nog open");
  if (opdrachtsom && gefactureerd > opdrachtsom * 1.05) s.push("Gefactureerd overschrijdt opdrachtsom");
  if (opdrachtsom && geboekteKosten > 0 && (gefactureerd - geboekteKosten) < -(opdrachtsom * 0.05)) s.push("Negatieve marge");

  return s;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hoofd-aggregatiefunctie
// ─────────────────────────────────────────────────────────────────────────────

async function berekenItems(peildatum: string, statusFilter?: string) {
  const peilDate = peildatum;

  const opdrachten = statusFilter
    ? await db.select().from(opdrachtenTable).where(eq(opdrachtenTable.status, statusFilter))
    : await db.select().from(opdrachtenTable).where(notInArray(opdrachtenTable.status, ["geannuleerd"]));

  if (opdrachten.length === 0) return [];

  const opdrachtIds = opdrachten.map((o) => o.id);
  const projectIds  = opdrachten.map((o) => o.projectId).filter((x): x is number => x != null);
  const calcIds     = opdrachten.map((o) => o.calculatieId).filter((x): x is number => x != null);
  const offerteIds  = opdrachten.map((o) => o.offerteId).filter((x): x is number => x != null);
  const gebouwIds   = opdrachten.map((o) => o.gebouwId).filter((x): x is number => x != null);

  const [urenRows, inkoopRows, verkoopRows, calcRows, offerteRows, gebouwRows, overrideRows] = await Promise.all([

    opdrachtIds.length > 0
      ? db.select({
          opdrachtId: urenRegistratiesTable.opdrachtId,
          totaalUren: sql<string>`COALESCE(SUM(${urenRegistratiesTable.nettoUren}), 0)`,
        })
        .from(urenRegistratiesTable)
        .where(and(
          inArray(urenRegistratiesTable.opdrachtId, opdrachtIds),
          lte(urenRegistratiesTable.datum, peilDate),
          notInArray(urenRegistratiesTable.status, ["afgewezen"]),
        ))
        .groupBy(urenRegistratiesTable.opdrachtId)
      : ([] as { opdrachtId: number | null; totaalUren: string }[]),

    projectIds.length > 0
      ? db.select({
          projectId: facturenTable.projectId,
          totaalKosten: sql<string>`COALESCE(SUM(CAST(${facturenTable.bedragExclBtw} AS numeric)), 0)`,
        })
        .from(facturenTable)
        .where(and(
          inArray(facturenTable.projectId, projectIds),
          eq(facturenTable.type, "inkoop"),
          notInArray(facturenTable.status, ["afgekeurd", "geblokkeerd"]),
          sql`(${facturenTable.factuurdatum} IS NULL OR ${facturenTable.factuurdatum} <= ${peilDate})`,
        ))
        .groupBy(facturenTable.projectId)
      : ([] as { projectId: number | null; totaalKosten: string }[]),

    projectIds.length > 0
      ? db.select({
          projectId: facturenTable.projectId,
          totaalVerkoop: sql<string>`COALESCE(SUM(CAST(${facturenTable.bedragExclBtw} AS numeric)), 0)`,
        })
        .from(facturenTable)
        .where(and(
          inArray(facturenTable.projectId, projectIds),
          eq(facturenTable.type, "verkoop"),
          notInArray(facturenTable.status, ["afgekeurd"]),
          sql`(${facturenTable.factuurdatum} IS NULL OR ${facturenTable.factuurdatum} <= ${peilDate})`,
        ))
        .groupBy(facturenTable.projectId)
      : ([] as { projectId: number | null; totaalVerkoop: string }[]),

    calcIds.length > 0
      ? db.select({
          calculatieId: modCalcRegelsTable.calculatieId,
          totaalBegroting: sql<string>`COALESCE(SUM(${modCalcRegelsTable.totaal}), 0)`,
        })
        .from(modCalcRegelsTable)
        .where(inArray(modCalcRegelsTable.calculatieId, calcIds))
        .groupBy(modCalcRegelsTable.calculatieId)
      : ([] as { calculatieId: number; totaalBegroting: string }[]),

    offerteIds.length > 0
      ? db.select({ id: offertesTable.id, bedragExclBtw: offertesTable.bedragExclBtw })
        .from(offertesTable)
        .where(inArray(offertesTable.id, offerteIds))
      : ([] as { id: number; bedragExclBtw: number }[]),

    gebouwIds.length > 0
      ? db.select({ id: gebouwenTable.id, naam: gebouwenTable.naam })
        .from(gebouwenTable)
        .where(inArray(gebouwenTable.id, gebouwIds))
      : ([] as { id: number; naam: string }[]),

    db.select()
      .from(onderhandenWerkOverridesTable)
      .where(inArray(onderhandenWerkOverridesTable.opdrachtId, opdrachtIds)),
  ]);

  const urenMap     = new Map(urenRows.map((r) => [r.opdrachtId, Number(r.totaalUren)]));
  const inkoopMap   = new Map(inkoopRows.map((r) => [r.projectId, Number(r.totaalKosten)]));
  const verkoopMap  = new Map(verkoopRows.map((r) => [r.projectId, Number(r.totaalVerkoop)]));
  const calcMap     = new Map(calcRows.map((r) => [r.calculatieId, Number(r.totaalBegroting)]));
  const offerteMap  = new Map(offerteRows.map((r) => [r.id, r]));
  const gebouwMap   = new Map(gebouwRows.map((r) => [r.id, r.naam]));
  const overrideMap = new Map(overrideRows.map((r) => [r.opdrachtId, r]));

  return opdrachten.map((o) => {
    const offerte      = o.offerteId != null ? offerteMap.get(o.offerteId) : undefined;
    const opdrachtsom: number | null = offerte?.bedragExclBtw ?? null;
    const begroteKosten: number | null = o.calculatieId != null ? (calcMap.get(o.calculatieId) ?? null) : null;
    const geboekteUren  = urenMap.get(o.id) ?? 0;
    const geboekteKosten = o.projectId != null ? (inkoopMap.get(o.projectId) ?? 0) : 0;
    const gefactureerd   = o.projectId != null ? (verkoopMap.get(o.projectId) ?? 0) : 0;
    const gebouwNaam     = o.gebouwId != null ? (gebouwMap.get(o.gebouwId) ?? null) : null;

    const override   = overrideMap.get(o.id);
    const methode    = override?.waarderingsmethode ?? "percentage_gereed";
    const percentageGereed   = override?.percentageGereed ?? null;
    const handmatigBedrag    = override?.handmatigBedrag != null ? Number(override.handmatigBedrag) : null;
    const opmerkingen        = override?.opmerkingen ?? null;

    const waardeOhw = berekenWaardeOhw({
      methode, opdrachtsom, percentageGereed, geboekteKosten,
      gefactureerd, handmatigBedrag, budgetUren: o.budgetUren ?? null, geboekteUren,
    });

    const nogTeFactureren = Math.max(0, (opdrachtsom ?? 0) - gefactureerd);
    const actueleMargeAbs = gefactureerd > 0 ? gefactureerd - geboekteKosten : null;
    const verwachteMargePct = opdrachtsom && opdrachtsom > 0
      ? ((opdrachtsom - (begroteKosten ?? opdrachtsom * 0.8)) / opdrachtsom) * 100
      : null;

    const signaleringen = berekenSignaleringen({
      methode, percentageGereed, geboekteKosten, geboekteUren, gefactureerd,
      opdrachtsom, begroteKosten, status: o.status, waardeOhw,
    });

    return {
      opdracht_id:           o.id,
      titel:                 o.titel,
      werknummer:            o.werknummer ?? null,
      opdrachtgever:         o.opdrachtgever ?? null,
      werkmaatschappij:      null as string | null,
      gebouw_naam:           gebouwNaam,
      opdracht_status:       o.status,
      opdrachtsom,
      begrote_kosten:        begroteKosten,
      geboekte_uren:         geboekteUren,
      geboekte_kosten_inkoop: geboekteKosten,
      gefactureerd,
      nog_te_factureren:     nogTeFactureren,
      verwachte_marge_pct:   verwachteMargePct,
      actuele_marge:         actueleMargeAbs,
      percentage_gereed:     percentageGereed,
      waarde_ohw:            waardeOhw,
      waarderingsmethode:    methode,
      opmerkingen,
      signaleringen,
      aangemaakt_op:         o.aangemaaktOp.toISOString(),
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────

router.get("/financieel/onderhanden-werk", requireBevoegdheid("financieel", 1), async (req: Request, res: Response): Promise<void> => {
  const peildatum = typeof req.query["peildatum"] === "string"
    ? req.query["peildatum"]
    : new Date().toISOString().slice(0, 10);
  const status = typeof req.query["status"] === "string" ? req.query["status"] : undefined;

  const items = await berekenItems(peildatum, status);
  res.json(items);
});

router.patch("/financieel/onderhanden-werk/:opdracht_id", requireBevoegdheid("financieel", 2), async (req: Request, res: Response): Promise<void> => {
  const opdrachtId = paramInt(req.params["opdracht_id"]);
  const { waarderingsmethode, percentage_gereed, handmatig_bedrag, opmerkingen } = req.body as {
    waarderingsmethode?: string | null;
    percentage_gereed?: number | null;
    handmatig_bedrag?: number | null;
    opmerkingen?: string | null;
  };

  const [opdracht] = await db.select().from(opdrachtenTable).where(eq(opdrachtenTable.id, opdrachtId)).limit(1);
  if (!opdracht) { res.status(404).json({ error: "Opdracht niet gevonden" }); return; }

  const [existing] = await db.select().from(onderhandenWerkOverridesTable)
    .where(eq(onderhandenWerkOverridesTable.opdrachtId, opdrachtId)).limit(1);

  const updateData = {
    waarderingsmethode: waarderingsmethode ?? "percentage_gereed",
    percentageGereed:   percentage_gereed ?? null,
    handmatigBedrag:    handmatig_bedrag != null ? String(handmatig_bedrag) : null,
    opmerkingen:        opmerkingen ?? null,
    bijgewerktOp:       new Date(),
  };

  if (existing) {
    await db.update(onderhandenWerkOverridesTable).set(updateData)
      .where(eq(onderhandenWerkOverridesTable.id, existing.id));
  } else {
    await db.insert(onderhandenWerkOverridesTable).values({ opdrachtId, ...updateData });
  }

  const peildatum = new Date().toISOString().slice(0, 10);
  const items = await berekenItems(peildatum);
  const item = items.find((i) => i.opdracht_id === opdrachtId);
  if (!item) { res.status(404).json({ error: "Niet gevonden na opslaan" }); return; }
  res.json(item);
});

router.get("/financieel/jaarrekening/onderhanden-werk", requireBevoegdheid("financieel", 1), async (req: Request, res: Response): Promise<void> => {
  const peildatum = typeof req.query["peildatum"] === "string"
    ? req.query["peildatum"]
    : `${new Date().getFullYear() - 1}-12-31`;

  const items = await berekenItems(peildatum);

  const totalen = {
    totaal_opdrachtsom:     items.reduce((s, i) => s + (i.opdrachtsom ?? 0), 0),
    totaal_gefactureerd:    items.reduce((s, i) => s + i.gefactureerd, 0),
    totaal_nog_te_factureren: items.reduce((s, i) => s + i.nog_te_factureren, 0),
    totaal_waarde_ohw:      items.reduce((s, i) => s + i.waarde_ohw, 0),
    totaal_geboekte_kosten: items.reduce((s, i) => s + i.geboekte_kosten_inkoop, 0),
    aantal_projecten:       items.length,
    aantal_met_signalering: items.filter((i) => i.signaleringen.length > 0).length,
  };

  res.json({ peildatum, items, totalen });
});

export default router;
