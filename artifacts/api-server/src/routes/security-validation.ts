import { veiligeFoutmelding } from "../middlewares/foutafhandelaar";
import { Router } from "express";
import { db, securityScanRunsTable, securityTestResultatenTable, securityReleasesTable } from "@workspace/db";
import { desc, eq, and, like, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { startScanRun, haalScanStats, ALLE_SCENARIOS } from "../services/security-validation/engine";
import type { TestCategorie } from "../services/security-validation/types";

const router = Router();

function alleenHoofdbeheerder(
  req: Parameters<typeof requireAuth>[0],
  res: Parameters<typeof requireAuth>[1],
  next: Parameters<typeof requireAuth>[2],
) {
  const sessie = req.session as unknown as Record<string, unknown> | undefined;
  if (sessie?.rol !== "hoofdbeheerder") {
    res.status(403).json({ fout: "Alleen toegankelijk voor de hoofdbeheerder." });
    return;
  }
  next();
}

// ── Testbibliotheek overzicht ─────────────────────────────────────────────────

router.get("/security-validation/bibliotheek", requireAuth, alleenHoofdbeheerder, async (_req, res) => {
  try {
    const stats = await haalScanStats();
    res.json({ ...stats, scenarios: ALLE_SCENARIOS.slice(0, 50) });
  } catch {
    res.status(500).json({ fout: "Kon bibliotheek niet laden." });
  }
});

// ── Scan starten ──────────────────────────────────────────────────────────────

router.post("/security-validation/scan", requireAuth, alleenHoofdbeheerder, async (req, res) => {
  try {
    const sessie = req.session as unknown as Record<string, unknown>;
    const gebruikerId = sessie?.gebruikerId as number | null ?? null;
    const gebruikerNaam = sessie?.naam as string | null ?? null;
    const { versieLabel, categorieFilter } = req.body as { versieLabel?: string; categorieFilter?: TestCategorie[] };

    const baseUrl = (() => {
      const domain = process.env["REPLIT_DEV_DOMAIN"];
      if (domain) return `https://${domain}`;
      return "http://localhost:80";
    })();

    const cookie = req.headers["cookie"] as string | undefined;

    const runId = await startScanRun(
      { baseUrl, authCookie: cookie, categorieFilter },
      gebruikerId,
      gebruikerNaam,
      versieLabel,
    );

    res.status(202).json({ runId, bericht: "Scan gestart. Controleer status via /security-validation/scan/:id" });
  } catch (err) {
    res.status(500).json({ fout: `Kon scan niet starten: ${veiligeFoutmelding(err)}` });
  }
});

// ── Scan-runs lijst ───────────────────────────────────────────────────────────

router.get("/security-validation/scans", requireAuth, alleenHoofdbeheerder, async (req, res) => {
  const pagina = Math.max(1, parseInt(String(req.query.pagina ?? "1"), 10));
  const perPagina = 20;

  const [runs, [{ totaal }]] = await Promise.all([
    db
      .select()
      .from(securityScanRunsTable)
      .orderBy(desc(securityScanRunsTable.gestarttOp))
      .limit(perPagina)
      .offset((pagina - 1) * perPagina),
    db.select({ totaal: sql<number>`count(*)::int` }).from(securityScanRunsTable),
  ]);

  res.json({ runs, totaal, pagina, perPagina, totaalPaginas: Math.ceil(totaal / perPagina) });
});

// ── Scan-run detail ───────────────────────────────────────────────────────────

router.get("/security-validation/scans/:id", requireAuth, alleenHoofdbeheerder, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ fout: "Ongeldig ID" }); return; }

  const [run] = await db.select().from(securityScanRunsTable).where(eq(securityScanRunsTable.id, id)).limit(1);
  if (!run) { res.status(404).json({ fout: "Scan-run niet gevonden" }); return; }

  res.json(run);
});

// ── Test-resultaten per scan-run ──────────────────────────────────────────────

router.get("/security-validation/scans/:id/resultaten", requireAuth, alleenHoofdbeheerder, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ fout: "Ongeldig ID" }); return; }

  const pagina = Math.max(1, parseInt(String(req.query.pagina ?? "1"), 10));
  const perPagina = 100;
  const categorie = String(req.query.categorie ?? "");
  const uitkomst = String(req.query.uitkomst ?? "");
  const ernst = String(req.query.ernst ?? "");

  const filters = [eq(securityTestResultatenTable.scanRunId, id)];
  if (categorie && categorie !== "alle" && categorie !== "undefined") filters.push(eq(securityTestResultatenTable.categorie, categorie));
  if (uitkomst && uitkomst !== "alle" && uitkomst !== "undefined") filters.push(eq(securityTestResultatenTable.uitkomst, uitkomst));
  if (ernst && ernst !== "alle" && ernst !== "undefined") filters.push(eq(securityTestResultatenTable.ernst, ernst));

  const [resultaten, [{ totaal }]] = await Promise.all([
    db
      .select()
      .from(securityTestResultatenTable)
      .where(and(...filters))
      .orderBy(securityTestResultatenTable.id)
      .limit(perPagina)
      .offset((pagina - 1) * perPagina),
    db.select({ totaal: sql<number>`count(*)::int` }).from(securityTestResultatenTable).where(and(...filters)),
  ]);

  res.json({ resultaten, totaal, pagina, perPagina, totaalPaginas: Math.ceil(totaal / perPagina) });
});

// ── Dashboard statistieken ────────────────────────────────────────────────────

