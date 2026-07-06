import { Router } from "express";
import { db, governanceChecksTable, governanceWachtrijTable } from "@workspace/db";
import { desc, eq, and, gte, lte, like, sql, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { haalGovernanceDashboard } from "../services/governance-engine";

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function alleenHoofdbeheerder(req: Parameters<typeof requireAuth>[0], res: Parameters<typeof requireAuth>[1], next: Parameters<typeof requireAuth>[2]) {
  const sessie = req.session as unknown as Record<string, unknown> | undefined;
  if (sessie?.rol !== "hoofdbeheerder") {
    res.status(403).json({ fout: "Alleen toegankelijk voor de hoofdbeheerder." });
    return;
  }
  next();
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

router.get("/governance/dashboard", alleenHoofdbeheerder, async (req, res) => {
  try {
    const data = await haalGovernanceDashboard();
    res.json(data);
  } catch {
    res.status(500).json({ fout: "Kon dashboard niet laden." });
  }
});

// ── Audit-log (checks) ────────────────────────────────────────────────────────

router.get("/governance/checks", alleenHoofdbeheerder, async (req, res) => {
  const pagina = Math.max(1, parseInt(req.query.pagina as string || "1", 10));
  const perPagina = 50;
  const niveau = req.query.niveau as string | undefined;
  const zoek = req.query.zoek as string | undefined;
  const van = req.query.van as string | undefined;
  const tot = req.query.tot as string | undefined;

  const where = [];
  if (niveau && niveau !== "alle") where.push(eq(governanceChecksTable.risicoNiveau, niveau));
  if (zoek) where.push(like(governanceChecksTable.route, `%${zoek}%`));
  if (van) where.push(gte(governanceChecksTable.aangemaaktOp, new Date(van)));
  if (tot) {
    const totDatum = new Date(tot);
    totDatum.setHours(23, 59, 59, 999);
    where.push(lte(governanceChecksTable.aangemaaktOp, totDatum));
  }

  const [checks, [{ totaal }]] = await Promise.all([
    db
      .select()
      .from(governanceChecksTable)
      .where(and(...(where.length ? where : [sql`true`])))
      .orderBy(desc(governanceChecksTable.aangemaaktOp))
      .limit(perPagina)
      .offset((pagina - 1) * perPagina),
    db
      .select({ totaal: sql<number>`count(*)::int` })
      .from(governanceChecksTable)
      .where(and(...(where.length ? where : [sql`true`]))),
  ]);

  res.json({ checks, totaal, pagina, perPagina, totaalPaginas: Math.ceil(totaal / perPagina) });
});

// ── Goedkeuringswachtrij ──────────────────────────────────────────────────────

router.get("/governance/wachtrij", alleenHoofdbeheerder, async (req, res) => {
  const statusFilter = (req.query.status as string) || "wacht";

  const items = await db
    .select({
      id: governanceWachtrijTable.id,
      checkId: governanceWachtrijTable.checkId,
      vereistRol: governanceWachtrijTable.vereistRol,
      aangevraagdVanRol: governanceWachtrijTable.aangevraagdVanRol,
      status: governanceWachtrijTable.status,
      goedgekeurdDoorNaam: governanceWachtrijTable.goedgekeurdDoorNaam,
      opmerking: governanceWachtrijTable.opmerking,
      afgehandeldOp: governanceWachtrijTable.afgehandeldOp,
      aangemaaktOp: governanceWachtrijTable.aangemaaktOp,
      checkMethode: governanceChecksTable.methode,
      checkRoute: governanceChecksTable.route,
      checkModule: governanceChecksTable.module,
      checkNiveau: governanceChecksTable.risicoNiveau,
      checkScore: governanceChecksTable.risicoScore,
      checkMotivatie: governanceChecksTable.motivatie,
      checkGebruikerNaam: governanceChecksTable.gebruikerNaam,
      checkRol: governanceChecksTable.rol,
    })
    .from(governanceWachtrijTable)
    .innerJoin(governanceChecksTable, eq(governanceWachtrijTable.checkId, governanceChecksTable.id))
    .where(
      statusFilter === "alle"
        ? sql`true`
        : eq(governanceWachtrijTable.status, statusFilter),
    )
    .orderBy(desc(governanceWachtrijTable.aangemaaktOp))
    .limit(100);

  res.json(items);
});

// ── Goedkeuren ────────────────────────────────────────────────────────────────

router.post("/governance/wachtrij/:id/goedkeuren", alleenHoofdbeheerder, async (req, res) => {
  const id = parseInt(req.params["id"] as string, 10);
  const { opmerking } = req.body as { opmerking?: string };
  const sessie = req.session as unknown as Record<string, unknown>;

  const [bestaand] = await db
    .select()
    .from(governanceWachtrijTable)
    .where(eq(governanceWachtrijTable.id, id));

  if (!bestaand) { res.status(404).json({ fout: "Wachtrij-item niet gevonden." }); return; }
  if (bestaand.status !== "wacht" && bestaand.status !== "ter_beoordeling") {
    res.status(409).json({ fout: "Dit item is al afgehandeld." });
    return;
  }

  await db
    .update(governanceWachtrijTable)
    .set({
      status: "goedgekeurd",
      goedgekeurdDoorId: sessie.userId as number,
      goedgekeurdDoorNaam: (sessie.naam ?? sessie.gebruikerNaam) as string | null,
      opmerking: opmerking ?? null,
      afgehandeldOp: new Date(),
    })
    .where(eq(governanceWachtrijTable.id, id));

  res.json({ ok: true });
});

// ── Afwijzen ──────────────────────────────────────────────────────────────────

router.post("/governance/wachtrij/:id/afwijzen", alleenHoofdbeheerder, async (req, res) => {
  const id = parseInt(req.params["id"] as string, 10);
  const { opmerking } = req.body as { opmerking?: string };
  const sessie = req.session as unknown as Record<string, unknown>;

  const [bestaand] = await db
    .select()
    .from(governanceWachtrijTable)
    .where(eq(governanceWachtrijTable.id, id));

  if (!bestaand) { res.status(404).json({ fout: "Wachtrij-item niet gevonden." }); return; }
  if (bestaand.status !== "wacht" && bestaand.status !== "ter_beoordeling") {
    res.status(409).json({ fout: "Dit item is al afgehandeld." });
    return;
  }

  await db
    .update(governanceWachtrijTable)
    .set({
      status: "afgewezen",
      goedgekeurdDoorId: sessie.userId as number,
      goedgekeurdDoorNaam: (sessie.naam ?? sessie.gebruikerNaam) as string | null,
      opmerking: opmerking ?? null,
      afgehandeldOp: new Date(),
    })
    .where(eq(governanceWachtrijTable.id, id));

  res.json({ ok: true });
});

// ── Statistieken per module ───────────────────────────────────────────────────

router.get("/governance/statistieken", alleenHoofdbeheerder, async (_req, res) => {
  const vandaag = new Date();
  vandaag.setDate(vandaag.getDate() - 30);

  const [perModule, perNiveau, geblokkeerdeActies] = await Promise.all([
    db
      .select({
        module: governanceChecksTable.module,
        aantal: sql<number>`count(*)::int`,
        gemScore: sql<number>`avg(risico_score)::int`,
      })
      .from(governanceChecksTable)
      .where(gte(governanceChecksTable.aangemaaktOp, vandaag))
      .groupBy(governanceChecksTable.module)
      .orderBy(desc(sql`count(*)`))
      .limit(20),
    db
      .select({
        niveau: governanceChecksTable.risicoNiveau,
        aantal: sql<number>`count(*)::int`,
      })
      .from(governanceChecksTable)
      .where(gte(governanceChecksTable.aangemaaktOp, vandaag))
      .groupBy(governanceChecksTable.risicoNiveau),
    db
      .select()
      .from(governanceChecksTable)
      .where(and(gte(governanceChecksTable.aangemaaktOp, vandaag), eq(governanceChecksTable.geblokkeerd, true)))
      .orderBy(desc(governanceChecksTable.aangemaaktOp))
      .limit(20),
  ]);

  res.json({ perModule, perNiveau, geblokkeerdeActies });
});

export default router;
