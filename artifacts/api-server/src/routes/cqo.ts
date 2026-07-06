import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import {
  db,
  cqoRunsTable,
  cqoBevindingTable,
  cqoVerbeterpuntTable,
} from "@workspace/db";
import { eq, desc, and, sql } from "drizzle-orm";
import { voerCqoBeoordelingUit } from "../services/cqo/engine";
import { getAzureOverzicht } from "../services/cqo/azure-status";

const router = Router();

function alleenHoofdbeheerder(
  req: Parameters<typeof requireAuth>[0],
  res: Parameters<typeof requireAuth>[1],
  next: Parameters<typeof requireAuth>[2]
) {
  if (req.session.rol !== "hoofdbeheerder") {
    res.status(403).json({ error: "Alleen toegankelijk voor hoofdbeheerder" });
    return;
  }
  next();
}

// POST /cqo/beoordeling — nieuwe CQO-beoordeling starten
router.post("/cqo/beoordeling", requireAuth, alleenHoofdbeheerder, async (req, res) => {
  const sessie = req.session as unknown as Record<string, unknown>;
  const gebruikerId = (sessie["gebruikerId"] as number | null) ?? 0;
  const gebruikerNaam = (sessie["naam"] as string | null) ?? "Onbekend";

  const versieLabel = typeof req.body?.versieLabel === "string"
    ? req.body.versieLabel.trim().slice(0, 100)
    : null;

  const [run] = await db
    .insert(cqoRunsTable)
    .values({
      versieLabel,
      gestarttDoor: gebruikerId,
      gestarttDoorNaam: gebruikerNaam,
    })
    .returning({ id: cqoRunsTable.id });

  // Asynchroon uitvoeren — geef 202 terug
  void voerCqoBeoordelingUit(run.id, gebruikerId);

  res.status(202).json({ id: run.id, status: "lopend" });
});

// GET /cqo/beoordelingen — lijst van runs
router.get("/cqo/beoordelingen", requireAuth, alleenHoofdbeheerder, async (req, res) => {
  const pagina = Math.max(1, parseInt(String(req.query["pagina"] ?? "1"), 10));
  const perPagina = 20;
  const offset = (pagina - 1) * perPagina;

  const [runs, [{ totaal }]] = await Promise.all([
    db
      .select()
      .from(cqoRunsTable)
      .orderBy(desc(cqoRunsTable.gestarttOp))
      .limit(perPagina)
      .offset(offset),
    db.select({ totaal: sql<number>`count(*)::int` }).from(cqoRunsTable),
  ]);

  res.json({ runs, totaal, pagina, perPagina });
});

// GET /cqo/beoordelingen/:id — run-detail
router.get("/cqo/beoordelingen/:id", requireAuth, alleenHoofdbeheerder, async (req, res) => {
  const runId = parseInt(String(req.params["id"]), 10);
  if (isNaN(runId)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  const [run] = await db.select().from(cqoRunsTable).where(eq(cqoRunsTable.id, runId));
  if (!run) { res.status(404).json({ error: "Niet gevonden" }); return; }

  res.json(run);
});

// GET /cqo/beoordelingen/:id/bevindingen — bevindingen van een run
router.get("/cqo/beoordelingen/:id/bevindingen", requireAuth, alleenHoofdbeheerder, async (req, res) => {
  const runId = parseInt(String(req.params["id"]), 10);
  if (isNaN(runId)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  const ernsFilter = String(req.query["ernst"] ?? "");
  const catFilter = String(req.query["categorie"] ?? "");
  const positiefFilter = req.query["positief"];

  const conditions = [eq(cqoBevindingTable.runId, runId)];
  if (ernsFilter) conditions.push(eq(cqoBevindingTable.ernst, ernsFilter));
  if (catFilter) conditions.push(eq(cqoBevindingTable.categorie, catFilter));
  if (positiefFilter === "true") conditions.push(eq(cqoBevindingTable.positief, true));
  if (positiefFilter === "false") conditions.push(eq(cqoBevindingTable.positief, false));

  const bevindingen = await db
    .select()
    .from(cqoBevindingTable)
    .where(conditions.length > 1 ? and(...conditions) : conditions[0])
    .orderBy(cqoBevindingTable.ernst, cqoBevindingTable.aangemaaktOp);

  res.json(bevindingen);
});

// GET /cqo/beoordelingen/:id/verbeterpunten — verbeterpunten van een run
router.get("/cqo/beoordelingen/:id/verbeterpunten", requireAuth, alleenHoofdbeheerder, async (req, res) => {
  const runId = parseInt(String(req.params["id"]), 10);
  if (isNaN(runId)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  const verbeterpunten = await db
    .select()
    .from(cqoVerbeterpuntTable)
    .where(eq(cqoVerbeterpuntTable.runId, runId))
    .orderBy(cqoVerbeterpuntTable.urgentie, cqoVerbeterpuntTable.aangemaaktOp);

  res.json(verbeterpunten);
});

// GET /cqo/dashboard — meest recente voltooide beoordeling als dashboard
router.get("/cqo/dashboard", requireAuth, alleenHoofdbeheerder, async (_req, res) => {
  const [run] = await db
    .select()
    .from(cqoRunsTable)
    .where(eq(cqoRunsTable.status, "voltooid"))
    .orderBy(desc(cqoRunsTable.gestarttOp))
    .limit(1);

  if (!run) {
    res.json({ run: null, bevindingen: [], verbeterpunten: [] });
    return;
  }

  const [bevindingen, verbeterpunten] = await Promise.all([
    db.select().from(cqoBevindingTable).where(eq(cqoBevindingTable.runId, run.id)),
    db
      .select()
      .from(cqoVerbeterpuntTable)
      .where(eq(cqoVerbeterpuntTable.runId, run.id))
      .orderBy(cqoVerbeterpuntTable.urgentie),
  ]);

  res.json({ run, bevindingen, verbeterpunten });
});

// GET /cqo/azure-status — Azure-afhankelijkheden
router.get("/cqo/azure-status", requireAuth, alleenHoofdbeheerder, (_req, res) => {
  res.json(getAzureOverzicht());
});

// GET /cqo/score — huidige score voor CI-integratie
router.get("/cqo/score", requireAuth, alleenHoofdbeheerder, async (_req, res) => {
  const [run] = await db
    .select({
      id: cqoRunsTable.id,
      totaalScore: cqoRunsTable.totaalScore,
      releaseStatus: cqoRunsTable.releaseStatus,
      releaseGeblokkeerd: cqoRunsTable.releaseGeblokkeerd,
      gestarttOp: cqoRunsTable.gestarttOp,
    })
    .from(cqoRunsTable)
    .where(eq(cqoRunsTable.status, "voltooid"))
    .orderBy(desc(cqoRunsTable.gestarttOp))
    .limit(1);

  if (!run) { res.json({ score: null, status: null, geblokkeerd: false }); return; }

  res.json({
    score: run.totaalScore ? parseFloat(String(run.totaalScore)) : null,
    status: run.releaseStatus,
    geblokkeerd: run.releaseGeblokkeerd,
    runId: run.id,
    beoordeeldOp: run.gestarttOp,
  });
});

export { router as cqoRouter };