router.get("/security-validation/dashboard", requireAuth, alleenHoofdbeheerder, async (_req, res) => {
  try {
    const stats = await haalScanStats();

    const [laasteScan] = await db
      .select()
      .from(securityScanRunsTable)
      .orderBy(desc(securityScanRunsTable.gestarttOp))
      .where(eq(securityScanRunsTable.status, "voltooid"))
      .limit(1);

    const recenteScans = await db
      .select({
        id: securityScanRunsTable.id,
        gestarttOp: securityScanRunsTable.gestarttOp,
        voltooidOp: securityScanRunsTable.voltooidOp,
        scoreTotaal: securityScanRunsTable.scoreTotaal,
        geslaagd: securityScanRunsTable.geslaagd,
        mislukt: securityScanRunsTable.mislukt,
        kritiekMislukt: securityScanRunsTable.kritiekMislukt,
        releaseGeblokkeerd: securityScanRunsTable.releaseGeblokkeerd,
        status: securityScanRunsTable.status,
        versieLabel: securityScanRunsTable.versieLabel,
      })
      .from(securityScanRunsTable)
      .orderBy(desc(securityScanRunsTable.gestarttOp))
      .limit(10);

    res.json({
      totaalScenarios: stats.totaalScenarios,
      perCategorie: stats.perCategorie,
      laasteScan: laasteScan ?? null,
      recenteScans,
    });
  } catch (err) {
    res.status(500).json({ fout: `Dashboard laden mislukt: ${veiligeFoutmelding(err)}` });
  }
});

// ── Release-gate overzicht ────────────────────────────────────────────────────

router.get("/security-validation/releases", requireAuth, alleenHoofdbeheerder, async (req, res) => {
  const pagina = Math.max(1, parseInt(String(req.query.pagina ?? "1"), 10));
  const perPagina = 20;

  const [releases, [{ totaal }]] = await Promise.all([
    db
      .select()
      .from(securityReleasesTable)
      .orderBy(desc(securityReleasesTable.aangemaaktOp))
      .limit(perPagina)
      .offset((pagina - 1) * perPagina),
    db.select({ totaal: sql<number>`count(*)::int` }).from(securityReleasesTable),
  ]);

  res.json({ releases, totaal, pagina, perPagina, totaalPaginas: Math.ceil(totaal / perPagina) });
});

// ── Release goedkeuren / afwijzen ─────────────────────────────────────────────

router.post("/security-validation/releases/:id/beoordelen", requireAuth, alleenHoofdbeheerder, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ fout: "Ongeldig ID" }); return; }

  const sessie = req.session as unknown as Record<string, unknown>;
  const gebruikerNaam = sessie?.naam as string ?? "Onbekend";
  const { beslissing, opmerking } = req.body as { beslissing: "goedgekeurd" | "afgewezen"; opmerking?: string };

  if (!["goedgekeurd", "afgewezen"].includes(beslissing)) {
    res.status(400).json({ fout: "Beslissing moet 'goedgekeurd' of 'afgewezen' zijn" });
    return;
  }

  const [release] = await db.select().from(securityReleasesTable).where(eq(securityReleasesTable.id, id)).limit(1);
  if (!release) { res.status(404).json({ fout: "Release niet gevonden" }); return; }

  if (release.geblokkeerd && beslissing === "goedgekeurd") {
    res.status(409).json({ fout: "Release is geblokkeerd vanwege kritieke bevindingen. Herstel de bevindingen eerst." });
    return;
  }

  const nu = new Date();
  await db
    .update(securityReleasesTable)
    .set({
      status: beslissing,
      ...(beslissing === "goedgekeurd"
        ? { goedgekeurdDoor: gebruikerNaam, goedgekeurdOp: nu }
        : { afgewezenDoor: gebruikerNaam, afgewezenOp: nu }),
      opmerking: opmerking ?? null,
      bijgewerktOp: nu,
    })
    .where(eq(securityReleasesTable.id, id));

  await db
    .update(securityScanRunsTable)
    .set({
      releaseGoedgekeurd: beslissing === "goedgekeurd",
      releaseGoedgekeurdDoor: gebruikerNaam,
      releaseGoedgekeurdOp: nu,
      releaseOpmerking: opmerking ?? null,
      bijgewerktOp: nu,
    })
    .where(eq(securityScanRunsTable.id, release.scanRunId));

  res.json({ bericht: `Release ${beslissing}`, beslissing });
});

// ── Score-overzicht voor laastse scan ────────────────────────────────────────

router.get("/security-validation/score", requireAuth, alleenHoofdbeheerder, async (_req, res) => {
  const [run] = await db
    .select()
    .from(securityScanRunsTable)
    .where(eq(securityScanRunsTable.status, "voltooid"))
    .orderBy(desc(securityScanRunsTable.voltooidOp))
    .limit(1);

  if (!run) {
    res.json({ bericht: "Nog geen voltooide scan beschikbaar", score: null });
    return;
  }

  res.json({
    runId: run.id,
    versieLabel: run.versieLabel,
    voltooidOp: run.voltooidOp,
    scoreTotaal: run.scoreTotaal,
    releaseGeblokkeerd: run.releaseGeblokkeerd,
    categoriescores: {
      infrastructuur: run.scoreInfrastructuur,
      authenticatie: run.scoreAuthenticatie,
      autorisatie: run.scoreAutorisatie,
      apiBeveiliging: run.scoreApiBeveiliging,
      uploadBeveiliging: run.scoreUploadBeveiliging,
      malware: run.scoreMalware,
      aiBeveiliging: run.scoreAiBeveiliging,
      governance: run.scoreGovernance,
      businessLogica: run.scoreBusinessLogica,
      logging: run.scoreLogging,
      emailBeveiliging: run.scoreEmailBeveiliging,
      mobielBeveiliging: run.scoreMobielBeveiliging,
    },
  });
});

export default router;
